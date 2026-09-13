export interface EncoderState {
  lightL: number;
  lightR: number;
  initialized: boolean;
}
export const initEncoderState = (): EncoderState => ({ lightL: 0, lightR: 0, initialized: false });
/** Declared current proxies: positive luminance changes and positive facing wind.
 * This does not simulate retinal columns or antennal push/pull mechanics. */
export function encodeModalities(
  lightL: number,
  lightR: number,
  windL: number,
  windR: number,
  dt: number,
  prev: EncoderState,
) {
  const gain = prev.initialized && dt > 0 ? 0.3 / dt : 0;
  const clamp = (x: number) => Math.min(2, Math.max(0, Number.isFinite(x) ? x : 0));
  return {
    light_l: clamp((lightL - prev.lightL) * gain),
    light_r: clamp((lightR - prev.lightR) * gain),
    wind_l: clamp(windL * 0.8),
    wind_r: clamp(windR * 0.8),
    state: { lightL, lightR, initialized: true },
  };
}
