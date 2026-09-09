import { expect, test } from "vitest";
import { flapFrequency } from "./fly";
import { CONFIG } from "../app/config";

test("flap frequency scales with mean wing readout and stays in range", () => {
  expect(flapFrequency({ wing_l: 0, wing_r: 0 })).toBeCloseTo(CONFIG.aesthetic.FLAP_MIN);
  expect(flapFrequency({ wing_l: 1, wing_r: 1 })).toBeCloseTo(CONFIG.aesthetic.FLAP_MAX);
  const mid = flapFrequency({ wing_l: 0.5, wing_r: 0.5 });
  expect(mid).toBeGreaterThan(CONFIG.aesthetic.FLAP_MIN);
  expect(mid).toBeLessThan(CONFIG.aesthetic.FLAP_MAX);
  expect(flapFrequency({ wing_l: 9, wing_r: 9 })).toBeLessThanOrEqual(CONFIG.aesthetic.FLAP_MAX); // clamped
});
