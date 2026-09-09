// Scene → collision world. Framework-free: turns each `SceneObject` into an
// axis-aligned bounding box (`position ± half-extents`) and passes the scene
// bounds through unchanged. No `three` here — the app loop and the body only
// ever see plain `Vec3` / `Aabb`.

import type { Vec3, Aabb, WorldQuery } from "../body/types";
import { v, add, sub } from "../body/types";
import type { SceneConfig, SceneObject } from "../scene.config";

/** Half-extents of an object's world AABB, by kind. */
function halfExtents(obj: SceneObject): Vec3 {
  const s = obj.scale;
  switch (obj.kind) {
    case "box":
      return v(s.x, s.y, s.z);
    case "sphere":
      return v(s.x, s.x, s.x);
    case "torus":
      // Outer radius in the ring plane = tube-centre radius + tube radius.
      return v(s.x + s.z, s.z, s.x + s.z);
  }
}

function aabbOf(obj: SceneObject): Aabb {
  const h = halfExtents(obj);
  return { min: sub(obj.position, h), max: add(obj.position, h) };
}

export function worldQuery(scene: SceneConfig): WorldQuery {
  return {
    aabbs: scene.objects.map(aabbOf),
    bounds: scene.bounds,
    lights: scene.lights.map((l) => ({ pos: l.position, intensity: l.intensity })),
  };
}
