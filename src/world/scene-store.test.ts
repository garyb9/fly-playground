import { expect, test } from "vitest";
import { createSceneStore } from "./scene-store";
import { SCENE } from "../scene.config";
import { v } from "../body/types";

test("addObject appends with a fresh unique id and notifies with a snapshot containing it", () => {
  const store = createSceneStore(SCENE);
  let seen: string[] = [];
  store.subscribe((s) => (seen = s.objects.map((o) => o.id)));
  const id = store.addObject({
    kind: "box",
    position: v(1, 2, 3),
    rotation: v(),
    scale: v(1, 1, 1),
    material: "buoy-a",
  });
  expect(store.snapshot().objects.some((o) => o.id === id)).toBe(true);
  expect(seen).toContain(id);
  const id2 = store.addObject({
    kind: "sphere",
    position: v(),
    rotation: v(),
    scale: v(1, 1, 1),
    material: "buoy-b",
  });
  expect(id2).not.toBe(id);
});

test("updateObject patches only the named fields of only that id", () => {
  const store = createSceneStore(SCENE);
  const target = store.snapshot().objects[0]!.id;
  store.updateObject(target, { position: v(9, 9, 9) });
  const o = store.snapshot().objects.find((x) => x.id === target)!;
  expect(o.position).toEqual(v(9, 9, 9));
  expect(o.scale).toEqual(SCENE.objects[0]!.scale); // untouched
  expect(store.snapshot().objects[1]).toEqual(SCENE.objects[1]); // sibling untouched
});

test("removeObject drops the id; updateLight patches by index; reset restores defaults", () => {
  const store = createSceneStore(SCENE);
  const id = store.snapshot().objects[0]!.id;
  store.removeObject(id);
  expect(store.snapshot().objects.some((o) => o.id === id)).toBe(false);
  store.updateLight(0, { intensity: 999 });
  expect(store.snapshot().lights[0]!.intensity).toBe(999);
  store.reset();
  expect(store.snapshot().objects.length).toBe(SCENE.objects.length);
  expect(store.snapshot().lights[0]!.intensity).toBe(SCENE.lights[0]!.intensity);
});

test("snapshot is a deep copy and subscribe returns a working unsubscribe", () => {
  const store = createSceneStore(SCENE);
  const snap = store.snapshot();
  snap.objects[0]!.position.x = 12345;
  expect(store.snapshot().objects[0]!.position.x).not.toBe(12345);
  let calls = 0;
  const off = store.subscribe(() => calls++);
  store.addObject({
    kind: "box",
    position: v(),
    rotation: v(),
    scale: v(1, 1, 1),
    material: "buoy-a",
  });
  off();
  store.addObject({
    kind: "box",
    position: v(),
    rotation: v(),
    scale: v(1, 1, 1),
    material: "buoy-a",
  });
  expect(calls).toBe(1);
});
