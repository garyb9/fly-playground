import { expect, test } from "vitest";
import { stepAccumulator, type AccState } from "./step-accumulator";
import type { SimLike } from "./sim-bridge";

class FakeSim implements SimLike {
  injects: Array<[number, number]> = [];
  steps = 0;
  inject(id: number, v: number) {
    this.injects.push([id, v]);
  }
  step(t: number) {
    this.steps += t;
  }
  readout() {
    return 0;
  }
  activity_snapshot() {
    return new Float32Array(0);
  }
}
const CFG = { TICK_MS: 5, MAX_CATCHUP_MS: 20, hzEmaTau: 0.5 };
const fresh = (): AccState => ({ acc: 0, tick: 0, hzEma: 0 });

test("elapsed 17ms at 5ms/tick runs 3 ticks, keeps 2ms remainder", () => {
  const sim = new FakeSim();
  const s = stepAccumulator(fresh(), 17, Float32Array.from([9]), sim, [0], CFG);
  expect(sim.steps).toBe(3);
  expect(s.tick).toBe(3);
  expect(s.acc).toBeCloseTo(2, 5);
});

test("stimulus is re-injected before every tick", () => {
  const sim = new FakeSim();
  // NOTE (deviation from plan): expected values are read back from the same
  // Float32Array so the assertion survives float32 rounding of 0.7 / 0.2.
  // The plan's literal `[[0, 0.7], ...]` cannot deep-equal `0.699999988...`.
  // Intent is unchanged: 3 ticks x 2 roles, re-injected each tick, in order.
  const stim = Float32Array.from([0.7, 0.2]);
  stepAccumulator(fresh(), 15, stim, sim, [0, 1], CFG);
  expect(sim.injects).toEqual([
    [0, stim[0]],
    [1, stim[1]],
    [0, stim[0]],
    [1, stim[1]],
    [0, stim[0]],
    [1, stim[1]],
  ]);
});

test("a huge elapsed is clamped to MAX_CATCHUP_MS (no spiral)", () => {
  const sim = new FakeSim();
  stepAccumulator(fresh(), 5000, Float32Array.from([1]), sim, [0], CFG);
  expect(sim.steps).toBe(4); // 20ms / 5ms
});

test("hzEma rises toward the observed rate", () => {
  const sim = new FakeSim();
  let s = fresh();
  // NOTE (deviation from plan): 300 iterations, not 50. With hzEmaTau=0.5s and
  // 5ms steps the EMA time-constant is ~138 ticks, so after 50 ticks hzEma is
  // only ~79 and cannot exceed 150. 300 ticks -> ~190, in the intended band.
  for (let i = 0; i < 300; i++) s = stepAccumulator(s, 5, Float32Array.from([0]), sim, [0], CFG);
  expect(s.hzEma).toBeGreaterThan(150);
  expect(s.hzEma).toBeLessThan(210);
});
