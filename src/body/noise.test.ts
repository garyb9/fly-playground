import { expect, test } from "vitest";
import { ValueNoise } from "./noise";

test("deterministic, bounded, smooth", () => {
  const a = new ValueNoise(123),
    b = new ValueNoise(123);
  const s1 = a.at(0, 1.234),
    s2 = b.at(0, 1.234);
  expect(s1).toBe(s2);
  for (let t = 0; t < 5; t += 0.05) expect(Math.abs(a.at(1, t))).toBeLessThanOrEqual(1);
  expect(Math.abs(a.at(0, 1.0) - a.at(0, 1.001))).toBeLessThan(0.05); // continuity
});
test("different channels decorrelate", () => {
  const n = new ValueNoise(7);
  expect(n.at(0, 2.0)).not.toBe(n.at(1, 2.0));
});
