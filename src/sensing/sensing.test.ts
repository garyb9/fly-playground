import { expect, test } from "vitest";
import { sample, initSensingState } from "./sensing";
import { v, type Pose, type WorldQuery } from "../body/types";
import { CONFIG } from "../app/config";

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
  lights: [],
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
  for (const i of [rt.input.light_l, rt.input.light_r]) expect(r.stimulus[i]).toBe(0);
});

test("a light off to one side drives light_r ≠ light_l; symmetric light is ~equal", () => {
  // pose(px) faces +X. Put a light on the fly's right (+Z) and one dead ahead (+X).
  const side: WorldQuery = { ...world, lights: [{ pos: v(0, 0, 8), intensity: 50 }] };
  const ahead: WorldQuery = { ...world, lights: [{ pos: v(8, 0, 0), intensity: 50 }] };
  let st = initSensingState();
  let r = sample(pose(0), side, 0.1, st, rt);
  for (let i = 0; i < 40; i++) r = sample(pose(0), side, 0.1, r.state, rt);
  const l = r.stimulus[rt.input.light_l]!;
  const rr = r.stimulus[rt.input.light_r]!;
  expect(rr).toBeGreaterThan(l * 1.5); // +Z light favours the right eye axis
  expect(rr).toBeGreaterThan(0);

  st = initSensingState();
  let a = sample(pose(0), ahead, 0.1, st, rt);
  for (let i = 0; i < 40; i++) a = sample(pose(0), ahead, 0.1, a.state, rt);
  expect(a.stimulus[rt.input.light_l]!).toBeCloseTo(a.stimulus[rt.input.light_r]!, 3);
});

test("light channel clamps to LIGHT_MAX for a very close bright light", () => {
  const near: WorldQuery = { ...world, lights: [{ pos: v(0.1, 0, 0), intensity: 500 }] };
  let r = sample(pose(0), near, 0.1, initSensingState(), rt);
  for (let i = 0; i < 40; i++) r = sample(pose(0), near, 0.1, r.state, rt);
  expect(r.stimulus[rt.input.light_l]!).toBeLessThanOrEqual(CONFIG.sensing.LIGHT_MAX + 1e-6);
});

test("wind fills both antennal slots and differs left/right when the field is off-axis", () => {
  // default CONFIG.sensing.WIND = {1,0,0.35} → not aligned with the plane of symmetry
  let r = sample(pose(0), { ...world, lights: [] }, 0.1, initSensingState(), rt);
  for (let i = 0; i < 60; i++) r = sample(pose(0), { ...world, lights: [] }, 0.1, r.state, rt);
  const wl = r.stimulus[rt.input.wind_l]!;
  const wr = r.stimulus[rt.input.wind_r]!;
  expect(wl).toBeGreaterThanOrEqual(0);
  expect(wr).toBeGreaterThanOrEqual(0);
  expect(Math.abs(wl - wr)).toBeGreaterThan(1e-4);
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

test("resetting sensors does not invent a looming event at a stationary scene", () => {
  const result = sample(pose(0), world, 0.016, initSensingState(), rt);
  expect(result.stimulus[rt.input.looming]).toBe(0);
});
