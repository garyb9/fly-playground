// Pure HUD math. No DOM. hud.ts reads these and only sets element properties.
import type { LifParams } from "../bridge/sim-bridge";

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

export function sliderToCount(t01: number, coreCount: number, nNeurons: number): number {
  const t = clamp01(t01);
  const lo = Math.log(coreCount);
  const hi = Math.log(nNeurons);
  return Math.round(Math.exp(lo + (hi - lo) * t));
}
export function countToSlider(n: number, coreCount: number, nNeurons: number): number {
  const lo = Math.log(coreCount);
  const hi = Math.log(nNeurons);
  return clamp01((Math.log(n) - lo) / (hi - lo));
}

export type MeterKind = "escape" | "thrust" | "yaw" | "proximity" | "looming" | "light" | "wind";
const SIGNED: MeterKind[] = ["thrust", "yaw"];
// display maxima for the unsigned sensory/readout channels
const DISPLAY_MAX: Record<MeterKind, number> = {
  escape: 1,
  thrust: 1,
  yaw: 1,
  proximity: 20,
  looming: 3,
  light: 4,
  wind: 1,
};
export function meterFraction(value: number, kind: MeterKind): number {
  if (SIGNED.includes(kind)) return clamp01(0.5 + value / (2 * DISPLAY_MAX[kind]));
  return clamp01(value / DISPLAY_MAX[kind]);
}

export function lifSlider(
  param: keyof LifParams,
  t01: number,
  ranges: Record<keyof LifParams, readonly [number, number]>,
): number {
  const [lo, hi] = ranges[param];
  return lo + (hi - lo) * clamp01(t01);
}
export function lifSliderPos(
  param: keyof LifParams,
  value: number,
  ranges: Record<keyof LifParams, readonly [number, number]>,
): number {
  const [lo, hi] = ranges[param];
  return clamp01((value - lo) / (hi - lo));
}

export function volumeGain(t01: number): number {
  const t = clamp01(t01);
  return t * t; // simple convex perceptual curve
}
