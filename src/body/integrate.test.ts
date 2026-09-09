import { expect, test } from "vitest";
import { integrate, poseOf, type BodyState } from "./integrate";
import { qIdentity } from "./quat";
import { v } from "./types";
import { CONFIG } from "../app/config";

const rest = (): BodyState => ({
  position: v(0, 5, 0),
  orientation: qIdentity(),
  vel: v(),
  angVel: v(),
});

test("no wrench: gravity pulls the body down", () => {
  let s = rest();
  for (let i = 0; i < 60; i++) s = integrate(s, { force: v(), torque: v() }, null, 1 / 60);
  expect(s.position.y).toBeLessThan(5);
});
test("lift == weight holds altitude", () => {
  let s = rest();
  const w = { force: v(0, CONFIG.physics.GRAVITY * CONFIG.physics.MASS, 0), torque: v() };
  for (let i = 0; i < 120; i++) s = integrate(s, w, null, 1 / 60);
  expect(s.position.y).toBeCloseTo(5, 1);
});
test("linear drag bleeds speed toward zero with no force", () => {
  const s: BodyState = { ...rest(), vel: v(10, 0, 0) };
  const s1 = integrate(s, { force: v(), torque: v() }, null, 0.1);
  const s2 = integrate(s1, { force: v(), torque: v() }, null, 0.1);
  expect(Math.abs(s2.vel.x)).toBeLessThan(Math.abs(s1.vel.x));
});
test("impulse changes velocity instantly", () => {
  const s = integrate(rest(), { force: v(), torque: v() }, v(0, 5, 0), 1 / 60);
  expect(s.vel.y).toBeGreaterThan(0);
});
test("poseOf exposes body axes in world space", () => {
  const p = poseOf(rest());
  expect(p.forward.x).toBeCloseTo(1);
  expect(p.up.y).toBeCloseTo(1);
});
