import { expect, test } from "vitest";
import { qIdentity, qRotate, qIntegrate, qFromAxisAngle } from "./quat";
import { v } from "./types";

test("identity rotates nothing", () => {
  const r = qRotate(qIdentity(), v(1, 2, 3));
  expect([r.x, r.y, r.z].map((n) => +n.toFixed(6))).toEqual([1, 2, 3]);
});
test("90° about +Y sends +X to -Z", () => {
  const q = qFromAxisAngle(v(0, 1, 0), Math.PI / 2);
  const r = qRotate(q, v(1, 0, 0));
  expect(r.x).toBeCloseTo(0);
  expect(r.z).toBeCloseTo(-1);
});
test("qIntegrate keeps the quaternion normalized over many steps", () => {
  let q = qIdentity();
  for (let i = 0; i < 5000; i++) q = qIntegrate(q, v(0.7, -1.3, 0.2), 0.016);
  expect(Math.hypot(q.x, q.y, q.z, q.w)).toBeCloseTo(1, 6);
});
