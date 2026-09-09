import type { Pose, Vec3, Readouts } from "./types";
import { v, add, scale, norm } from "./types";
import { CONFIG } from "../app/config";
import type { ValueNoise } from "./noise";

export interface Wrench {
  force: Vec3;
  torque: Vec3;
}
export interface EscapeState {
  armed: boolean;
  lockout: number;
}
export const initEscapeState = (): EscapeState => ({ armed: true, lockout: 0 });

const P = CONFIG.physics;

export function mapReadouts(
  readouts: Readouts,
  pose: Pose,
  esc: EscapeState,
  dt: number,
  noise: ValueNoise,
  tSeconds: number,
): { wrench: Wrench; esc: EscapeState; firedImpulse: Vec3 | null } {
  const n = (ch: number) => noise.at(ch, tSeconds) * P.NOISE_AMP;
  const wl = (readouts.wing_l ?? 0) + n(0);
  const wr = (readouts.wing_r ?? 0) + n(1);
  const thrust = (readouts.thrust ?? 0) + n(2);
  const yaw = (readouts.yaw_torque ?? 0) + n(3);
  const escape = readouts.escape ?? 0;

  let lockout = Math.max(0, esc.lockout - dt);
  let armed = esc.armed;
  let firedImpulse: Vec3 | null = null;

  if (armed && escape >= P.ESCAPE_TH) {
    firedImpulse = scale(norm(add(pose.up, pose.forward)), P.ESCAPE_IMPULSE);
    armed = false;
    lockout = P.ESCAPE_LOCKOUT_S;
  }
  if (!armed && escape < P.ESCAPE_TH - P.ESCAPE_HYST) armed = true;

  const underLockout = lockout > 0;
  const s = (wl + wr) / 2;
  const a = wl - wr;

  let force = v();
  let torque = v();
  if (!underLockout) {
    const lift = P.GRAVITY * P.MASS + P.LIFT_K * (s - P.HOVER_S);
    force = add(scale(pose.up, lift), scale(pose.forward, P.CRUISE_THRUST + P.THRUST_K * thrust));
    torque = add(scale(pose.forward, P.ROLL_K * a), scale(pose.up, P.YAW_A_K * a + P.YAW_K * yaw));
  }
  return { wrench: { force, torque }, esc: { armed, lockout }, firedImpulse };
}
