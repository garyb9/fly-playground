import { expect, test } from "vitest";
import { worldQuery } from "./world-query";
import { v } from "../body/types";
import type { SceneConfig } from "../scene.config";

const scene: SceneConfig = {
  bounds: { min: v(-10, 0, -10), max: v(10, 10, 10) },
  objects: [
    { kind: "box", position: v(3, 1, 0), rotation: v(), scale: v(1, 1, 1), material: "clay" },
  ],
  lights: [],
  fly: { start: v(0, 2, 0), heading: 0 },
};

test("box object → an AABB centered on its position", () => {
  const wq = worldQuery(scene);
  expect(wq.aabbs).toHaveLength(1);
  expect(wq.aabbs[0]!.min).toEqual(v(2, 0, -1));
  expect(wq.aabbs[0]!.max).toEqual(v(4, 2, 1));
  expect(wq.bounds).toEqual(scene.bounds);
});
