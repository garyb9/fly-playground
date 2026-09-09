// Procedural low-poly fly: a `THREE.Group` assembled from scaled primitives plus
// a per-frame `update` that flaps the wings, places the body from a `Pose`, and
// tilts it with thrust. `flapFrequency` is the only pure/tested piece.

import * as THREE from "three";
import type { Pose, Readouts } from "../body/types";
import { CONFIG } from "../app/config";
import { PALETTE } from "./palette";

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Wing-beat frequency in Hz, mean of the two wing readouts mapped into
 * `[FLAP_MIN, FLAP_MAX]` with the input clamped to `[0, 1]`. */
export function flapFrequency(readouts: { wing_l: number; wing_r: number }): number {
  const { FLAP_MIN, FLAP_MAX } = CONFIG.aesthetic;
  return lerp(FLAP_MIN, FLAP_MAX, clamp01((readouts.wing_l + readouts.wing_r) / 2));
}

function bodyMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: PALETTE.flyBody,
    roughness: 0.9,
    metalness: 0,
    flatShading: true,
  });
}

function accentMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: PALETTE.flyAccent,
    roughness: 0.6,
    metalness: 0,
    flatShading: true,
  });
}

function wingMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: PALETTE.flyAccent,
    roughness: 0.4,
    metalness: 0,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
    flatShading: true,
  });
}

export class Fly {
  /** Root object — caller adds this to the scene. Local +x is the fly's nose. */
  readonly object3d: THREE.Group;

  private readonly tilt: THREE.Group;
  private readonly wingL: THREE.Group;
  private readonly wingR: THREE.Group;
  private elapsed = 0;

  constructor() {
    this.object3d = new THREE.Group();
    this.tilt = new THREE.Group();
    this.object3d.add(this.tilt);

    const body = bodyMaterial();
    const accent = accentMaterial();

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
    const wingMeshL = new THREE.Mesh(wingGeom, wingMaterial());
    wingMeshL.position.set(0, 0, 0.7); // pivot at the root edge
    wingMeshL.rotation.x = Math.PI / 2;
    this.wingL.add(wingMeshL);
    this.tilt.add(this.wingL);

    this.wingR = new THREE.Group();
    this.wingR.position.set(0.02, 0.2, -0.12);
    const wingMeshR = new THREE.Mesh(wingGeom, wingMaterial());
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
}
