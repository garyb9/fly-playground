// The per-frame orchestrator. Framework-free: it wires the sim bridge, the
// sensing pass and the body together and hands a small `FrameView` to the
// renderer via `onFrame`. No `three` import — everything here is plain data.

import type { SimBridge } from "../bridge/sim-bridge";
import type { Body } from "../body/body";
import type { Pose, WorldQuery, Readouts } from "../body/types";
import type { RoleTable } from "../sim/roles";
import { sample, initSensingState, type SensingState } from "../sensing/sensing";
import { encodeModalities, initEncoderState } from "../sensing/encoders";
import { CONFIG } from "./config";

export interface FrameView {
  movementMode?: import("../body/movement").MovementMode;
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
  nativeEncoders?: boolean;
  simulationClock?: boolean;
  onFrame(view: FrameView): void;
}

export class Loop {
  private readonly deps: LoopDeps;
  private world: WorldQuery;
  private last = 0;
  private lastTick = 0;
  private seeded = false;
  private sensingState: SensingState = initSensingState();
  private pendingStartle = 0;
  private lastSensory: Readouts = {};
  private raf = 0;
  private modalities = false;
  private encoder = initEncoderState();
  setModalities(enabled: boolean) {
    this.modalities = enabled;
    this.encoder = initEncoderState();
  }

  constructor(deps: LoopDeps) {
    this.deps = deps;
    this.world = deps.world;
  }

  // Runtime scene edits (Task 10) land here and take effect on the next frame.
  setWorld(w: WorldQuery): void {
    this.world = w;
    this.deps.bridge.setWorld?.(w);
  }

  frameOnce(nowMs: number): void {
    // The very first call only seeds the clock — no pipeline, no stimulus push.
    if (!this.seeded) {
      this.seeded = true;
      this.last = nowMs;
      this.lastTick = this.deps.bridge.readState().tick;
      return;
    }

    let dt = Math.min((nowMs - this.last) / 1000, CONFIG.loop.MAX_FRAME_DT);
    this.last = nowMs;

    const { bridge, body, sensing, roleTable, onFrame } = this.deps;
    const world = this.world;
    const raw = bridge.readState();
    if (raw.embodied) {
      body.restoreState(raw.embodied.state);
      onFrame({
        pose: body.pose(),
        readouts: Object.fromEntries(
          roleTable.readoutOrder.map((name, i) => [name, raw.readouts[i] ?? 0]),
        ),
        sensory: Object.fromEntries(
          roleTable.inputOrder.map((name, i) => [name, raw.embodied!.stimulus[i] ?? 0]),
        ),
        activity: raw.activity,
        simHz: raw.simHz,
        paused: raw.paused,
        movementMode: raw.embodied.mode,
      });
      return;
    }
    if (this.deps.simulationClock) {
      // Snapshots hold readouts between frames. Integrate their elapsed neural
      // time in fixed substeps; cap recovery from background tabs at one second.
      dt = Math.min(1, (Math.max(0, raw.tick - this.lastTick) * CONFIG.worker.TICK_MS) / 1000);
      this.lastTick = raw.tick;
    }
    const readouts: Readouts = Object.fromEntries(
      roleTable.readoutOrder.map((name, i) => [name, raw.readouts[i] ?? 0]),
    );
    if (raw.paused || (this.deps.simulationClock && dt === 0)) {
      onFrame({
        pose: body.pose(),
        readouts,
        sensory: this.lastSensory,
        activity: raw.activity,
        simHz: raw.simHz,
        paused: raw.paused,
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

    if (this.deps.nativeEncoders) {
      const read = (name: string) => stimulus[roleTable.input[name]!] ?? 0;
      const encoded = encodeModalities(
        read("light_l"),
        read("light_r"),
        read("wind_l"),
        read("wind_r"),
        dt,
        this.encoder,
      );
      this.encoder = encoded.state;
      for (const name of ["light_l", "light_r", "wind_l", "wind_r"] as const) {
        const id = roleTable.input[name];
        if (id !== undefined) stimulus[id] = this.modalities ? encoded[name] : 0;
      }
    }
    bridge.setStimulus(stimulus);

    // Named view of the stimulus actually injected this frame (post startle add).
    const sensory: Readouts = Object.fromEntries(
      roleTable.inputOrder.map((name, i) => [name, stimulus[i] ?? 0]),
    );
    this.lastSensory = sensory;

    const steps = this.deps.simulationClock
      ? Math.max(1, Math.round((dt * 1000) / CONFIG.worker.TICK_MS))
      : 1;
    for (let step = 0; step < steps; step++) {
      if (body.step(dt / steps, readouts, world).contact)
        this.pendingStartle = CONFIG.physics.CONTACT_STARTLE;
    }

    onFrame({
      pose: body.pose(),
      readouts,
      sensory,
      activity: raw.activity,
      simHz: raw.simHz,
      paused: raw.paused,
    });
  }

  reset(): void {
    this.seeded = false;
    this.sensingState = initSensingState();
    this.pendingStartle = 0;
    this.lastSensory = {};
    this.encoder = initEncoderState();
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
