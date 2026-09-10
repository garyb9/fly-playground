import { expect, test } from "vitest";
import { updateFollowCamera } from "./follow-camera";
import { v, type Pose } from "../body/types";
import { qIdentity } from "../body/quat";

const pose: Pose = {
  position: v(0, 0, 0),
  orientation: qIdentity(),
  forward: v(1, 0, 0),
  up: v(0, 1, 0),
};

test("camera converges toward the offset target and stops (no overshoot — diff only shrinks)", () => {
  let cam = v(0, 0, 0);
  let prevDiff = Infinity;
  const targetX = -3.2; // OFFSET.x rotated by identity
  for (let i = 0; i < 800; i++) {
    const r = updateFollowCamera(cam, pose, 1 / 60);
    const diff = Math.hypot(r.position.x - targetX, r.position.y - 1.4, r.position.z - 0);
    expect(diff).toBeLessThanOrEqual(prevDiff + 1e-9); // monotone decrease, never overshoots
    prevDiff = diff;
    cam = r.position;
  }
  const settled = updateFollowCamera(cam, pose, 1 / 60);
  const d = Math.hypot(
    settled.position.x - cam.x,
    settled.position.y - cam.y,
    settled.position.z - cam.z,
  );
  expect(d).toBeLessThan(5e-3); // effectively at rest after 800 steps at omega=14
  expect(settled.lookAt.x).toBeCloseTo(pose.position.x + pose.forward.x * 2.5); // LOOKAHEAD
});
test("lookAt leads the fly along its forward axis", () => {
  const r = updateFollowCamera(v(-5, 2, 0), pose, 1 / 60);
  expect(r.lookAt.x).toBeGreaterThan(pose.position.x);
});

test("idle sway / escape kick offsets are opt-in and shift the camera by a bounded amount", () => {
  const base = updateFollowCamera(v(-5, 2, 0), pose, 1 / 60);
  const swayed = updateFollowCamera(v(-5, 2, 0), pose, 1 / 60, { sway: v(0.02, 0, 0.02) });
  const d = Math.hypot(
    swayed.position.x - base.position.x,
    swayed.position.y - base.position.y,
    swayed.position.z - base.position.z,
  );
  expect(d).toBeGreaterThan(0);
  expect(d).toBeLessThan(0.1);
});

test("no opts is byte-identical to today, and the kick adds shove + roll", () => {
  const base = updateFollowCamera(v(-5, 2, 0), pose, 1 / 60);
  expect(updateFollowCamera(v(-5, 2, 0), pose, 1 / 60, undefined)).toEqual(base);
  expect(updateFollowCamera(v(-5, 2, 0), pose, 1 / 60, {})).toEqual(base);
  expect(base.roll).toBe(0);

  const kicked = updateFollowCamera(v(-5, 2, 0), pose, 1 / 60, {
    kick: { posShove: v(0, 0.3, 0), roll: 0.026 },
  });
  expect(kicked.position.y).toBeCloseTo(base.position.y + 0.3);
  expect(kicked.roll).toBeCloseTo(0.026);
  // lookAt is untouched by the offsets — the camera shoves, the framing holds.
  expect(kicked.lookAt).toEqual(base.lookAt);
});
