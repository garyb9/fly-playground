import { expect, test } from "vitest";
import { connectionActivity, circuitActivity, regionActivity } from "./activity";
test("paths exclude unsimulated partners and silent sources", () => {
  const a = new Float32Array([0.8, 0]);
  expect(connectionActivity(a, 0, 1)).toBeCloseTo(0.8);
  expect(connectionActivity(a, 1, 0)).toBe(0);
  expect(connectionActivity(a, 0, 2)).toBe(0);
});
test("circuit mean uses only simulated cells", () => {
  expect(circuitActivity(new Float32Array([0.8, 0.2]), [0, 1, 2])).toBeCloseTo(0.5);
  expect(circuitActivity(new Float32Array(), [1])).toBe(0);
});

test("ROI activity is weighted by measured synapses and reports partial coverage", () => {
  const result = regionActivity(new Float32Array([1, 0]), [
    [0, 3],
    [1, 1],
    [2, 4],
  ]);
  expect(result.value).toBe(0.75);
  expect(result.coverage).toBe(0.5);
  expect(regionActivity(new Float32Array(), [[1, 4]])).toEqual({ value: 0, coverage: 0 });
});
