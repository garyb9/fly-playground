// Runtime-mutable wrapper around the static `SCENE`. Framework-free: plain data
// only — no `three`, no DOM, and no `Math.random` (object ids are a monotonic
// counter). Every mutator rebuilds the touched array immutably and notifies
// subscribers with a fresh deep-copied snapshot.

import type { SceneConfig, SceneObject, SceneLight } from "../scene.config";
import { SCENE } from "../scene.config";

type Listener = (scene: SceneConfig) => void;

export interface SceneStore {
  /** Deep copy of the current scene — safe for the caller to mutate. */
  snapshot(): SceneConfig;
  /** Register a listener; returns an unsubscribe. Listeners get a snapshot. */
  subscribe(cb: Listener): () => void;
  /** Append an object; returns its fresh unique id. */
  addObject(spec: Omit<SceneObject, "id">): string;
  /** Shallow-merge `patch` into the object with `id` (no-op if absent). */
  updateObject(id: string, patch: Partial<Omit<SceneObject, "id">>): void;
  /** Drop the object with `id` (no-op if absent). */
  removeObject(id: string): void;
  /** Shallow-merge `patch` into `lights[index]` (no-op if out of range). */
  updateLight(index: number, patch: Partial<SceneLight>): void;
  /** Restore the compiled default `SCENE`. */
  reset(): void;
}

/** Next free `obj-N` counter value for a scene (max existing N + 1, else 0). */
function nextCounter(scene: SceneConfig): number {
  let max = 0;
  for (const o of scene.objects) {
    const m = /^obj-(\d+)$/.exec(o.id);
    if (m && m[1] !== undefined) max = Math.max(max, Number(m[1]) + 1);
  }
  return max;
}

export function createSceneStore(initial: SceneConfig): SceneStore {
  let scene: SceneConfig = structuredClone(initial);
  let counter = nextCounter(scene);
  const subs = new Set<Listener>();

  const snapshot = (): SceneConfig => structuredClone(scene);

  const notify = (): void => {
    const snap = snapshot();
    for (const cb of subs) cb(snap);
  };

  return {
    snapshot,

    subscribe(cb) {
      subs.add(cb);
      return () => {
        subs.delete(cb);
      };
    },

    addObject(spec) {
      const id = `obj-${counter++}`;
      scene = {
        ...scene,
        objects: [...scene.objects, structuredClone({ ...spec, id })],
      };
      notify();
      return id;
    },

    updateObject(id, patch) {
      scene = {
        ...scene,
        objects: scene.objects.map((o) => (o.id === id ? structuredClone({ ...o, ...patch }) : o)),
      };
      notify();
    },

    removeObject(id) {
      scene = { ...scene, objects: scene.objects.filter((o) => o.id !== id) };
      notify();
    },

    updateLight(index, patch) {
      scene = {
        ...scene,
        lights: scene.lights.map((l, i) => (i === index ? structuredClone({ ...l, ...patch }) : l)),
      };
      notify();
    },

    reset() {
      scene = structuredClone(SCENE);
      counter = nextCounter(scene);
      notify();
    },
  };
}
