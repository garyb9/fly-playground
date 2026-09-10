import { test, expect } from "vitest";
import { cardRect, roleBarStyle, regionBarOpacity } from "./panel-view";
test("card keeps a readable width on compact screens and stays inside the viewport", () => {
  for (const [w, h] of [
    [1920, 1080],
    [1440, 900],
    [800, 600],
    [390, 844],
  ]) {
    const r = cardRect(w!, h!);
    expect(r.w).toBeGreaterThanOrEqual(280);
    expect(r.x + r.w).toBeLessThanOrEqual(w!);
    expect(r.y + r.h).toBeLessThanOrEqual(h!);
  }
});
test("bar styles clamp values and preserve warning semantics", () => {
  expect(roleBarStyle("looming", 2)).toEqual({ widthPct: 100, ramp: "warn", glow: true });
  expect(roleBarStyle("escape", NaN).widthPct).toBe(0);
  expect(regionBarOpacity(0, 0)).toBe(0.25);
  expect(regionBarOpacity(5, 5)).toBe(1);
});
