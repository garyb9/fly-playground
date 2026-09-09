import type { Vec3, Aabb } from "../body/types";

export function rayAabb(origin: Vec3, dir: Vec3, box: Aabb): number | null {
  let tmin = -Infinity;
  let tmax = Infinity;
  for (const ax of ["x", "y", "z"] as const) {
    const o = origin[ax];
    const d = dir[ax];
    const lo = box.min[ax];
    const hi = box.max[ax];
    if (Math.abs(d) < 1e-12) {
      if (o < lo || o > hi) return null;
      continue;
    }
    let t1 = (lo - o) / d;
    let t2 = (hi - o) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  return Math.max(tmin, 0);
}

export function nearestHit(origin: Vec3, dirs: Vec3[], boxes: Aabb[]): number {
  let best = Infinity;
  for (const dir of dirs) {
    for (const b of boxes) {
      const t = rayAabb(origin, dir, b);
      if (t !== null && t < best) best = t;
    }
  }
  return best;
}
