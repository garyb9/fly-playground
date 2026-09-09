// Pure chase-cam step. No `three` — plain Vec3 math so it runs under vitest and
// stays deterministic. Analytic critically-damped approach: the `e·(1 + ω·dt)`
// factor is the exact zero-velocity solution of a zeta = 1 spring, so the camera
// eases toward the target and never overshoots regardless of `dt`.

import type { Vec3, Pose } from "../body/types";
import { add, sub, scale } from "../body/types";
import { qRotate } from "../body/quat";
import { CONFIG } from "../app/config";

export function updateFollowCamera(
  camPos: Vec3,
  pose: Pose,
  dt: number,
): { position: Vec3; lookAt: Vec3 } {
  const o = CONFIG.camera.OFFSET;
  const target = add(pose.position, qRotate(pose.orientation, { x: o.x, y: o.y, z: o.z }));

  const w = CONFIG.camera.omega;
  const e = Math.exp(-w * dt);
  const diff = sub(camPos, target);
  const position = add(target, scale(diff, e * (1 + w * dt)));

  const lookAt = add(pose.position, scale(pose.forward, CONFIG.camera.LOOKAHEAD));
  return { position, lookAt };
}
