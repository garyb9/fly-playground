import type { Vec3, Pose, WorldQuery, Readouts } from "./types";
import { v, add } from "./types";
import { qFromAxisAngle } from "./quat";
import { ValueNoise } from "./noise";
import { mapReadouts, initEscapeState, type EscapeState } from "./wrench";
import { integrate, poseOf, type BodyState } from "./integrate";
import { resolveSphere } from "./collision";
import { CONFIG } from "../app/config";
import { Movement, type MovementCommand } from "./movement";

const P = CONFIG.physics;

export class Body {
  private movement = new Movement();
  movementMode() {
    return this.movement.mode;
  }
  command(command: MovementCommand) {
    this.movement.command(command, this.pose());
  }
  /** Main-thread rendering mirror for a body integrated inside its worker. */
  restoreState(state: BodyState) {
    this.s = state;
  }
  private s: BodyState;
  private esc: EscapeState = initEscapeState();
  private noise: ValueNoise;
  private t = 0;

  constructor(
    start: Vec3,
    headingRad: number,
    private readonly neuralFlight = false,
    private readonly seed: number = CONFIG.sim.seed,
  ) {
    this.noise = new ValueNoise(seed);
    this.s = {
      position: { ...start },
      orientation: qFromAxisAngle(v(0, 1, 0), headingRad),
      vel: v(),
      angVel: v(),
    };
  }

  reset(start: Vec3, headingRad: number) {
    this.s = {
      position: { ...start },
      orientation: qFromAxisAngle(v(0, 1, 0), headingRad),
      vel: v(),
      angVel: v(),
    };
    this.esc = initEscapeState();
    this.movement = new Movement();
    this.noise = new ValueNoise(this.seed);
    this.t = 0;
  }

  step(dt: number, readouts: Readouts, world: WorldQuery): { contact: boolean } {
    this.t += dt;
    const pose = poseOf(this.s);
    const m = mapReadouts(readouts, pose, this.esc, dt, this.noise, this.t, this.neuralFlight);
    this.esc = m.esc;

    // soft bounds: spring + damping back toward the volume, per axis
    const bounds = v();
    for (const ax of ["x", "y", "z"] as const) {
      const over =
        this.s.position[ax] < world.bounds.min[ax]
          ? this.s.position[ax] - world.bounds.min[ax]
          : this.s.position[ax] > world.bounds.max[ax]
            ? this.s.position[ax] - world.bounds.max[ax]
            : 0;
      if (over !== 0) bounds[ax] = -P.BOUNDS_K * over - P.BOUNDS_C * this.s.vel[ax];
    }
    const assisted = this.movement.wrench(this.s, pose, world);
    const applied = assisted ?? m.wrench;
    const wrench = { force: add(applied.force, bounds), torque: applied.torque };

    this.s = integrate(this.s, wrench, assisted ? null : m.firedImpulse, dt);
    const c = resolveSphere(this.s.position, this.s.vel, P.FLY_R, world);
    this.s = { ...this.s, position: c.position, vel: c.vel };
    this.movement.settle(this.s, this.pose(), world);
    this.movement.recover(this.s, this.pose(), world, dt, c.contact);
    return { contact: c.contact };
  }

  pose(): Pose {
    return poseOf(this.s);
  }
  state(): Readonly<BodyState> {
    return this.s;
  }
}
