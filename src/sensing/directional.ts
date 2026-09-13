import { rayAabb } from "./raycast";
import { add, scale, norm, cross, dot, sub, type Pose, type WorldQuery } from "../body/types";

export interface DirectionalState {
  distances: number[];
  luminance: number[];
}
export const initDirectional = (): DirectionalState => ({ distances: [], luminance: [] });

/** Coarse body-centered sectors. Hemisphere currents are declared proxies;
 * neither soma-side selection nor these rays reconstruct retinal columns. */
export function directional(pose: Pose, world: WorldQuery, dt: number, prev: DirectionalState) {
  const right = norm(cross(pose.forward, pose.up));
  const distances: number[] = [],
    luminance: number[] = [];
  const loom = [0, 0],
    flow = [0, 0];
  for (let i = 0; i < 12; i++) {
    const angle = -Math.PI + ((i + 0.5) * Math.PI) / 6;
    const dir = norm(add(scale(pose.forward, Math.cos(angle)), scale(right, Math.sin(angle))));
    let distance = 100;
    // Exit distance to the room boundary: the existing near-hit routine treats
    // an origin inside an AABB as distance zero, so compute this explicitly.
    for (const ax of ["x", "y", "z"] as const) {
      if (Math.abs(dir[ax]) > 1e-6) {
        const edge = dir[ax] > 0 ? world.bounds.max[ax] : world.bounds.min[ax];
        distance = Math.min(distance, Math.max(0, (edge - pose.position[ax]) / dir[ax]));
      }
    }
    for (const box of world.aabbs) {
      const hit = rayAabb(pose.position, dir, box);
      if (hit !== null) distance = Math.min(distance, hit);
    }
    distances.push(distance);
    const point = add(pose.position, scale(dir, distance));
    // Coarse surface texture gives motion contrast even with no point lights.
    let light =
      0.4 + 0.15 * Math.sin(point.x * 3) * Math.cos(point.z * 3) + 0.1 * Math.sin(point.y * 3);
    for (const source of world.lights) {
      const to = sub(source.pos, pose.position);
      light += (source.intensity * Math.max(0, dot(norm(to), dir))) / Math.max(1, dot(to, to));
    }
    luminance.push(Math.min(2, Math.max(0, light)));
    const side = angle < 0 ? 0 : 1;
    if (prev.distances.length) {
      const expansion = Math.max(
        0,
        (Math.atan(0.5 / Math.max(0.05, distance)) -
          Math.atan(0.5 / Math.max(0.05, prev.distances[i]!))) /
          dt,
      );
      loom[side] = Math.max(loom[side]!, Math.min(2, expansion));
    }
  }
  if (prev.luminance.length)
    for (let i = 0; i < 12; i++) {
      const next = (i + 1) % 12;
      const side = i < 6 ? 0 : 1;
      const motion = prev.luminance[i]! * luminance[next]! - prev.luminance[next]! * luminance[i]!;
      flow[side] = flow[side]! + motion / Math.max(dt, 0.001);
    }
  return {
    looming_l: loom[0]!,
    looming_r: loom[1]!,
    flow_l: Math.min(1, Math.max(0, flow[0]! * 0.5)),
    flow_r: Math.min(1, Math.max(0, -flow[1]! * 0.5)),
    state: { distances, luminance },
  };
}
