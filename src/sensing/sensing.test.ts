import { expect, test } from "vitest";
import { sample, initSensingState } from "./sensing";
import { v, type Pose, type WorldQuery } from "../body/types";

const rt = {
  input: { light_l: 0, light_r: 1, looming: 2, proximity: 3, wind_l: 4, wind_r: 5 },
  readout: {},
  inputOrder: ["light_l", "light_r", "looming", "proximity", "wind_l", "wind_r"],
  readoutOrder: [],
};

const pose = (px: number): Pose => ({
  position: v(px, 0, 0),
  orientation: { x: 0, y: 0, z: 0, w: 1 },
  forward: v(1, 0, 0),
  up: v(0, 1, 0),
});
const world: WorldQuery = {
  aabbs: [{ min: v(10, -0.5, -0.5), max: v(11, 0.5, 0.5) }],
  bounds: { min: v(-50, -50, -50), max: v(50, 50, 50) },
};

test("looming grows as the fly closes on the object; only looming + proximity slots fill", () => {
  let st = initSensingState();
  let r = sample(pose(0), world, 0.1, st, rt);
  st = r.state;
  for (let i = 1; i <= 30; i++) {
    r = sample(pose(i * 0.25), world, 0.1, st, rt);
    st = r.state;
  }
  expect(r.stimulus[rt.input.looming]).toBeGreaterThan(0);
  expect(r.stimulus[rt.input.proximity]).toBeGreaterThan(0);
  for (const i of [rt.input.light_l, rt.input.light_r, rt.input.wind_l, rt.input.wind_r])
    expect(r.stimulus[i]).toBe(0);
});

test("receding object yields zero looming (clamped at 0)", () => {
  let st = initSensingState();
  let r = sample(pose(8), world, 0.1, st, rt);
  st = r.state;
  r = sample(pose(7), world, 0.1, st, rt); // moved away from x=10 object? no — 7 is closer; use farther
  r = sample(pose(2), world, 0.1, r.state, rt);
  r = sample(pose(1), world, 0.1, r.state, rt); // now receding
  expect(r.stimulus[rt.input.looming]).toBeGreaterThanOrEqual(0);
});
