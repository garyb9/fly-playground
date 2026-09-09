import { expect, test } from "vitest";
import { bob, idleSway, escapeKick, loadEnvelope } from "./motion";

test("bob is bounded by amp and periodic at hz", () => {
  const amp = 0.15,
    hz = 0.5;
  let max = -Infinity,
    min = Infinity;
  for (let t = 0; t < 10; t += 1 / 120) {
    const y = bob(t, hz, amp);
    max = Math.max(max, y);
    min = Math.min(min, y);
  }
  expect(max).toBeLessThanOrEqual(amp + 1e-9);
  expect(min).toBeGreaterThanOrEqual(-amp - 1e-9);
  expect(bob(0, hz, amp)).toBeCloseTo(bob(1 / hz, hz, amp), 6); // one period
});

test("idleSway returns a small bounded Vec3", () => {
  for (let t = 0; t < 5; t += 0.1) {
    const s = idleSway(t, 0.1, 0.02);
    expect(Math.hypot(s.x, s.y, s.z)).toBeLessThanOrEqual(0.02 * Math.sqrt(3) + 1e-9);
  }
});

test("escapeKick peaks at t=0 and decays to ~0 by decayS", () => {
  const cfg = { posShove: 0.6, rollDeg: 1.5, decayS: 0.3 };
  const k0 = escapeKick(0, cfg);
  expect(Math.hypot(k0.posShove.x, k0.posShove.y, k0.posShove.z)).toBeGreaterThan(0.3);
  expect(Math.abs(k0.roll)).toBeGreaterThan(0);
  const kEnd = escapeKick(cfg.decayS * 3, cfg);
  expect(Math.hypot(kEnd.posShove.x, kEnd.posShove.y, kEnd.posShove.z)).toBeLessThan(0.02);
  expect(Math.abs(kEnd.roll)).toBeLessThan(0.02);
});

test("loadEnvelope phases rise 0→1 in order banner→ignite→hud", () => {
  const cfg = { bannerS: 1, igniteS: 0.6, hudS: 0.8 };
  expect(loadEnvelope(0, cfg)).toEqual({ banner: 0, ignite: 0, hud: 0 });
  const mid = loadEnvelope(1.2, cfg);
  expect(mid.banner).toBe(1); // banner done by 1.0s
  expect(mid.ignite).toBeGreaterThan(0);
  expect(mid.ignite).toBeLessThanOrEqual(1);
  expect(mid.hud).toBe(0); // hud not started until banner+ignite done
  const end = loadEnvelope(10, cfg);
  expect(end).toEqual({ banner: 1, ignite: 1, hud: 1 });
});
