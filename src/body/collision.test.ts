import { expect, test } from "vitest";
import { resolveSphere } from "./collision";
import { v, type WorldQuery } from "./types";

const world: WorldQuery = {
  aabbs: [{ min: v(-1, -1, -1), max: v(1, 1, 1) }],
  bounds: { min: v(-10, -10, -10), max: v(10, 10, 10) },
  lights: [],
};

test("a sphere overlapping the +X face is pushed out along +X and its x-velocity reflects", () => {
  const r = resolveSphere(v(1.1, 0, 0), v(-2, 0, 0), 0.3, world);
  expect(r.contact).toBe(true);
  expect(r.position.x).toBeGreaterThanOrEqual(1.3 - 1e-6);
  expect(r.vel.x).toBeGreaterThan(0); // was moving in, now bounced out
});
test("no overlap: unchanged, no contact", () => {
  const r = resolveSphere(v(5, 0, 0), v(-2, 0, 0), 0.3, world);
  expect(r.contact).toBe(false);
  expect(r.position).toEqual(v(5, 0, 0));
});
test("outside the world bounds is pulled back in", () => {
  const r = resolveSphere(v(10.5, 0, 0), v(1, 0, 0), 0.3, world);
  expect(r.contact).toBe(true);
  expect(r.position.x).toBeLessThanOrEqual(10 - 0.3 + 1e-6);
});
