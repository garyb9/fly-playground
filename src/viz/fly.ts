// Procedural low-poly fly: a `THREE.Group` assembled from scaled primitives plus
// a per-frame `update` that flaps the wings, places the body from a `Pose`, and
// tilts it with thrust. `flapFrequency` is the only pure/tested piece.

import * as THREE from "three";
import type { Pose, Readouts } from "../body/types";
import { CONFIG } from "../app/config";
import { activePalette, applyTheme } from "./palette";
import type { Theme } from "../ui/controls";

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
    opacity: 0.18,
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
  private elapsed = 0;

  constructor(theme: Theme = CONFIG.aesthetic.theme) {
    this.object3d = new THREE.Group();
    this.tilt = new THREE.Group();
    this.object3d.add(this.tilt);

    this.emberLight = new THREE.PointLight(0xffb25a, 6, 12, 2);
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

    for (const sign of [-1, 1] as const) {
      const eye = new THREE.Mesh(sphere, accent);
      eye.scale.set(0.13, 0.16, 0.16);
      eye.position.set(0.52, 0.08, sign * 0.14);
      this.tilt.add(eye);
    }

    const wingGeom = new THREE.PlaneGeometry(1.4, 0.6);

    this.wingL = new THREE.Group();
    this.wingL.position.set(0.02, 0.2, 0.12);
    const wingMeshL = new THREE.Mesh(wingGeom, wings);
    wingMeshL.position.set(0, 0, 0.7); // pivot at the root edge
    wingMeshL.rotation.x = Math.PI / 2;
    this.wingL.add(wingMeshL);
    this.tilt.add(this.wingL);

    this.wingR = new THREE.Group();
    this.wingR.position.set(0.02, 0.2, -0.12);
    const wingMeshR = new THREE.Mesh(wingGeom, wings);
    wingMeshR.position.set(0, 0, -0.7);
    wingMeshR.rotation.x = Math.PI / 2;
    this.wingR.add(wingMeshR);
    this.tilt.add(this.wingR);
  }

  update(readouts: Readouts, pose: Pose, dt: number): void {
    this.elapsed += dt;

    const f = flapFrequency({
      wing_l: readouts.wing_l ?? 0,
      wing_r: readouts.wing_r ?? 0,
    });
    const flap = CONFIG.aesthetic.FLAP_AMP * Math.sin(this.elapsed * 2 * Math.PI * f);
    this.wingL.rotation.x = flap;
    this.wingR.rotation.x = -flap;

    this.object3d.position.set(pose.position.x, pose.position.y, pose.position.z);
    this.object3d.quaternion.set(
      pose.orientation.x,
      pose.orientation.y,
      pose.orientation.z,
      pose.orientation.w,
    );

    // Nose pitches down slightly as thrust rises (rotation about the lateral z axis).
    this.tilt.rotation.z = -(readouts.thrust ?? 0) * 0.18;
  }

  /** Recolour the fly's materials for `theme` (they carry `userData.themeKey`). */
  setTheme(theme: Theme): void {
    applyTheme(this.object3d, theme);
  }
}
