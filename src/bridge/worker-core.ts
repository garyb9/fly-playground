import type { LifParams, SimLike } from "./sim-bridge";
import type { RoleTable } from "../sim/roles";
import { stepAccumulator, type AccState } from "./step-accumulator";
import { Embodied, type EmbodiedConfig } from "./embodied";

interface Cfg {
  embodied?: EmbodiedConfig;
  seed?: number;
  TICK_MS: number;
  MAX_CATCHUP_MS: number;
  hzEmaTau: number;
  snapMax: number;
  coreFloor: number;
  lif: LifParams;
}

export class WorkerCore {
  readonly embodied?: Embodied;
  private latched: Float32Array;
  private acc: AccState = { acc: 0, tick: 0, hzEma: 0 };
  private activeCount = 0;
  private params: LifParams;
  private pulse: { cells: Uint32Array; amplitude: number; remaining: number } | null = null;
  intervene(command: import("./sim-bridge").Intervention) {
    const cells = Uint32Array.from(
      [...new Set(command.cells)].filter((n) => Number.isInteger(n) && n >= 0),
    );
    if (command.kind === "tonic") {
      this.sim.set_bias?.(cells, command.amplitude ?? 0);
    } else if (command.kind === "stop") {
      this.pulse = null;
      this.sim.clear_interventions?.();
    } else if (command.kind === "silence" || command.kind === "restore") {
      this.sim.silence_cells?.(cells, command.kind === "silence");
    } else {
      const amplitude = command.amplitude ?? 1.5;
      const duration = command.durationMs ?? 400;
      if (!Number.isFinite(amplitude) || !Number.isFinite(duration) || duration <= 0) return;
      this.pulse = {
        cells,
        amplitude: Math.max(-5, Math.min(5, amplitude)),
        remaining:
          command.kind === "hold"
            ? Infinity
            : Math.ceil(Math.min(duration, 10000) / this.cfg.TICK_MS),
      };
    }
  }
  private beforeStep = () => {
    if (this.embodied) this.latched.set(this.embodied.beforeStep(this.cfg.TICK_MS / 1000));
    if (!this.pulse) return;
    this.sim.inject_cells?.(this.pulse.cells, this.pulse.amplitude);
    if (--this.pulse.remaining <= 0) this.pulse = null;
  };
  constructor(
    private sim: SimLike,
    private rt: RoleTable,
    private inputRoleIds: number[],
    private readoutRoleIds: number[],
    private cfg: Cfg,
  ) {
    this.latched = new Float32Array(rt.inputOrder.length);
    this.params = { ...cfg.lif };
    if (cfg.embodied) this.embodied = new Embodied(cfg.embodied, rt, cfg.seed ?? 42);
    this.applyParams();
  }

  private applyParams() {
    const p = this.params;
    this.sim.set_params(p.dtMs, p.tauMMs, p.vThreshold, p.vReset, p.refracMs, p.noiseSigma);
  }
  setParams(p: Partial<LifParams>) {
    if (this.embodied) p = { ...p, dtMs: this.cfg.TICK_MS };
    this.params = { ...this.params, ...p };
    this.applyParams();
  }

  setStimulus(v: Float32Array) {
    this.latched.set(v.subarray(0, this.latched.length));
  }
  setActiveCount(n: number) {
    this.activeCount = Math.max(n | 0, this.cfg.coreFloor);
    this.sim.set_active_count?.(this.activeCount);
  }
  reset() {
    this.acc = { acc: 0, tick: 0, hzEma: 0 };
    this.latched.fill(0);
    this.pulse = null;
    this.sim.reset?.(BigInt(this.cfg.seed ?? 42));
    this.embodied?.reset();
  }

  frame(elapsedMs: number) {
    if (elapsedMs > 0) {
      this.acc = stepAccumulator(
        this.acc,
        elapsedMs,
        this.latched,
        this.sim,
        this.inputRoleIds,
        this.cfg,
        this.beforeStep,
        () =>
          this.embodied?.afterStep(
            this.cfg.TICK_MS / 1000,
            Object.fromEntries(
              this.rt.readoutOrder.map((name, i) => [
                name,
                this.sim.readout(this.readoutRoleIds[i]!),
              ]),
            ),
          ),
      );
    }
    const readouts = new Float32Array(this.readoutRoleIds.length);
    for (let i = 0; i < readouts.length; i++)
      readouts[i] = this.sim.readout(this.readoutRoleIds[i]!);
    const snap = this.sim.activity_snapshot();
    const nSnapshot = Math.min(this.activeCount || snap.length, this.cfg.snapMax);
    const activity = nSnapshot === snap.length ? snap : new Float32Array(nSnapshot);
    for (let i = 0; nSnapshot !== snap.length && i < nSnapshot; i++) {
      const start = Math.floor((i * snap.length) / nSnapshot);
      const end = Math.floor(((i + 1) * snap.length) / nSnapshot);
      let sum = 0;
      for (let j = start; j < end; j++) sum += snap[j] ?? 0;
      activity[i] = end > start ? sum / (end - start) : 0;
    }
    return {
      embodied: this.embodied?.snapshot(),
      readouts,
      activity,
      simHz: this.acc.hzEma,
      tick: this.acc.tick,
      nSnapshot,
      activeCount: this.activeCount,
    };
  }
}
