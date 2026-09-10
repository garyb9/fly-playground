import { test, expect } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import {
  initialCamera,
  followTarget,
  centerFly,
  orbitCamera,
  zoomCamera,
  cameraPosition,
} from "./camera-state";
import { CONFIG } from "../app/config";
const target = { x: 2, y: 4, z: 1 };
test("zoom in/out is reversible and normalizes line/page wheel units", () => {
  const s = initialCamera(target);
  const near = zoomCamera(s, -120, 0, 600);
  expect(near.distance).toBeLessThan(s.distance);
  expect(zoomCamera(near, 120, 0, 600).distance).toBeCloseTo(s.distance);
  expect(zoomCamera(s, 3, 1, 600)).toEqual(zoomCamera(s, 48, 0, 600));
  expect(zoomCamera(s, 1, 2, 600)).toEqual(zoomCamera(s, 600, 0, 600));
  expect(zoomCamera(s, NaN, 0, 600)).toEqual(s);
  expect(zoomCamera(s, -1e8, 0, 600).distance).toBe(CONFIG.camera.mouse.minDistance);
  expect(zoomCamera(s, 1e8, 0, 600).distance).toBe(CONFIG.camera.mouse.maxDistance);
});
test("orbit follows the moving fly, and recenter retains distance and orbital direction", () => {
  const s = orbitCamera(zoomCamera(initialCamera(target), 100, 0, 600), 90, -30);
  const moved = { x: 7, y: 8, z: -3 };
  expect(s.mode).toBe("orbit");
  expect(followTarget(s, moved).target).toEqual(moved);
  expect(followTarget(s, moved).azimuth).toBe(s.azimuth);
  const centered = centerFly(s, moved);
  expect(centered).toEqual({ ...s, mode: "follow", target: moved });
  const followed = followTarget(centered, { x: 9, y: 7, z: 0 });
  expect(followed.target).toEqual({ x: 9, y: 7, z: 0 });
  expect(followed.distance).toBe(s.distance);
});
test("orbiting cannot cross vertical poles or create invalid camera transforms", () => {
  const s = orbitCamera(initialCamera(target), 1e6, 1e6);
  expect(s.elevation).toBe(CONFIG.camera.mouse.maxElevation);
  expect(orbitCamera(s, 0, -1e6).elevation).toBe(-CONFIG.camera.mouse.maxElevation);
  expect(Object.values(cameraPosition(s)).every(Number.isFinite)).toBe(true);
});
test("moving fly center projects to viewport center across zoom and orbit angles", () => {
  const camera = new PerspectiveCamera(55, 1.6, 0.1, 500);
  for (const dx of [-700, 0, 200])
    for (const zoom of [-400, 0, 1000]) {
      let s = orbitCamera(zoomCamera(initialCamera(target), zoom, 0, 800), dx, 25);
      s = centerFly(s, { x: 12, y: 3, z: -8 });
      const p = cameraPosition(s);
      camera.position.set(p.x, p.y, p.z);
      camera.lookAt(s.target.x, s.target.y, s.target.z);
      camera.updateMatrixWorld();
      const ndc = new Vector3(s.target.x, s.target.y, s.target.z).project(camera);
      expect(ndc.x).toBeCloseTo(0, 10);
      expect(ndc.y).toBeCloseTo(0, 10);
    }
});
