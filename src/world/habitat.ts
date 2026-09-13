import { SCENE, type SceneConfig, type SceneObject } from "../scene.config";
import { v } from "../body/types";

export interface HabitatOptions {
  seed: number;
  rooms: number;
  lights: number;
  flowers: number;
}
export const DEFAULT_HABITAT: HabitatOptions = { seed: 731, rooms: 3, lights: 4, flowers: 24 };
const count = (n: number, max: number, min = 0) =>
  Math.max(min, Math.min(max, Math.round(Number.isFinite(n) ? n : min)));

/** Repeatable layout. Doorways and the central flight corridor remain clear. */
export function generateHabitat(options: HabitatOptions): SceneConfig {
  let seed = options.seed >>> 0;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const rooms = count(options.rooms, 4, 1);
  const scene = structuredClone(SCENE);
  scene.objects = [];
  scene.lights = [];
  scene.fly.start = v(-16 + 16 / rooms, 4, 0);
  const object = (
    kind: SceneObject["kind"],
    position: ReturnType<typeof v>,
    scale: ReturnType<typeof v>,
    material: string,
  ) => {
    scene.objects.push({
      id: `obj-${scene.objects.length}`,
      kind,
      position,
      scale,
      rotation: v(),
      material,
    });
  };
  for (let i = 1; i < rooms; i++) {
    const x = -16 + (32 * i) / rooms;
    // Two full-height wall sections leave a six-unit-wide passage between rooms.
    for (const z of [-9.5, 9.5]) object("box", v(x, 7, z), v(0.18, 7, 6.5), "buoy-b");
    object("box", v(x, 11, 0), v(0.18, 3, 3), "buoy-b");
  }
  for (let i = 0; i < count(options.flowers, 80); i++) {
    const room = i % rooms;
    const x = -16 + (32 * (room + 0.18 + random() * 0.64)) / rooms;
    const z = (random() < 0.5 ? -1 : 1) * (4 + random() * 9);
    const height = 0.8 + random() * 1.8;
    object(
      "flower",
      v(x, height, z),
      v(0.55 + random() * 0.4, height, 0.55),
      ["rose", "lilac", "gold"][i % 3]!,
    );
  }
  for (let i = 0; i < count(options.lights, 12); i++) {
    const room = i % rooms;
    scene.lights.push({
      position: v(
        -16 + (32 * (room + 0.2 + random() * 0.6)) / rooms,
        5 + random() * 6,
        -11 + random() * 22,
      ),
      color: [0xffdfaa, 0xaee9dc, 0xd1b9ff][i % 3]!,
      intensity: 30 + random() * 40,
    });
  }
  return scene;
}
