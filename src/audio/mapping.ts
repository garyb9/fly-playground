// Pure audio-parameter maps. No Web Audio, no DOM — unit-tested. `audio.ts`
// (the untested Web Audio glue) reads these and only sets AudioParam targets.
import { CONFIG } from "../app/config";

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const mean = (r: { wing_l: number; wing_r: number }): number => (r.wing_l + r.wing_r) / 2;

export function wingToneFreq(r: { wing_l: number; wing_r: number }): number {
  const { WING_HZ_MIN, WING_HZ_MAX } = CONFIG.audio;
  return WING_HZ_MIN + (WING_HZ_MAX - WING_HZ_MIN) * clamp01(mean(r));
}
export function wingToneGain(r: { wing_l: number; wing_r: number }): number {
  return CONFIG.audio.WING_GAIN_MAX * clamp01(mean(r));
}
export function detectEscapeOnset(
  prev: number,
  cur: number,
  th: number,
  hyst: number,
): { onset: boolean; armed: boolean } {
  return { onset: prev < th && cur >= th, armed: cur < th - hyst };
}
