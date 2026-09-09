// Scene data + types for the playground world. Framework-free: only plain
// `Vec3`/`Aabb` from `body/types.ts`, never `three`. `builders.ts` turns this
// into a `THREE.Group`.

import type { Vec3, Aabb } from "./body/types";
import { v } from "./body/types";

export interface SceneObject {
  id: string;
  kind: "box" | "sphere" | "torus";
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  material: string;
}

export interface SceneLight {
  position: Vec3;
  color: number;
  intensity: number;
}

export interface SceneConfig {
  bounds: Aabb;
  objects: SceneObject[];
  lights: SceneLight[];
  fly: { start: Vec3; heading: number };
}

export const SCENE: SceneConfig = {
  bounds: { min: v(-16, 0, -16), max: v(16, 14, 16) },
  fly: { start: v(0, 4, 0), heading: 0 },
  objects: [
    // Squarely on the +X cruise path — the escape trigger.
    {
      id: "obj-0",
      kind: "box",
      position: v(9, 4, 0),
      rotation: v(0, 0, 0),
      scale: v(1.2, 1.2, 1.2),
      material: "clay",
    },
    {
      id: "obj-1",
      kind: "torus",
      position: v(3, 3, -5),
      rotation: v(0, 0, 0),
      scale: v(1, 0.35, 1),
      material: "sage",
    },
    {
      id: "obj-2",
      kind: "sphere",
      position: v(-4, 6, 4),
      rotation: v(0, 0, 0),
      scale: v(1, 1, 1),
      material: "ochre",
    },
  ],
  lights: [
    { position: v(6, 10, 6), color: 0xfff1d0, intensity: 60 },
    { position: v(-8, 7, -6), color: 0xcfe0ff, intensity: 35 },
  ],
};
