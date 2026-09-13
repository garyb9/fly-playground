import type { Pose, WorldQuery, Vec3, Aabb } from "../body/types";
import { add, sub, scale, dot, len, norm, cross } from "../body/types";
import type { RoleTable } from "../sim/roles";
import { nearestHit } from "./raycast";
import { CONFIG } from "../app/config";

export interface SensingState {
  initialized?: boolean;
  loomTheta: number;
  prox: number;
  loom: number;
  lightL: number;
  lightR: number;
  windL: number;
  windR: number;
  windPhase: number;
}
export const initSensingState = (): SensingState => ({
  loomTheta: 0,
  prox: 0,
  loom: 0,
  lightL: 0,
  lightR: 0,
  windL: 0,
  windR: 0,
  windPhase: 0,
});

const onePole = (prev: number, x: number, dt: number, tau: number): number =>
  prev + (x - prev) * (1 - Math.exp(-dt / tau));

const rotY = (vec: Vec3, ang: number): Vec3 => {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return { x: c * vec.x + s * vec.z, y: vec.y, z: -s * vec.x + c * vec.z };
};

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
  const { EPS2, LIGHT_MAX, TAU_LIGHT, EYE_SPLAY, WIND, WIND_SPEED, WIND_TURN_HZ, TAU_WIND } =
    CONFIG.sensing;
  const right = norm(cross(pose.forward, pose.up));
  const leftAxis = norm(sub(pose.forward, scale(right, EYE_SPLAY)));
  const rightAxis = norm(add(pose.forward, scale(right, EYE_SPLAY)));

  // light: inverse-square, per eye, over world.lights. `leftAxis → light_l`,
  // `rightAxis → light_r` is the natural mapping. NOTE: under the seed-42
  // synthetic fixture only `light_l → wing_r` is a net-excitatory contralateral
  // path (the `light_r` group 13/14/15 is partly inhibitory), so a light on the
  // fly's LEFT drives the phototaxis turn there; full bilateral phototaxis needs
  // a fixture regen (Plan 03).
  let lRaw = 0;
  let rRaw = 0;
  for (const light of world.lights) {
    const toL = sub(light.pos, pose.position);
    const d2 = Math.max(dot(toL, toL), EPS2);
    const u = norm(toL);
    lRaw += (light.intensity * Math.max(0, dot(leftAxis, u))) / d2;
    rRaw += (light.intensity * Math.max(0, dot(rightAxis, u))) / d2;
  }
  const lightL = onePole(prev.lightL, Math.min(LIGHT_MAX, lRaw), dt, TAU_LIGHT);
  const lightR = onePole(prev.lightR, Math.min(LIGHT_MAX, rRaw), dt, TAU_LIGHT);

  // wind: a slow world-space field, sampled at the two antennae (≈ eye axes)
  const windPhase = prev.windPhase + 2 * Math.PI * WIND_TURN_HZ * dt;
  const w = norm(rotY(WIND, windPhase));
  const windL = onePole(prev.windL, Math.max(0, dot(leftAxis, w)) * WIND_SPEED, dt, TAU_WIND);
  const windR = onePole(prev.windR, Math.max(0, dot(rightAxis, w)) * WIND_SPEED, dt, TAU_WIND);
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
  const loomRaw = prev.initialized ? Math.max(0, (theta - prev.loomTheta) / Math.max(dt, 1e-6)) : 0;
  const loom = onePole(prev.loom, loomRaw, dt, TAU_LOOM);

  const stimulus = new Float32Array(rt.inputOrder.length);
  for (const [name, value] of Object.entries({
    proximity: prox,
    looming: loom,
    light_l: lightL,
    light_r: lightR,
    wind_l: windL,
    wind_r: windR,
  })) {
    const id = rt.input[name];
    if (id !== undefined) stimulus[id] = value;
  }
  return {
    stimulus,
    state: {
      initialized: true,
      loomTheta: theta,
      prox,
      loom,
      lightL,
      lightR,
      windL,
      windR,
      windPhase,
    },
  };
}
