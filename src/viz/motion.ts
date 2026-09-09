// Pure motion curves for the fly bob, the follow-camera idle sway, the escape
// camera kick, and the load-sequence envelope. No `three` — plain numbers / Vec3
// so this is unit-tested under node vitest. The connectome "breath" and the
// "points converge" load phase live in Plan 2c, not here.
import type { Vec3 } from "../body/types";

const TAU = Math.PI * 2;

export function bob(t: number, hz: number, amp: number): number {
  return Math.sin(t * hz * TAU) * amp;
}

export function idleSway(t: number, hz: number, amp: number): Vec3 {
  return {
    x: Math.sin(t * hz * TAU) * amp,
    y: Math.sin(t * hz * TAU * 0.7 + 1.3) * amp * 0.5,
    z: Math.cos(t * hz * TAU * 1.3) * amp,
  };
}

export function escapeKick(
  elapsed: number,
  cfg: { posShove: number; rollDeg: number; decayS: number },
): { posShove: Vec3; roll: number } {
  const e = Math.exp(-elapsed / (cfg.decayS / 3)); // ~3 time-constants inside decayS
  return {
    posShove: { x: 0, y: cfg.posShove * e, z: 0 },
    roll: ((cfg.rollDeg * Math.PI) / 180) * e,
  };
}

export function loadEnvelope(
  t: number,
  cfg: { bannerS: number; igniteS: number; hudS: number },
): { banner: number; ignite: number; hud: number } {
  const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const banner = clamp01(t / cfg.bannerS);
  const ignite = clamp01((t - cfg.bannerS) / cfg.igniteS);
  const hud = clamp01((t - cfg.bannerS - cfg.igniteS) / cfg.hudS);
  return { banner, ignite, hud };
}
