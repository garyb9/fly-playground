import type { SimLike } from "./sim-bridge";
import type { RoleTable } from "../sim/roles";
import { stepAccumulator, type AccState } from "./step-accumulator";

interface Cfg {
  TICK_MS: number;
  MAX_CATCHUP_MS: number;
  hzEmaTau: number;
  snapMax: number;
  coreFloor: number;
}

export class WorkerCore {
  private latched: Float32Array;
  private acc: AccState = { acc: 0, tick: 0, hzEma: 0 };
  private activeCount = 0;
  private paused = false;
  constructor(
    private sim: SimLike,
    private rt: RoleTable,
    private inputRoleIds: number[],
    private readoutRoleIds: number[],
    private cfg: Cfg,
  ) {
    this.latched = new Float32Array(rt.inputOrder.length);
  }

  setStimulus(v: Float32Array) {
    this.latched.set(v.subarray(0, this.latched.length));
  }
  setActiveCount(n: number) {
    this.activeCount = Math.max(n | 0, this.cfg.coreFloor);
  }
  pause() {
    this.paused = true;
  }
  resume() {
    this.paused = false;
  }
  reset() {
    this.acc = { acc: 0, tick: 0, hzEma: 0 };
    this.latched.fill(0);
  }

  frame(elapsedMs: number) {
    if (!this.paused) {
      this.acc = stepAccumulator(
        this.acc,
        elapsedMs,
        this.latched,
        this.sim,
        this.inputRoleIds,
        this.cfg,
      );
    }
    const readouts = new Float32Array(this.readoutRoleIds.length);
    for (let i = 0; i < readouts.length; i++)
      readouts[i] = this.sim.readout(this.readoutRoleIds[i]!);
    const snap = this.sim.activity_snapshot();
    const nSnapshot = Math.min(this.activeCount || snap.length, this.cfg.snapMax);
    const stride = Math.max(1, Math.ceil((this.activeCount || snap.length) / nSnapshot));
    const activity = new Float32Array(nSnapshot);
    for (let i = 0; i < nSnapshot; i++) activity[i] = snap[i * stride] ?? 0;
    return {
      readouts,
      activity,
      simHz: this.acc.hzEma,
      tick: this.acc.tick,
      nSnapshot,
      activeCount: this.activeCount,
    };
  }
}
