import { expect, test } from "vitest";
import { serializeScene, deserializeScene, loadScene, saveScene } from "./scene-persist";
import { SCENE } from "../scene.config";

test("serialize → deserialize round-trips deep-equal", () => {
  expect(deserializeScene(serializeScene(SCENE))).toEqual(SCENE);
});

test("deserialize rejects wrong version / malformed / wrong shape", () => {
  expect(deserializeScene('{"v":2,"scene":{}}')).toBeNull();
  expect(deserializeScene("not json")).toBeNull();
  expect(deserializeScene("{}")).toBeNull();
  expect(deserializeScene(JSON.stringify({ v: 1, scene: { objects: [] } }))).toBeNull();
  expect(
    deserializeScene(
      JSON.stringify({
        v: 1,
        scene: { bounds: {}, fly: {}, lights: [], objects: [{ kind: "box" }] },
      }),
    ),
  ).toBeNull();
});

test("loadScene / saveScene never throw when localStorage is hostile", () => {
  const holder = globalThis as unknown as { localStorage: unknown };
  const orig = holder.localStorage;
  holder.localStorage = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  };
  try {
    expect(loadScene()).toBeNull();
    expect(() => saveScene(SCENE)).not.toThrow();
  } finally {
    holder.localStorage = orig;
  }
});
