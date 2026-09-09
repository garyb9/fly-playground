import { expect, test } from "vitest";
import { CONFIG } from "./config";

test("CONFIG is fully populated and sane", () => {
  const flat = JSON.stringify(CONFIG);
  expect(flat).not.toMatch(/null/);
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
});
