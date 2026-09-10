// Pure chase-cam step. No `three` — plain Vec3 math so it runs under vitest and
// stays deterministic. Analytic critically-damped approach: the `e·(1 + ω·dt)`
// factor is the exact zero-velocity solution of a zeta = 1 spring, so the camera
// eases toward the target and never overshoots regardless of `dt`.

import type { Vec3, Pose } from "../body/types";
import { add, sub, scale } from "../body/types";
import { qRotate } from "../body/quat";
import { CONFIG } from "../app/config";

/** Optional render-only camera offsets (Plan 02b §5 motion). Both are added
 * AFTER the spring resolves, so they never feed back into `camPos` decay and
 * the analytic convergence guarantee is untouched. `undefined` (the default)
 * reproduces the pre-02b result exactly. */
export interface FollowCameraOpts {
  /** Slow breathing drift — `motion.idleSway`. */
  sway?: Vec3;
  /** Escape/collision shove — `motion.escapeKick`. */
  kick?: { posShove: Vec3; roll: number };
}

export function updateFollowCamera(
  camPos: Vec3,
  pose: Pose,
  dt: number,
  opts?: FollowCameraOpts,
): { position: Vec3; lookAt: Vec3; roll: number } {
  const o = CONFIG.camera.OFFSET;
  const target = add(pose.position, qRotate(pose.orientation, { x: o.x, y: o.y, z: o.z }));

  const w = CONFIG.camera.omega;
  const e = Math.exp(-w * dt);
  const diff = sub(camPos, target);
  let position = add(target, scale(diff, e * (1 + w * dt)));

  // Purely additive render offsets — bounded by their generators' amplitudes.
  if (opts?.sway) position = add(position, opts.sway);
  if (opts?.kick) position = add(position, opts.kick.posShove);

  const lookAt = add(pose.position, scale(pose.forward, CONFIG.camera.LOOKAHEAD));
  return { position, lookAt, roll: opts?.kick?.roll ?? 0 };
}
