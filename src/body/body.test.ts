import { expect, test } from "vitest";
import { Body } from "./body";
import { v, type WorldQuery, type Readouts } from "./types";

const world: WorldQuery = {
  aabbs: [],
  bounds: { min: v(-20, -20, -20), max: v(20, 20, 20) },
  lights: [],
};
const hoverR = (): Readouts => ({ wing_l: 0, wing_r: 0, thrust: 0, yaw_torque: 0, escape: 0 });

test("with hover readouts the fly holds altitude within a small band", () => {
  const b = new Body(v(0, 5, 0), 0);
  for (let i = 0; i < 600; i++) b.step(1 / 60, hoverR(), world); // 10 s
  // The ValueNoise channels are not zero-mean over a short window. Task 8 gave
  // wing_l / wing_r *independent* noise, so `wing_l - wing_r` carried a standing
  // DC bias that fed a constant roll torque: the body slowly rolled, the lift
  // vector tilted, and the fly spiralled off — descending ~1.2 m by 10 s and
  // diverging from there (Task 9 relaxed this band to 4.5; Task 13's first pass
  // shrank the window to 5 s, which only hid the divergence). Fix in wrench.ts:
  // both wings now take ONE shared noise sample, so noise still jitters the
  // symmetric term s = (wl+wr)/2 (lift/thrust — the feature) but cancels out of
  // the asymmetric term a = wl - wr (roll). Residual altitude drift is now just
  // that small symmetric-lift jitter, ~0.41 m at 10 s and bounded — no spiral.
  // The sibling test asserts the roll term is now exactly zero.
  expect(Math.abs(b.pose().position.y - 5)).toBeLessThan(0.6);
});
test("with hover readouts the fly never rolls — lift stays vertical, no spiral", () => {
  const start = v(0, 5, 0);
  const b = new Body(start, 0);
  for (let i = 0; i < 600; i++) b.step(1 / 60, hoverR(), world); // 10 s
  // Correlated wing-pair noise makes a = wl - wr exactly 0 at rest, so the roll
  // torque ROLL_K * a is exactly 0: the body never rolls, its up axis stays
  // world-vertical, and the tilted-lift spiral that used to drag the fly into
  // the ground cannot occur. (Heading still yaws slowly from the independent
  // yaw-channel noise — expected wander of a fly under constant CRUISE_THRUST,
  // not the roll bug — so angVel stays on the y axis only.)
  expect(b.state().angVel.x).toBe(0);
  expect(b.state().angVel.z).toBe(0);
  expect(b.pose().up.y).toBeGreaterThan(0.9999);
});
test("deterministic: same seed + same inputs → same trajectory", () => {
  const run = () => {
    const b = new Body(v(0, 5, 0), 0);
    for (let i = 0; i < 200; i++) b.step(1 / 60, hoverR(), world);
    return b.pose().position;
  };
  expect(run()).toEqual(run());
});
test("escape readout throws the fly upward", () => {
  const b = new Body(v(0, 5, 0), 0);
  const y0 = b.pose().position.y;
  b.step(1 / 60, { ...hoverR(), escape: 0.95 }, world);
  for (let i = 0; i < 20; i++) b.step(1 / 60, hoverR(), world);
  expect(b.pose().position.y).toBeGreaterThan(y0);
});
test("cruise carries the fly forward (+X) over time", () => {
  const b = new Body(v(0, 5, 0), 0);
  for (let i = 0; i < 120; i++) b.step(1 / 60, hoverR(), world);
  expect(b.pose().position.x).toBeGreaterThan(0.2);
});

test("neural flight loses lift when motor readouts are silenced", () => {
  const w = { aabbs: [], lights: [], bounds: { min: v(-100, -100, -100), max: v(100, 100, 100) } };
  const driven = new Body(v(0, 4, 0), 0, true),
    silent = new Body(v(0, 4, 0), 0, true);
  for (let i = 0; i < 100; i++) {
    driven.step(0.01, { wing_l: 0.5, wing_r: 0.5, thrust: 0.5 }, w);
    silent.step(0.01, {}, w);
  }
  expect(driven.pose().position.y).toBeGreaterThan(silent.pose().position.y + 1);
  expect(driven.pose().position.x).toBeGreaterThan(silent.pose().position.x + 0.2);
});
test("independent body seeds diverge and reset replays the same seed", () => {
  const start = v(0, 5, 0),
    a = new Body(start, 0, false, 101),
    b = new Body(start, 0, false, 202);
  for (let i = 0; i < 120; i++) {
    a.step(1 / 60, hoverR(), world);
    b.step(1 / 60, hoverR(), world);
  }
  const before = a.pose();
  expect(b.pose()).not.toEqual(before);
  a.reset(start, 0);
  for (let i = 0; i < 120; i++) a.step(1 / 60, hoverR(), world);
  expect(a.pose()).toEqual(before);
});
