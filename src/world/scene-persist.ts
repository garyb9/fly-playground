// Versioned `localStorage` (de)serialisation for the runtime scene. Framework-free.
// Every `localStorage` touch is guarded: a private-mode / storage-disabled browser
// degrades to the compiled default `SCENE` instead of throwing.

import type { SceneConfig } from "../scene.config";

const KEY = "fly-playground.scene.v1";

export function serializeScene(scene: SceneConfig): string {
  return JSON.stringify({ v: 1, scene });
}

/** Parse + validate a serialized scene. Returns `null` on any mismatch. */
export function deserializeScene(json: string): SceneConfig | null {
  try {
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed !== "object" || parsed === null) return null;
    const outer = parsed as Record<string, unknown>;
    if (outer.v !== 1) return null;

    const s = outer.scene;
    if (typeof s !== "object" || s === null) return null;
    const scene = s as Record<string, unknown>;
    if (
      !Array.isArray(scene.objects) ||
      !Array.isArray(scene.lights) ||
      !scene.bounds ||
      !scene.fly
    ) {
      return null;
    }

    const objectsOk = scene.objects.every((o) => {
      if (typeof o !== "object" || o === null) return false;
      const rec = o as Record<string, unknown>;
      return typeof rec.id === "string" && typeof rec.kind === "string";
    });
    if (!objectsOk) return null;

    return scene as unknown as SceneConfig;
  } catch {
    return null;
  }
}

/** Read the persisted scene, or `null` if absent / invalid / storage hostile. */
export function loadScene(): SceneConfig | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? deserializeScene(raw) : null;
  } catch {
    return null;
  }
}

/** Persist the scene; silently a no-op if storage is unavailable. */
export function saveScene(scene: SceneConfig): void {
  try {
    localStorage.setItem(KEY, serializeScene(scene));
  } catch {
    /* storage unavailable */
  }
}
