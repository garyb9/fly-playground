import { expect, test } from "vitest";
import { DEFAULT_HABITAT, generateHabitat } from "./habitat";
import { deserializeScene, serializeScene } from "./scene-persist";
import { worldQuery } from "../app/world-query";
import { nearestHit } from "../sensing/raycast";
import { v } from "../body/types";

test("habitats replay from seed and persist flowers and editable lights", () => {
  const scene = generateHabitat(DEFAULT_HABITAT);
  expect(scene).toEqual(generateHabitat(DEFAULT_HABITAT));
  expect(scene).not.toEqual(generateHabitat({ ...DEFAULT_HABITAT, seed: 732 }));
  expect(deserializeScene(serializeScene(scene))).toEqual(scene);
  expect(scene.lights).toHaveLength(4);
  expect(scene.objects.filter((o) => o.kind === "flower")).toHaveLength(24);
});

test("all room counts leave a traversable corridor and solid partitions", () => {
  for (const rooms of [1, 2, 3, 4]) {
    const scene = generateHabitat({ ...DEFAULT_HABITAT, rooms, flowers: 80 });
    const world = worldQuery(scene);
    expect(nearestHit(v(-15, 4, 0), [v(1, 0, 0)], world.aabbs)).toBe(Infinity);
    if (rooms > 1) expect(nearestHit(v(-15, 4, 10), [v(1, 0, 0)], world.aabbs)).toBeLessThan(16);
    for (const obj of scene.objects) {
      expect(obj.position.x).toBeGreaterThan(-16);
      expect(obj.position.x).toBeLessThan(16);
    }
  }
});

test("counts are bounded and zero lights / flowers is supported", () => {
  const empty = generateHabitat({ seed: 0, rooms: 1, lights: 0, flowers: 0 });
  expect(empty.objects).toHaveLength(0);
  expect(empty.lights).toHaveLength(0);
  const capped = generateHabitat({ seed: 0, rooms: 100, lights: 100, flowers: 100 });
  expect(capped.lights).toHaveLength(12);
  expect(capped.objects.filter((o) => o.kind === "flower")).toHaveLength(80);
});
