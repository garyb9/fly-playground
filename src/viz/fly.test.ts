import { expect, test } from "vitest";
import { flapFrequency } from "./fly";
import { CONFIG } from "../app/config";

test("flap frequency scales with mean wing readout and stays in range", () => {
  expect(flapFrequency({ wing_l: 0, wing_r: 0 })).toBeCloseTo(CONFIG.aesthetic.FLAP_MIN);
  expect(flapFrequency({ wing_l: 1, wing_r: 1 })).toBeCloseTo(CONFIG.aesthetic.FLAP_MAX);
  const mid = flapFrequency({ wing_l: 0.5, wing_r: 0.5 });
  expect(mid).toBeGreaterThan(CONFIG.aesthetic.FLAP_MIN);
  expect(mid).toBeLessThan(CONFIG.aesthetic.FLAP_MAX);
  expect(flapFrequency({ wing_l: 9, wing_r: 9 })).toBeLessThanOrEqual(CONFIG.aesthetic.FLAP_MAX); // clamped
});

test("camera target follows rendered body transforms and excludes wing flapping", async () => {
  const { Fly } = await import("./fly");
  const { Vector3 } = await import("three");
  const fly = new Fly();
  const point = new Vector3();
  const pose = {
    position: { x: 3, y: 4, z: 5 },
    orientation: { x: 0, y: 0, z: 0, w: 1 },
    forward: { x: 1, y: 0, z: 0 },
    up: { x: 0, y: 1, z: 0 },
  };
  fly.update({}, pose, 0);
  const a = fly.cameraTarget(point).clone();
  fly.update({}, pose, 0.02);
  expect(fly.cameraTarget(point).distanceTo(a)).toBeLessThan(1e-10);
  fly.object3d.position.y += 0.15;
  expect(fly.cameraTarget(point).y - a.y).toBeCloseTo(0.15);
});
