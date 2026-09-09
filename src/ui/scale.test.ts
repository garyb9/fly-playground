import { expect, test } from "vitest";
import {
  sliderToCount,
  countToSlider,
  meterFraction,
  lifSlider,
  lifSliderPos,
  volumeGain,
} from "./scale";

test("depth slider is a clamped log map between coreCount and N", () => {
  expect(sliderToCount(0, 48, 500)).toBe(48);
  expect(sliderToCount(1, 48, 500)).toBe(500);
  expect(sliderToCount(-1, 48, 500)).toBe(48);
  expect(sliderToCount(2, 48, 500)).toBe(500);
  const mid = sliderToCount(0.5, 48, 500);
  expect(mid).toBeGreaterThan(48);
  expect(mid).toBeLessThan(500);
  // log scale: geometric midpoint ≈ sqrt(48*500) ≈ 155
  expect(mid).toBeGreaterThan(120);
  expect(mid).toBeLessThan(200);
  // round-trip within one integer
  for (const n of [48, 100, 240, 499, 500]) {
    expect(Math.abs(sliderToCount(countToSlider(n, 48, 500), 48, 500) - n)).toBeLessThanOrEqual(1);
  }
});

test("meterFraction maps into [0,1]; signed kinds centre at 0.5", () => {
  expect(meterFraction(0, "escape")).toBe(0);
  expect(meterFraction(1, "escape")).toBe(1);
  expect(meterFraction(5, "escape")).toBe(1); // clamp
  expect(meterFraction(0, "yaw")).toBeCloseTo(0.5, 6);
  expect(meterFraction(1, "yaw")).toBe(1);
  expect(meterFraction(-1, "yaw")).toBe(0);
  expect(meterFraction(0, "proximity")).toBe(0);
});

test("lifSlider clamps to the declared range and inverts", () => {
  const ranges = {
    dtMs: [1, 10],
    tauMMs: [2, 80],
    vThreshold: [0.3, 3],
    vReset: [-1, 0.5],
    refracMs: [0, 10],
    noiseSigma: [0, 0.3],
  } as const;
  expect(lifSlider("noiseSigma", 0, ranges)).toBe(0);
  expect(lifSlider("noiseSigma", 1, ranges)).toBeCloseTo(0.3, 6);
  expect(lifSlider("tauMMs", -5, ranges)).toBe(2);
  expect(lifSliderPos("tauMMs", lifSlider("tauMMs", 0.4, ranges), ranges)).toBeCloseTo(0.4, 6);
});

test("volumeGain is a convex perceptual curve on [0,1]", () => {
  expect(volumeGain(0)).toBe(0);
  expect(volumeGain(1)).toBe(1);
  expect(volumeGain(0.5)).toBeLessThan(0.5); // convex
  expect(volumeGain(0.3)).toBeLessThan(volumeGain(0.6));
});
