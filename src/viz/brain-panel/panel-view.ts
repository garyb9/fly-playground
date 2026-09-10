import { CONFIG } from "../../app/config";
import { unit, type RoleName } from "./role-monitor";
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export function cardRect(w: number, h: number): Rect {
  const margin = w < 600 ? 16 : 24;
  return {
    x: margin,
    y: w < 600 ? 44 : margin,
    w: Math.max(0, Math.min(w - margin * 2, w < 1000 ? 280 : CONFIG.brainPanel.width)),
    h: Math.max(0, h - (w < 600 ? 44 : margin) - (w < 600 ? 340 : 260)),
  };
}
export function roleBarStyle(name: RoleName, value: number) {
  return {
    widthPct: unit(value) * 100,
    ramp: name === "looming" ? "warn" : "spark",
    glow: unit(value) > CONFIG.brainPanel.hotRowThreshold,
  };
}
export function regionBarOpacity(count: number, total: number): number {
  return 0.25 + 0.75 * unit(total > 0 ? count / total : 0);
}
