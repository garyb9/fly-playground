import { expect, test } from "vitest";
import { mapReadouts, initEscapeState } from "./wrench";
import { ValueNoise } from "./noise";
import { qIdentity } from "./quat";
import { v, type Pose, type Readouts } from "./types";
import { CONFIG } from "../app/config";

const pose: Pose = {
  position: v(),
  orientation: qIdentity(),
  forward: v(1, 0, 0),
  up: v(0, 1, 0),
};
const noNoise = { at: () => 0 } as unknown as ValueNoise;
const R = (o: Partial<Readouts>): Readouts => ({
  wing_l: 0,
  wing_r: 0,
  thrust: 0,
  yaw_torque: 0,
  escape: 0,
  ...o,
});
test("separate motor decoder isolates power from steering and ignores legacy thrust", () => {
  const map = (r: Readouts) =>
    mapReadouts(r, pose, initEscapeState(), 0.005, noNoise, 0, true).wrench;
  const base = { power_l: 0.5, power_r: 0.5, steer_l: 0, steer_r: 0 };
  expect(map({ ...base, thrust: 1 })).toEqual(map(base));
  expect(map({ ...base, steer_l: 0.3 }).force).toEqual(map(base).force);
  expect(map({ ...base, power_l: 0.8 }).torque).toEqual(map(base).torque);
  expect(map({ ...base, steer_l: 0.3 }).torque.y).toBeGreaterThan(0);
  expect(map({ ...base, steer_r: 0.3 }).torque.y).toBeLessThan(0);
});

test("hover: symmetric wing at HOVER_S cancels gravity in the vertical force", () => {
  const { wrench } = mapReadouts(
    R({ wing_l: CONFIG.physics.HOVER_S, wing_r: CONFIG.physics.HOVER_S }),
    pose,
    initEscapeState(),
    0.016,
    noNoise,
    0,
  );
  expect(wrench.force.y).toBeCloseTo(CONFIG.physics.GRAVITY * CONFIG.physics.MASS, 3); // lift term == weight; net vs gravity handled in integrate
});
test("wing asymmetry produces roll + yaw of matching sign", () => {
  const { wrench } = mapReadouts(
    R({ wing_l: 1, wing_r: 0 }),
    pose,
    initEscapeState(),
    0.016,
    noNoise,
    0,
  );
  expect(Math.sign(wrench.torque.x)).toBe(Math.sign(CONFIG.physics.ROLL_K));
  expect(wrench.torque.y).not.toBe(0);
});
test("escape rising past threshold fires exactly one impulse and starts a lockout", () => {
  let esc = initEscapeState();
  let r = mapReadouts(R({ escape: 0.9, thrust: 1 }), pose, esc, 0.016, noNoise, 0);
  expect(r.firedImpulse).not.toBeNull();
  esc = r.esc;
  // still held high next frame: no second impulse, thrust suppressed during lockout
  r = mapReadouts(R({ escape: 0.9, thrust: 1 }), pose, esc, 0.016, noNoise, 0.016);
  expect(r.firedImpulse).toBeNull();
  expect(r.wrench.force.x).toBeCloseTo(0, 5); // thrust ignored under lockout
});
test("escape must fall below TH - HYST before it can re-arm", () => {
  let esc = initEscapeState();
  esc = mapReadouts(R({ escape: 0.9 }), pose, esc, 0.5, noNoise, 0).esc; // fired; lockout will elapse with dt=0.5
  const partial = mapReadouts(
    R({ escape: CONFIG.physics.ESCAPE_TH - CONFIG.physics.ESCAPE_HYST / 2 }),
    pose,
    esc,
    0.016,
    noNoise,
    1,
  ).esc;
  const held = mapReadouts(R({ escape: 0.9 }), pose, partial, 0.016, noNoise, 1.1);
  expect(held.firedImpulse).toBeNull(); // never dropped far enough to re-arm
});

test("at rest, yaw torque from noise is mean-zero over a 15s window (no heading drift)", () => {
  const noise = new ValueNoise(CONFIG.sim.seed);
  const dt = 1 / 60;
  let sumTorqueY = 0;
  let n = 0;
  for (let t = 0; t < 15; t += dt) {
    const { wrench } = mapReadouts(R({}), pose, initEscapeState(), dt, noise, t);
    sumTorqueY += wrench.torque.y;
    n++;
  }
  const meanTorqueY = sumTorqueY / n;
  // A DC bias here integrates into a steady heading rate. The finite-difference
  // jitter is the increment of a stationary process → mean ~0.
  expect(Math.abs(meanTorqueY)).toBeLessThan(1e-3);
  // The time-integral (∝ heading change) must also stay bounded, not grow with the window.
  expect(Math.abs(sumTorqueY * dt)).toBeLessThan(0.05);
});
