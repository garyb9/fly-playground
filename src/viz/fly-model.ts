import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { Theme } from "../ui/controls";

/** Authored poses on a scanned female visual body, not a musculoskeletal sim. */
export interface FlyMotion {
  legs?: Record<string, number>;
  supported: boolean;
  speed: number;
}

interface Cache {
  users: number;
  ready: Promise<THREE.Group[]>;
}
let cache: Cache | undefined;

function disposeTemplates(roots: THREE.Group[]): void {
  for (const root of roots) {
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      o.geometry.dispose();
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
    });
  }
}

/** One fetch/decode per LOD, shared geometry, independent hierarchy/materials. */
export function acquireFlyModel(): {
  ready: Promise<THREE.Group[]>;
  release(): void;
} {
  if (!cache) {
    const loader = new GLTFLoader();
    cache = {
      users: 0,
      ready: Promise.allSettled(
        ["near", "far"].map((level) =>
          loader.loadAsync(`${import.meta.env.BASE_URL}models/fly/fly-${level}.glb`),
        ),
      ).then((results) => {
        const roots = results.flatMap((r) => (r.status === "fulfilled" ? [r.value.scene] : []));
        const failed = results.find((r) => r.status === "rejected");
        if (failed?.status === "rejected") {
          disposeTemplates(roots);
          throw failed.reason;
        }
        return roots;
      }),
    };
  }
  const entry = cache;
  entry.users++;
  let released = false;
  return {
    ready: entry.ready,
    release() {
      if (released) return;
      released = true;
      if (--entry.users === 0) {
        if (cache === entry) cache = undefined;
        void entry.ready.then(disposeTemplates, () => {});
      }
    },
  };
}

interface Joint {
  node: THREE.Object3D;
  rest: THREE.Quaternion;
  side: number;
  leg: number;
  segment: string;
}

export class AnatomicalFly {
  readonly root = new THREE.LOD();
  readonly center = new THREE.Vector3();
  private readonly joints: Joint[] = [];
  private readonly materials = new Map<string, THREE.MeshStandardMaterial>();
  private readonly rotation = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();
  private readonly flapAxis = new THREE.Vector3(1, 0, 0);
  private flight = 1;
  private stride = 0;

  constructor(templates: THREE.Group[]) {
    this.root.name = "anatomical-fly";
    templates.forEach((template, index) => {
      const model = template.clone(true);
      model.traverse((node) => {
        if (node.userData.cameraCenter) this.center.fromArray(node.userData.cameraCenter);
        if (node instanceof THREE.Mesh) {
          const original = node.material as THREE.MeshStandardMaterial;
          let mat = this.materials.get(original.name);
          if (!mat) {
            mat = original.clone();
            mat.emissive.set(0xffb25a);
            mat.emissiveIntensity = original.name === "cuticle" ? 0.035 : 0;
            if (original.name === "wing") {
              mat.opacity = 0.28;
              mat.depthWrite = false;
              mat.side = THREE.DoubleSide;
              mat.forceSinglePass = true;
            }
            this.materials.set(original.name, mat);
          }
          node.material = mat;
          node.castShadow = false;
        }
        if (
          /^[lr]_wing$/.test(node.name) ||
          /^[lr][fmh]_(coxa|trochanterfemur|tibia|tarsus1)$/.test(node.name)
        ) {
          this.joints.push({
            node,
            rest: node.quaternion.clone(),
            side: node.name.startsWith("l") ? 1 : -1,
            leg: "fmh".indexOf(node.name[1]!),
            segment: node.name.split("_")[1]!,
          });
        }
      });
      // At 55° FOV the far model suffices once the body occupies ~100px at 1k height.
      this.root.addLevel(model, index === 0 ? 0 : 14, 0.15);
    });
  }

  setStyle(theme: Theme, identity: string | null): void {
    const cuticle = this.materials.get("cuticle")!;
    cuticle.color.set(theme === "dark" ? 0xffe3bb : 0xffffff);
    cuticle.emissive.set(identity ?? 0xffb25a);
    cuticle.emissiveIntensity = theme === "dark" ? 0.035 : 0.008;
    this.materials.get("eye")!.color.set(theme === "dark" ? 0x8e2735 : 0x751925);
    this.materials.get("wing")!.color.set(theme === "dark" ? 0xc7dce3 : 0x899fa8);
  }

  update(flap: number, dt: number, motion?: FlyMotion): void {
    const target = motion?.supported ? 0 : 1;
    this.flight += (target - this.flight) * (1 - Math.exp(-dt * 12));
    const walking = motion?.supported ? Math.min(1, motion.speed / 0.8) : 0;
    this.stride += dt * walking * 2 * Math.PI * 5;
    for (const joint of this.joints) {
      const { node, rest, side, segment, leg } = joint;
      if (segment === "wing") {
        // The source's rest wings point back; unfold about the thorax's Z axis.
        this.euler.set(0, 0, -side * this.flight * 1.15);
        node.quaternion.copy(rest).premultiply(this.rotation.setFromEuler(this.euler));
        this.rotation.setFromAxisAngle(this.flapAxis, flap * side * this.flight);
        node.quaternion.premultiply(this.rotation);
      } else {
        const key = `leg_${side > 0 ? "l" : "r"}${"fmh"[leg]}`;
        const activity = Math.max(0, Math.min(1, motion?.legs?.[key] ?? 0));
        // Alternating tripod motion is cosmetic and never translates the body.
        const phase = this.stride + (leg === 1 ? Math.PI : 0) + (side < 0 ? Math.PI : 0);
        const swing = Math.sin(phase) * walking;
        const lift = Math.max(0, Math.cos(phase)) * walking;
        this.euler.set(
          segment === "coxa" ? side * swing * 0.12 : 0,
          segment === "trochanterfemur"
            ? lift * -0.22 + this.flight * 0.28 - activity * 0.55
            : segment === "tibia"
              ? lift * 0.25 + this.flight * 0.32 + activity * 0.85
              : 0,
          segment === "coxa" ? side * swing * 0.18 : 0,
        );
        node.quaternion.copy(rest).multiply(this.rotation.setFromEuler(this.euler));
      }
    }
  }

  dispose(): void {
    this.root.removeFromParent();
    for (const material of this.materials.values()) material.dispose();
  }
}
