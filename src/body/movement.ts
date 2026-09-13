import { CONFIG } from "../app/config";
import type { BodyState } from "./integrate";
import type { Wrench } from "./wrench";
import { v, add, sub, scale, cross, norm, type Pose, type WorldQuery } from "./types";

export type MovementCommand =
  | "forward"
  | "backward"
  | "left"
  | "right"
  | "up"
  | "down"
  | "turn_left"
  | "turn_right"
  | "land"
  | "takeoff"
  | "hover"
  | "release";
export type MovementMode =
  "neural" | "assisted" | "landing" | "grounded" | "taking off" | "wall recovery";
const P = CONFIG.physics;
const clamp = (x: number, max: number) => Math.max(-max, Math.min(max, x));

/** User-directed body experiments. This controller supplies external forces;
 * it never masquerades as a connectome-derived landing/flight circuit. */
export class Movement {
  mode: MovementMode = "neural";
  private target = v();
  private heading = 0;
  private stuckSeconds = 0;
  private recoverySeconds = 0;
  /** Bounded external recovery when ongoing neural thrust pins a body against
   * a wall. Kept visible as a body assist, not attributed to neural activity. */
  recover(state: BodyState, pose: Pose, world: WorldQuery, dt: number, contact: boolean) {
    if (this.mode === "wall recovery") {
      this.recoverySeconds -= dt;
      if (this.recoverySeconds <= 0) {
        this.mode = "neural";
        this.stuckSeconds = 0;
      }
      return;
    }
    if (this.mode !== "neural") {
      this.stuckSeconds = 0;
      return;
    }
    const away = v();
    for (const ax of ["x", "z"] as const) {
      if (pose.position[ax] < world.bounds.min[ax] + P.FLY_R + 0.15) away[ax] += 1;
      if (pose.position[ax] > world.bounds.max[ax] - P.FLY_R - 0.15) away[ax] -= 1;
    }
    for (const b of world.aabbs) {
      if (pose.position.y < b.min.y - P.FLY_R || pose.position.y > b.max.y + P.FLY_R) continue;
      const dx = pose.position.x - Math.max(b.min.x, Math.min(b.max.x, pose.position.x));
      const dz = pose.position.z - Math.max(b.min.z, Math.min(b.max.z, pose.position.z));
      if (Math.hypot(dx, dz) < P.FLY_R + 0.15) {
        away.x += dx;
        away.z += dz;
      }
    }
    const nearWall = Math.hypot(away.x, away.z) > 0.001;
    this.stuckSeconds =
      nearWall && (contact || Math.hypot(state.vel.x, state.vel.z) < 0.5)
        ? this.stuckSeconds + dt
        : 0;
    if (this.stuckSeconds < 0.35) return;
    const dir = norm(away);
    this.target = add(pose.position, scale(dir, 2));
    this.target.y = Math.min(
      world.bounds.max.y - P.FLY_R - 0.2,
      Math.max(pose.position.y, world.bounds.min.y + 1.5),
    );
    this.heading = Math.atan2(-dir.z, dir.x);
    this.mode = "wall recovery";
    this.recoverySeconds = 2.5;
  }
  command(command: MovementCommand, pose: Pose) {
    if (command === "release") {
      this.mode = "neural";
      return;
    }
    if (this.mode === "grounded" && command !== "takeoff") return;
    if (command === "takeoff" && this.mode !== "grounded" && this.mode !== "landing") return;
    this.target = { ...pose.position };
    this.heading = Math.atan2(-pose.forward.z, pose.forward.x);
    this.mode = command === "land" ? "landing" : command === "takeoff" ? "taking off" : "assisted";
    const forward = norm(v(pose.forward.x, 0, pose.forward.z));
    const right = cross(forward, v(0, 1, 0));
    if (command === "forward" || command === "backward")
      this.target = add(this.target, scale(forward, command === "forward" ? 2 : -2));
    if (command === "left" || command === "right")
      this.target = add(this.target, scale(right, command === "right" ? 2 : -2));
    if (command === "up" || command === "down" || command === "takeoff")
      this.target.y += command === "down" ? -1.5 : 1.5;
    if (command === "turn_left" || command === "turn_right")
      this.heading += ((command === "turn_left" ? 1 : -1) * Math.PI) / 4;
  }
  surface(pose: Pose, world: WorldQuery) {
    let height = world.bounds.min.y + P.FLY_R;
    for (const b of world.aabbs) {
      if (
        pose.position.x >= b.min.x &&
        pose.position.x <= b.max.x &&
        pose.position.z >= b.min.z &&
        pose.position.z <= b.max.z &&
        b.max.y + P.FLY_R <= pose.position.y + 0.03
      )
        height = Math.max(height, b.max.y + P.FLY_R);
    }
    return height;
  }
  wrench(state: BodyState, pose: Pose, world: WorldQuery): Wrench | null {
    if (this.mode === "neural") return null;
    if (this.mode === "grounded") {
      if (Math.abs(pose.position.y - this.surface(pose, world)) > 0.05) this.mode = "landing";
      else return { force: v(0, P.MASS * P.GRAVITY, 0), torque: v() };
    }
    const error = sub(this.target, pose.position);
    const velocity = v(clamp(error.x * 2, 2), clamp(error.y * 2, 1.2), clamp(error.z * 2, 2));
    if (this.mode === "landing")
      velocity.y = -Math.min(
        0.8,
        Math.max(0.15, (pose.position.y - this.surface(pose, world)) * 2),
      );
    if (this.mode === "taking off" && Math.abs(error.y) < 0.1) this.mode = "assisted";
    const acceleration = scale(sub(velocity, state.vel), 5);
    const force = scale(
      add(acceleration, add(scale(state.vel, P.LIN_DRAG), v(0, P.GRAVITY, 0))),
      P.MASS,
    );
    const heading = Math.atan2(-pose.forward.z, pose.forward.x);
    const turnError = Math.atan2(
      Math.sin(this.heading - heading),
      Math.cos(this.heading - heading),
    );
    const leveling = cross(pose.up, v(0, 1, 0));
    const torque = sub(
      add(scale(leveling, 1.2), v(0, clamp(turnError * 0.8, 0.8), 0)),
      scale(state.angVel, 0.25),
    );
    return { force, torque };
  }
  settle(state: BodyState, pose: Pose, world: WorldQuery) {
    if (this.mode === "landing" && pose.position.y <= this.surface(pose, world) + 0.025) {
      this.mode = "grounded";
      state.position.y = this.surface(pose, world);
      state.vel = v();
      state.angVel = v();
    }
  }
}
