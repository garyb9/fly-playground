import { expect, test } from "vitest";
import { WorkerCore } from "./worker-core";
import type { SimLike } from "./sim-bridge";
import type { RoleTable } from "../sim/roles";

class FakeSim implements SimLike {
  n: number;
  lastInject: Record<number, number> = {};
  stepCalls = 0;
  paramCalls: number[][] = [];
  constructor(n: number) {
    this.n = n;
  }
  inject(id: number, v: number) {
    this.lastInject[id] = v;
  }
  step() {
    this.stepCalls++;
  }
  readout(id: number) {
    return id === 0 ? (this.lastInject[10] ?? 0) : 0;
  } // readout 0 mirrors input role 10
  activity_snapshot() {
    return Float32Array.from({ length: this.n }, (_, i) => i / this.n);
  }
  set_params(...p: number[]) {
    this.paramCalls.push(p);
  }
}
const rt: RoleTable = {
  input: { a: 0 },
  readout: { escape: 0, x: 1 },
  inputOrder: ["a"],
  readoutOrder: ["escape", "x"],
};
const LIF = { dtMs: 5, tauMMs: 20, vThreshold: 1, vReset: 0, refracMs: 2, noiseSigma: 0.02 };
const cfg = { TICK_MS: 5, MAX_CATCHUP_MS: 20, hzEmaTau: 0.5, snapMax: 4, coreFloor: 2, lif: LIF };

test("frame() returns readouts of readoutOrder length and a strided snapshot", () => {
  const core = new WorkerCore(new FakeSim(500), rt, [10], [0, 1], cfg);
  core.setActiveCount(500);
  const f = core.frame(10);
  expect(f.readouts.length).toBe(2);
  expect(f.activity.length).toBe(4); // min(activeCount, snapMax)
  expect(f.tick).toBe(2);
});

test("setStimulus is what gets latched + injected", () => {
  const sim = new FakeSim(50);
  const core = new WorkerCore(sim, rt, [10], [0, 1], cfg);
  core.setActiveCount(50);
  core.setStimulus(Float32Array.from([0.9]));
  const f = core.frame(10);
  // NOTE (deviation from plan): the latch is a Float32Array, so 0.9 round-trips as
  // Math.fround(0.9); the plan's `toBe(0.9)` cannot pass against its own verbatim code.
  // Assert the exact float32 passthrough instead.
  expect(sim.lastInject[10]).toBe(Math.fround(0.9));
  expect(f.readouts[0]).toBe(Math.fround(0.9));
});

test("frame(0) advances no ticks but still returns readouts + a snapshot", () => {
  const sim = new FakeSim(50);
  const core = new WorkerCore(sim, rt, [10], [0, 1], cfg);
  core.setActiveCount(50);
  const f0 = core.frame(0);
  expect(sim.stepCalls).toBe(0);
  expect(f0.readouts.length).toBe(2);
  expect(f0.activity.length).toBe(4);
  expect(f0.tick).toBe(0);
  const f1 = core.frame(20);
  expect(f1.tick).toBeGreaterThan(0);
});

test("constructor applies the resolved lif vector once via set_params", () => {
  const sim = new FakeSim(50);
  new WorkerCore(sim, rt, [10], [0, 1], cfg);
  expect(sim.paramCalls).toEqual([[5, 20, 1, 0, 2, 0.02]]);
});

test("setParams merges a partial into the tracked vector (not a reset)", () => {
  const sim = new FakeSim(50);
  const core = new WorkerCore(sim, rt, [10], [0, 1], cfg);
  core.setParams({ noiseSigma: 0.1 });
  core.setParams({ vThreshold: 0.8 });
  expect(sim.paramCalls).toEqual([
    [5, 20, 1, 0, 2, 0.02],
    [5, 20, 1, 0, 2, 0.1],
    [5, 20, 0.8, 0, 2, 0.1],
  ]);
});
