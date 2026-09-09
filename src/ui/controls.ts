// HUD <-> app contract. Types only — no runtime, no DOM, no `three`.
// `src/ui/` never imports `body/` or `bridge/` internals beyond these type-only
// references (`LifParams`, `Readouts`) and the plain scene data types.

import type { LifParams } from "../bridge/sim-bridge";
import type { SceneConfig, SceneObject, SceneLight } from "../scene.config";
import type { Readouts } from "../body/types";

export type Theme = "dark" | "light";

/**
 * Every control the HUD can drive. Task 7 wires `setActiveCount` / `setPaused`;
 * Tasks 8-10 replace the remaining `main.ts` no-op stubs with real handlers.
 */
export interface HudControls {
  setActiveCount(n: number): void;
  setParams(p: Partial<LifParams>): void;
  setPaused(paused: boolean): void;
  setTheme(theme: Theme): void;
  setGroupVisible(groupId: number, visible: boolean): void;
  setMuted(muted: boolean): void;
  setVolume(v01: number): void;
  addObject(spec: { kind: SceneObject["kind"]; material: string }): void;
  updateObject(id: string, patch: Partial<Pick<SceneObject, "position" | "scale">>): void;
  removeObject(id: string): void;
  updateLight(index: number, patch: Partial<SceneLight>): void;
  resetScene(): void;
}

/** Static config the HUD is constructed from. */
export interface HudModel {
  coreCount: number;
  nNeurons: number;
  groups: number[];
  lif: { defaults: LifParams; ranges: Record<keyof LifParams, readonly [number, number]> };
  scene: SceneConfig;
  theme: Theme;
  reservedRect: { x: number; y: number; w: number; h: number };
}

/** Per-frame data the HUD renders. */
export interface HudFrame {
  readouts: Readouts;
  sensory: Readouts;
  simHz: number;
  activeCount: number;
  paused: boolean;
}
