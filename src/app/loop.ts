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
  sensory: Readouts;
  activity: Float32Array;
  simHz: number;
  paused: boolean;
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
  private world: WorldQuery;
  private last = 0;
  private seeded = false;
  private sensingState: SensingState = initSensingState();
  private pendingStartle = 0;
  private lastSensory: Readouts = {};
  private raf = 0;

  constructor(deps: LoopDeps) {
    this.deps = deps;
    this.world = deps.world;
  }

  // Runtime scene edits (Task 10) land here and take effect on the next frame.
  setWorld(w: WorldQuery): void {
    this.world = w;
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

    const { bridge, body, sensing, roleTable, onFrame } = this.deps;
    const world = this.world;
    const raw = bridge.readState();
    const readouts: Readouts = Object.fromEntries(
      roleTable.readoutOrder.map((name, i) => [name, raw.readouts[i] ?? 0]),
    );
    if (raw.paused) {
      onFrame({
        pose: body.pose(),
        readouts,
        sensory: this.lastSensory,
        activity: raw.activity,
        simHz: raw.simHz,
        paused: true,
      });
      return;
    }

    const pose = body.pose();
    const { stimulus, state } = sensing.sample(pose, world, dt, this.sensingState, roleTable);
    this.sensingState = state;

    // A contact last frame startles the proximity channel this frame.
    stimulus[roleTable.input.proximity!] =
      (stimulus[roleTable.input.proximity!] ?? 0) + this.pendingStartle;
    this.pendingStartle = 0;

    bridge.setStimulus(stimulus);

    // Named view of the stimulus actually injected this frame (post startle add).
    const sensory: Readouts = Object.fromEntries(
      roleTable.inputOrder.map((name, i) => [name, stimulus[i] ?? 0]),
    );
    this.lastSensory = sensory;

    const { contact } = body.step(dt, readouts, world);
    if (contact) this.pendingStartle = CONFIG.physics.CONTACT_STARTLE;

    onFrame({
      pose: body.pose(),
      readouts,
      sensory,
      activity: raw.activity,
      simHz: raw.simHz,
      paused: raw.paused,
    });
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
