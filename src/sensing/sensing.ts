import type { Pose, WorldQuery, Vec3, Aabb } from "../body/types";
import { add, sub, scale, dot, len, norm, cross } from "../body/types";
import type { RoleTable } from "../sim/roles";
import { nearestHit } from "./raycast";
import { CONFIG } from "../app/config";

export interface SensingState {
  loomTheta: number;
  prox: number;
  loom: number;
}
export const initSensingState = (): SensingState => ({ loomTheta: 0, prox: 0, loom: 0 });

const onePole = (prev: number, x: number, dt: number, tau: number): number =>
  prev + (x - prev) * (1 - Math.exp(-dt / tau));

function aabbCenterRadius(b: Aabb): { c: Vec3; r: number } {
  const c = scale(add(b.min, b.max), 0.5);
  const r = 0.5 * Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z);
  return { c, r };
}

export function sample(
  pose: Pose,
  world: WorldQuery,
  dt: number,
  prev: SensingState,
  rt: RoleTable,
): { stimulus: Float32Array; state: SensingState } {
  const { EPS, PROX_MAX, LOOM_CONE_DEG, TAU_PROX, TAU_LOOM } = CONFIG.sensing;
  const right = norm(cross(pose.forward, pose.up));
  const dirs: Vec3[] = [
    pose.forward,
    scale(pose.forward, -1),
    pose.up,
    scale(pose.up, -1),
    right,
    scale(right, -1),
  ];

  // walls of `bounds` handled by soft-bounds, not startle
  const minDist = nearestHit(pose.position, dirs, world.aabbs);
  const proxRaw = Math.min(PROX_MAX, 1 / Math.max(minDist === Infinity ? 1e6 : minDist, EPS));
  const prox = onePole(prev.prox, proxRaw, dt, TAU_PROX);

  const cosCone = Math.cos((LOOM_CONE_DEG * Math.PI) / 180);
  let theta = 0;
  let bestDist = Infinity;
  for (const b of world.aabbs) {
    const { c, r } = aabbCenterRadius(b);
    const toC = sub(c, pose.position);
    const d = len(toC) || 1e-6;
    const fwdDot = dot(norm(toC), pose.forward);
    if (d < bestDist && fwdDot >= cosCone) {
      bestDist = d;
      theta = 2 * Math.atan(r / Math.max(d, 1e-3));
    }
  }
  const loomRaw = Math.max(0, (theta - prev.loomTheta) / Math.max(dt, 1e-6));
  const loom = onePole(prev.loom, loomRaw, dt, TAU_LOOM);

  const stimulus = new Float32Array(rt.inputOrder.length);
  stimulus[rt.input.proximity!] = prox;
  stimulus[rt.input.looming!] = loom;
  return { stimulus, state: { loomTheta: theta, prox, loom } };
}
