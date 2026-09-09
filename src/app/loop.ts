// The per-frame orchestrator. Framework-free: it wires the sim bridge, the
// sensing pass and the body together and hands a small `FrameView` to the
// renderer via `onFrame`. No `three` import — everything here is plain data.

import type { SimBridge } from "../bridge/sim-bridge";
import type { Body } from "../body/body";
import type { Pose, WorldQuery, Readouts } from "../body/types";
import type { RoleTable } from "../sim/roles";
import { sample, initSensingState, type SensingState } from "../sensing/sensing";
import { CONFIG } from "./config";

export interface FrameView {
  pose: Pose;
  readouts: Readouts;
  activity: Float32Array;
  simHz: number;
}

export interface LoopDeps {
  bridge: SimBridge;
  body: Body;
  sensing: { sample: typeof sample };
  roleTable: RoleTable;
  world: WorldQuery;
  onFrame(view: FrameView): void;
}

export class Loop {
  private readonly deps: LoopDeps;
  private last = 0;
  private seeded = false;
  private sensingState: SensingState = initSensingState();
  private pendingStartle = 0;
  private raf = 0;

  constructor(deps: LoopDeps) {
    this.deps = deps;
  }

  frameOnce(nowMs: number): void {
    // The very first call only seeds the clock — no pipeline, no stimulus push.
    if (!this.seeded) {
      this.seeded = true;
      this.last = nowMs;
      return;
    }

    const dt = Math.min((nowMs - this.last) / 1000, CONFIG.loop.MAX_FRAME_DT);
    this.last = nowMs;

    const { bridge, body, sensing, roleTable, world, onFrame } = this.deps;

    const pose = body.pose();
    const { stimulus, state } = sensing.sample(pose, world, dt, this.sensingState, roleTable);
    this.sensingState = state;

    // A contact last frame startles the proximity channel this frame.
    stimulus[roleTable.input.proximity!] =
      (stimulus[roleTable.input.proximity!] ?? 0) + this.pendingStartle;
    this.pendingStartle = 0;

    bridge.setStimulus(stimulus);

    const raw = bridge.readState();
    const readouts: Readouts = Object.fromEntries(
      roleTable.readoutOrder.map((name, i) => [name, raw.readouts[i] ?? 0]),
    );

    const { contact } = body.step(dt, readouts, world);
    if (contact) this.pendingStartle = CONFIG.physics.CONTACT_STARTLE;

    onFrame({ pose: body.pose(), readouts, activity: raw.activity, simHz: raw.simHz });
  }

  start(): void {
    if (typeof requestAnimationFrame !== "function") return;
    const pump = (): void => {
      this.frameOnce(performance.now());
      this.raf = requestAnimationFrame(pump);
    };
    this.raf = requestAnimationFrame(pump);
  }

  stop(): void {
    if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(this.raf);
    this.raf = 0;
  }
}
