import { expect, test } from "vitest";
import { rayAabb, nearestHit } from "./raycast";
import { v } from "../body/types";

const box = { min: v(1, -1, -1), max: v(3, 1, 1) };

test("ray hits a box straight ahead at the near face", () => {
  expect(rayAabb(v(0, 0, 0), v(1, 0, 0), box)).toBeCloseTo(1);
});
test("ray pointing away misses", () => {
  expect(rayAabb(v(0, 0, 0), v(-1, 0, 0), box)).toBeNull();
});
test("origin inside the box returns 0", () => {
  expect(rayAabb(v(2, 0, 0), v(1, 0, 0), box)).toBe(0);
});
test("nearestHit picks the closest of several boxes", () => {
  const far = { min: v(9, -1, -1), max: v(10, 1, 1) };
  expect(nearestHit(v(0, 0, 0), [v(1, 0, 0)], [far, box])).toBeCloseTo(1);
  expect(nearestHit(v(0, 0, 0), [v(0, 1, 0)], [box])).toBe(Infinity);
});
