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
