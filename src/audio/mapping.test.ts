import { expect, test } from "vitest";
import { wingToneFreq, wingToneGain, detectEscapeOnset } from "./mapping";
import { CONFIG } from "../app/config";

test("wing tone frequency rises with mean wing readout and stays in the audible band", () => {
  const lo = wingToneFreq({ wing_l: 0, wing_r: 0 });
  const hi = wingToneFreq({ wing_l: 1, wing_r: 1 });
  expect(lo).toBeCloseTo(CONFIG.audio.WING_HZ_MIN, 3);
  expect(hi).toBeCloseTo(CONFIG.audio.WING_HZ_MAX, 3);
  expect(wingToneFreq({ wing_l: 0.5, wing_r: 0.5 })).toBeGreaterThan(lo);
  expect(wingToneFreq({ wing_l: 9, wing_r: 9 })).toBeLessThanOrEqual(CONFIG.audio.WING_HZ_MAX);
});

test("wing tone gain is ~0 at rest and rises with amplitude, capped", () => {
  expect(wingToneGain({ wing_l: 0, wing_r: 0 })).toBeCloseTo(0, 6);
  expect(wingToneGain({ wing_l: 1, wing_r: 1 })).toBeCloseTo(CONFIG.audio.WING_GAIN_MAX, 6);
  expect(wingToneGain({ wing_l: 5, wing_r: 5 })).toBeLessThanOrEqual(CONFIG.audio.WING_GAIN_MAX);
});

test("escape onset fires once on a rising crossing and re-arms only below TH - HYST", () => {
  const th = CONFIG.physics.ESCAPE_TH,
    hyst = CONFIG.physics.ESCAPE_HYST;
  let s = { onset: false, armed: true };
  s = detectEscapeOnset(0.1, 0.2, th, hyst);
  expect(s.onset).toBe(false);
  s = detectEscapeOnset(0.2, th + 0.1, th, hyst);
  expect(s.onset).toBe(true);
  s = detectEscapeOnset(th + 0.1, th + 0.2, th, hyst);
  expect(s.onset).toBe(false); // still high, no fresh crossing
  s = detectEscapeOnset(th + 0.2, th - hyst / 2, th, hyst);
  expect(s.armed).toBe(false); // shallow dip — not below TH - HYST, so not re-armed
  s = detectEscapeOnset(th - hyst / 2, th + 0.3, th, hyst);
  expect(s.armed).toBe(false); // back high — still not re-armed
  s = detectEscapeOnset(th + 0.3, th - hyst - 0.01, th, hyst);
  expect(s.armed).toBe(true); // deep dip below TH - HYST — now re-armed
  s = detectEscapeOnset(th - hyst - 0.01, th + 0.1, th, hyst);
  expect(s.onset).toBe(true);
});
