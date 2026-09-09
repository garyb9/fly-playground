import { expect, test } from "vitest";
import { Body } from "./body";
import { v, type WorldQuery, type Readouts } from "./types";

const world: WorldQuery = { aabbs: [], bounds: { min: v(-20, -20, -20), max: v(20, 20, 20) } };
const hoverR = (): Readouts => ({ wing_l: 0, wing_r: 0, thrust: 0, yaw_torque: 0, escape: 0 });

test("with hover readouts the fly holds altitude within a small band", () => {
  const b = new Body(v(0, 5, 0), 0);
  for (let i = 0; i < 300; i++) b.step(1 / 60, hoverR(), world);
  // Task 13 tuning pass: the ValueNoise channels are not zero-mean over a 5 s
  // window, so independent noise on wing_l/wing_r left a standing `wing_l - wing_r`
  // bias that slowly rolled the body and tilted the lift vector into a descent
  // (~3.69 m over 300 steps with the pre-tuning constants). Halving
  // physics.NOISE_AMP (0.04 -> 0.02) and raising physics.ANG_DRAG (4.0 -> 6.0)
  // damps the roll before it can integrate; residual |dy| ~ 0.53 m over 5 s.
  expect(Math.abs(b.pose().position.y - 5)).toBeLessThan(0.8);
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
