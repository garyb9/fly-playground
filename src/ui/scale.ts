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

/**
 * Fill colour for the `looming` meter — warn-lerps `neuron` (#4A8FA8) →
 * `ember` (#FFB25A) → `escape-warm` (#FFF1DA) as the looming fraction climbs
 * toward `CONFIG.physics.ESCAPE_TH` (spec §5.1 / §12.4). Two equal segments of
 * `frac01` in [0,1]: 0→0.5 neuron→ember, 0.5→1 ember→escape-warm. Pure; returns
 * a CSS `rgb(...)` string.
 */
export function loomingWarnColour(frac01: number): string {
  const t = clamp01(frac01);
  const neuron = [0x4a, 0x8f, 0xa8] as const;
  const ember = [0xff, 0xb2, 0x5a] as const;
  const warm = [0xff, 0xf1, 0xda] as const;
  const from = t < 0.5 ? neuron : ember;
  const to = t < 0.5 ? ember : warm;
  const seg = t < 0.5 ? t / 0.5 : (t - 0.5) / 0.5;
  const ch = (i: 0 | 1 | 2): number => Math.round(from[i] + (to[i] - from[i]) * seg);
  return `rgb(${ch(0)}, ${ch(1)}, ${ch(2)})`;
}

export function volumeGain(t01: number): number {
  const t = clamp01(t01);
  return t * t; // simple convex perceptual curve
}
