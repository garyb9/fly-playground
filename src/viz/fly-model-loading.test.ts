import { afterEach, expect, test, vi } from "vitest";
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { acquireFlyModel } from "./fly-model";
import { Fly } from "./fly";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function asset(): GLTF {
  const scene = new THREE.Group();
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
  return {
    scene,
    scenes: [scene],
    animations: [],
    cameras: [],
    asset: { version: "2.0" },
    userData: {},
  } as unknown as GLTF;
}

test("removing one fly keeps shared geometry alive until the final consumer leaves", async () => {
  const source = asset();
  const disposed = vi.fn();
  (source.scene.children[0] as THREE.Mesh).geometry.addEventListener("dispose", disposed);
  const fetch = vi.spyOn(GLTFLoader.prototype, "loadAsync").mockResolvedValue(source);
  const a = acquireFlyModel(),
    b = acquireFlyModel();
  await Promise.all([a.ready, b.ready]);
  expect(fetch).toHaveBeenCalledTimes(2); // two LODs, not two fetches per fly
  a.release();
  await Promise.resolve();
  expect(disposed).not.toHaveBeenCalled();
  b.release();
  await Promise.resolve();
  expect(disposed).toHaveBeenCalled();
  const count = disposed.mock.calls.length;
  b.release();
  expect(disposed).toHaveBeenCalledTimes(count);
});

test("failed assets retain a usable fallback and a later fly can retry", async () => {
  vi.stubGlobal("window", {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const fetch = vi.spyOn(GLTFLoader.prototype, "loadAsync").mockRejectedValue(new Error("offline"));
  const fly = new Fly();
  await fly.ready;
  expect(fly.object3d.userData.modelStatus).toBe("fallback");
  expect(fly.object3d.getObjectByName("procedural-fallback")?.visible).toBe(true);
  fly.dispose();
  const next = new Fly();
  await next.ready;
  expect(fetch).toHaveBeenCalledTimes(4);
  next.dispose();
});

test("removal during loading never attaches late meshes to a disposed fly", async () => {
  vi.stubGlobal("window", {});
  let complete!: (gltf: GLTF) => void;
  const pending = new Promise<GLTF>((resolve) => {
    complete = resolve;
  });
  vi.spyOn(GLTFLoader.prototype, "loadAsync").mockReturnValue(pending);
  const fly = new Fly();
  fly.dispose();
  complete(asset());
  await fly.ready;
  expect(fly.object3d.children).toHaveLength(0);
});
