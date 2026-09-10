import { expect, test } from "vitest";
import {
  sliderToCount,
  countToSlider,
  meterFraction,
  lifSlider,
  lifSliderPos,
  loomingWarnColour,
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

test("loomingWarnColour warns neuron -> ember -> escape-warm across [0,1]", () => {
  const rgbRe = /^rgb\((\d+), (\d+), (\d+)\)$/;
  const red = (s: string): number => {
    const m = rgbRe.exec(s);
    if (!m) throw new Error(`not an rgb() string: ${s}`);
    return Number(m[1]);
  };
  expect(loomingWarnColour(0)).toBe("rgb(74, 143, 168)"); // neuron #4A8FA8
  expect(loomingWarnColour(0.5)).toBe("rgb(255, 178, 90)"); // ember #FFB25A
  expect(loomingWarnColour(1)).toBe("rgb(255, 241, 218)"); // escape-warm #FFF1DA
  for (const x of [-1, 0, 0.2, 0.5, 0.8, 1, 2]) {
    expect(loomingWarnColour(x)).toMatch(rgbRe);
  }
  // red channel climbs (monotone-ish) as the looming warning rises
  expect(red(loomingWarnColour(0))).toBeLessThan(red(loomingWarnColour(0.5)));
  expect(red(loomingWarnColour(0.5))).toBeLessThanOrEqual(red(loomingWarnColour(1)));
  // clamped outside [0,1]
  expect(loomingWarnColour(-3)).toBe(loomingWarnColour(0));
  expect(loomingWarnColour(9)).toBe(loomingWarnColour(1));
});

test("volumeGain is a convex perceptual curve on [0,1]", () => {
  expect(volumeGain(0)).toBe(0);
  expect(volumeGain(1)).toBe(1);
  expect(volumeGain(0.5)).toBeLessThan(0.5); // convex
  expect(volumeGain(0.3)).toBeLessThan(volumeGain(0.6));
});
