import { expect, test } from "vitest";
import { CONFIG } from "./config";

test("CONFIG is fully populated and sane", () => {
  expect(
    [...JSON.stringify(CONFIG).matchAll(/-?\d+\.?\d*/g)].every((m) => Number.isFinite(+m[0])),
  ).toBe(true);
  expect(CONFIG.physics.ESCAPE_TH).toBeGreaterThan(0);
  expect(CONFIG.physics.ESCAPE_TH).toBeLessThan(1);
  expect(CONFIG.physics.ESCAPE_HYST).toBeGreaterThan(0);
  expect(CONFIG.physics.MASS).toBeGreaterThan(0);
  expect(CONFIG.physics.INERTIA).toBeGreaterThan(0);
  expect(CONFIG.physics.HOVER_S).toBeGreaterThanOrEqual(0);
  expect(CONFIG.sim.snapMax).toBeGreaterThanOrEqual(CONFIG.sim.coreFloor);
  expect(CONFIG.loop.MAX_FRAME_DT).toBeGreaterThan(0);
  expect(CONFIG.worker.MAX_CATCHUP_MS).toBeGreaterThanOrEqual(CONFIG.worker.TICK_MS);
  expect("brainScale" in CONFIG.aesthetic).toBe(false);
  expect("brainCenter" in CONFIG.aesthetic).toBe(false);
  expect(Object.values(CONFIG.brainPanel).every(Number.isFinite)).toBe(true);
  for (const key of ["firingThreshold", "hotRowThreshold", "regionTintMix"] as const) {
    expect(CONFIG.brainPanel[key]).toBeGreaterThanOrEqual(0);
    expect(CONFIG.brainPanel[key]).toBeLessThanOrEqual(1);
  }
  expect(CONFIG.brainPanel.escapeDecayS).toBeGreaterThan(0);
});

test("Plan 02b CONFIG blocks are present and sane", () => {
  const P = CONFIG as unknown as Record<string, Record<string, unknown>>;
  // lif
  const lif = CONFIG.lif;
  const keys = ["dtMs", "tauMMs", "vThreshold", "vReset", "refracMs", "noiseSigma"] as const;
  for (const k of keys) {
    const [lo, hi] = lif.ranges[k];
    expect(hi).toBeGreaterThan(lo);
    expect(lif.defaults[k]).toBeGreaterThanOrEqual(lo);
    expect(lif.defaults[k]).toBeLessThanOrEqual(hi);
  }
  expect(lif.ranges.noiseSigma[0]).toBeGreaterThanOrEqual(0);
  // sensing
  expect(CONFIG.sensing.EPS2).toBeCloseTo(CONFIG.sensing.EPS ** 2, 10);
  expect(CONFIG.sensing.LIGHT_MAX).toBeGreaterThan(0);
  expect(CONFIG.sensing.EYE_SPLAY).toBeGreaterThan(0);
  for (const c of ["x", "y", "z"] as const)
    expect(Number.isFinite(CONFIG.sensing.WIND[c])).toBe(true);
  // physics
  expect(CONFIG.physics.YAW_JITTER_DT).toBeGreaterThan(0);
  // audio
  expect(CONFIG.audio.ambientFreqs.every((f) => f > 0)).toBe(true);
  expect(CONFIG.audio.WING_HZ_MAX).toBeGreaterThan(CONFIG.audio.WING_HZ_MIN);
  expect(CONFIG.audio.masterDefault).toBeGreaterThanOrEqual(0);
  expect(CONFIG.audio.masterDefault).toBeLessThanOrEqual(1);
  // aesthetic
  expect(CONFIG.aesthetic.theme === "dark" || CONFIG.aesthetic.theme === "light").toBe(true);
  expect("grid" in CONFIG.aesthetic).toBe(false);
  expect(CONFIG.aesthetic.BLOOM.dark.THRESHOLD).toBeGreaterThanOrEqual(0);
  expect(CONFIG.aesthetic.BLOOM.dark.THRESHOLD).toBeLessThanOrEqual(1);
  expect(CONFIG.aesthetic.EXPOSURE).toBeGreaterThan(0);
  // hud reservedRect
  const r = CONFIG.hud.reservedRect;
  expect(r.x + r.w).toBeLessThanOrEqual(1);
  expect(r.y + r.h).toBeLessThanOrEqual(1);
  void P;
});
