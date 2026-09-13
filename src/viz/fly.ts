// Articulated NeuroMechFly visual shell, with a synchronous procedural fallback.

import * as THREE from "three";
import type { Pose, Readouts } from "../body/types";
import { CONFIG } from "../app/config";
import { activePalette, applyTheme } from "./palette";
import type { Theme } from "../ui/controls";
import { acquireFlyModel, AnatomicalFly } from "./fly-model";

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Wing-beat frequency in Hz, mean of the two wing readouts mapped into
 * `[FLAP_MIN, FLAP_MAX]` with the input clamped to `[0, 1]`. */
export function flapFrequency(readouts: { wing_l: number; wing_r: number }): number {
  const { FLAP_MIN, FLAP_MAX } = CONFIG.aesthetic;
  return lerp(FLAP_MIN, FLAP_MAX, clamp01((readouts.wing_l + readouts.wing_r) / 2));
}

// The fly is the only warm light in the frame (§6.5): a dark matte body that
// always carries a warm coal (`emissive: ember`) plus a parented `PointLight`,
// so obstacles it passes catch an amber wash on one side.
function bodyMaterial(theme: Theme): THREE.MeshStandardMaterial {
  const pal = activePalette(theme);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x1a1614,
    emissive: new THREE.Color(pal.flyBody),
    emissiveIntensity: 0.25,
    roughness: 0.9,
    metalness: 0,
    flatShading: true,
  });
  mat.userData.emissiveKey = "flyBody";
  return mat;
}

function accentMaterial(theme: Theme): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: activePalette(theme).flyAccent,
    emissive: new THREE.Color(activePalette(theme).flyAccent),
    emissiveIntensity: 0.35,
    roughness: 0.6,
    metalness: 0,
    flatShading: true,
  });
  mat.userData.themeKey = "flyAccent";
  mat.userData.emissiveKey = "flyAccent";
  return mat;
}

function wingMaterial(theme: Theme): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: activePalette(theme).flyAccent,
    roughness: 0.4,
    metalness: 0,
    transparent: true,
    opacity: 0.14,
    side: THREE.DoubleSide,
    depthWrite: false,
    flatShading: true,
  });
  mat.userData.themeKey = "flyAccent";
  return mat;
}

export class Fly {
  /** Root object — caller adds this to the scene. Local +x is the fly's nose. */
  readonly object3d: THREE.Group;

  /** Warm ember parented to the body — Task 12 pulses it on escape. */
  readonly emberLight: THREE.PointLight;

  private readonly tilt: THREE.Group;
  private readonly wingL: THREE.Group;
  private readonly wingR: THREE.Group;
  private readonly legPivots: { key: string; pivot: THREE.Group }[] = [];
  private elapsed = 0;
  private identityColor: string | null = null;
  private readonly bodyCenter = new THREE.Vector3();
  private readonly fallback = new THREE.Group();
  private anatomy: AnatomicalFly | null = null;
  private releaseModel: (() => void) | null = null;
  private disposed = false;
  private theme: Theme;
  readonly ready: Promise<void>;

  constructor(
    theme: Theme = CONFIG.aesthetic.theme,
    model: "anatomical" | "procedural" = "anatomical",
  ) {
    this.theme = theme;
    this.object3d = new THREE.Group();
    this.tilt = new THREE.Group();
    this.object3d.add(this.tilt);

    this.emberLight = new THREE.PointLight(0xffb25a, 1.2, 5, 2);
    this.object3d.add(this.emberLight);

    const body = bodyMaterial(theme);
    const accent = accentMaterial(theme);
    const wings = wingMaterial(theme);

    const sphere = new THREE.SphereGeometry(0.5, 16, 12);

    const thorax = new THREE.Mesh(sphere, body);
    thorax.scale.set(0.55, 0.5, 0.5);
    this.tilt.add(thorax);

    const abdomen = new THREE.Mesh(sphere, body);
    abdomen.scale.set(0.85, 0.42, 0.42);
    abdomen.position.set(-0.5, -0.02, 0);
    this.tilt.add(abdomen);

    const head = new THREE.Mesh(sphere, body);
    head.scale.set(0.34, 0.34, 0.34);
    head.position.set(0.42, 0.05, 0);
    this.tilt.add(head);
    const bodyBounds = new THREE.Box3();
    for (const mesh of [thorax, abdomen, head]) bodyBounds.expandByObject(mesh);
    bodyBounds.getCenter(this.bodyCenter);

    for (const sign of [-1, 1] as const) {
      const eye = new THREE.Mesh(sphere, accent);
      eye.scale.set(0.13, 0.16, 0.16);
      eye.position.set(0.52, 0.08, sign * 0.14);
      this.tilt.add(eye);
    }

    // ~30% smaller than the original 1.4 x 0.6 (T2 — wings read too large/opaque).
    // Rounded, tapered membranes with a visible leading vein.
    const outline = new THREE.Shape();
    outline.moveTo(-0.1, -0.2);
    outline.bezierCurveTo(-0.48, -0.18, -0.53, 0.13, -0.3, 0.2);
    outline.bezierCurveTo(0.05, 0.27, 0.48, 0.17, 0.49, 0);
    outline.bezierCurveTo(0.42, -0.15, 0.06, -0.2, -0.1, -0.2);
    const wingGeom = new THREE.ShapeGeometry(outline, 16);
    wings.opacity = 0.3;
    const legMaterial = new THREE.MeshStandardMaterial({ color: 0x60554a, roughness: 0.8 });
    const segment = (
      from: THREE.Vector3,
      to: THREE.Vector3,
      radius: number,
      parent: THREE.Object3D = this.tilt,
    ) => {
      const direction = to.clone().sub(from);
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 0.6, radius, direction.length(), 6),
        legMaterial,
      );
      mesh.position.copy(from).add(to).multiplyScalar(0.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
      parent.add(mesh);
    };
    for (const side of [-1, 1]) {
      for (let leg = 0; leg < 3; leg++) {
        const x = 0.17 - leg * 0.22;
        const root = new THREE.Vector3(x, -0.12, side * 0.15);
        const knee = new THREE.Vector3(x + (1 - leg) * 0.12, -0.31, side * 0.38);
        const foot = new THREE.Vector3(x + (1 - leg) * 0.23, -0.46, side * 0.28);
        const pivot = new THREE.Group();
        pivot.position.copy(root);
        this.tilt.add(pivot);
        this.legPivots.push({ key: `leg_${side < 0 ? "l" : "r"}${"fmh"[leg]}`, pivot });
        segment(new THREE.Vector3(), knee.clone().sub(root), 0.018, pivot);
        segment(knee.clone().sub(root), foot.clone().sub(root), 0.012, pivot);
      }
      segment(
        new THREE.Vector3(0.5, 0.12, side * 0.07),
        new THREE.Vector3(0.72, 0.22, side * 0.14),
        0.013,
      );
      const haltere = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 6), accent);
      haltere.position.set(-0.19, 0.07, side * 0.29);
      this.tilt.add(haltere);
    }
    const wingHalf = 0.2; // membrane touches the root along its actual span axis

    this.wingL = new THREE.Group();
    this.wingL.position.set(0.02, 0.2, 0.12);
    const wingMeshL = new THREE.Mesh(wingGeom, wings);
    wingMeshL.position.set(0, 0, wingHalf); // pivot at the root edge
    wingMeshL.rotation.x = Math.PI / 2;
    this.wingL.add(wingMeshL);
    this.tilt.add(this.wingL);

    this.wingR = new THREE.Group();
    this.wingR.position.set(0.02, 0.2, -0.12);
    const wingMeshR = new THREE.Mesh(wingGeom, wings);
    wingMeshR.position.set(0, 0, -wingHalf);
    wingMeshR.rotation.x = Math.PI / 2;
    this.wingR.add(wingMeshR);
    this.tilt.add(this.wingR);
    this.fallback.name = "procedural-fallback";
    this.fallback.add(...this.tilt.children.slice());
    this.tilt.add(this.fallback);
    this.object3d.userData.modelStatus = "procedural";
    this.ready = Promise.resolve();
    if (model === "anatomical" && typeof window !== "undefined") {
      this.object3d.userData.modelStatus = "loading";
      const asset = acquireFlyModel();
      this.releaseModel = asset.release;
      this.ready = asset.ready
        .then((templates) => {
          if (this.disposed) return;
          this.anatomy = new AnatomicalFly(templates);
          this.anatomy.setStyle(this.theme, this.identityColor);
          this.tilt.add(this.anatomy.root);
          this.bodyCenter.copy(this.anatomy.center);
          this.fallback.visible = false;
          this.object3d.userData.modelStatus = "anatomical";
        })
        .catch((error: unknown) => {
          asset.release();
          this.releaseModel = null;
          if (this.disposed) return;
          this.object3d.userData.modelStatus = "fallback";
          console.warn("Fly body asset unavailable; using procedural body.", error);
        });
    }
  }

  update(readouts: Readouts, pose: Pose, dt: number, grounded = false, speed = 0): void {
    this.elapsed += dt;

    const f = flapFrequency({
      wing_l: readouts.power_l ?? readouts.wing_l ?? 0,
      wing_r: readouts.power_r ?? readouts.wing_r ?? 0,
    });
    const flap =
      (grounded ? 0 : CONFIG.aesthetic.FLAP_AMP) * Math.sin(this.elapsed * 2 * Math.PI * f);
    this.wingL.rotation.x = flap;
    this.wingR.rotation.x = -flap;
    this.anatomy?.update(flap, dt, { supported: grounded, speed, legs: readouts });
    for (const { key, pivot } of this.legPivots)
      pivot.rotation.z = -Math.max(0, Math.min(1, readouts[key] ?? 0)) * 0.7;

    this.object3d.position.set(pose.position.x, pose.position.y, pose.position.z);
    this.object3d.quaternion.set(
      pose.orientation.x,
      pose.orientation.y,
      pose.orientation.z,
      pose.orientation.w,
    );

    // Nose pitches down slightly as thrust rises (rotation about the lateral z axis).
    this.tilt.rotation.z = grounded ? 0 : -(readouts.thrust ?? 0) * 0.18;
  }

  /** Cosmetic traits only: physics and connectome remain unchanged. */
  randomizeFeatures(color: string, rng = Math.random): void {
    this.identityColor = color;
    // Preserve support height while varying the silhouette modestly.
    this.tilt.scale.set(0.95 + rng() * 0.1, 1, 0.95 + rng() * 0.1);
    const span = 0.8 + rng() * 0.4;
    this.wingL.scale.set(1, 1, span);
    this.wingR.scale.set(1, 1, span);
    this.elapsed = rng() * 10;
    this.applyIdentity();
    this.anatomy?.setStyle(this.theme, this.identityColor);
  }
  private applyIdentity(): void {
    if (!this.identityColor) return;
    const color = new THREE.Color(this.identityColor);
    this.emberLight.color.copy(color);
    this.object3d.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (!(material instanceof THREE.MeshStandardMaterial)) continue;
        if (material.userData.themeKey === "flyAccent") {
          material.color.copy(color);
          material.emissive.copy(color);
        } else if (material.userData.emissiveKey === "flyBody") {
          material.color.copy(color).multiplyScalar(0.45);
          material.emissive.copy(color);
        }
      }
    });
  }

  /** Stable body center, excluding flapping wings; includes pose, tilt and render bob. */
  cameraTarget(out: THREE.Vector3): THREE.Vector3 {
    return this.tilt.localToWorld(out.copy(this.bodyCenter));
  }

  /** Recolour the fly's materials for `theme` (they carry `userData.themeKey`). */
  setTheme(theme: Theme): void {
    this.theme = theme;
    applyTheme(this.object3d, theme);
    this.applyIdentity();
    this.anatomy?.setStyle(theme, this.identityColor);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.anatomy?.dispose();
    this.releaseModel?.();
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.fallback.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      geometries.add(o.geometry);
      for (const material of Array.isArray(o.material) ? o.material : [o.material])
        materials.add(material);
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    this.object3d.removeFromParent();
    this.object3d.clear();
  }
}
