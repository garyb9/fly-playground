import { expect, test } from "vitest";
import * as THREE from "three";
import { parseNeurons } from "../formats/neurons";
import { parseGraph } from "../formats/graph";
import { fixtureBuf } from "../formats/fixture";
import { SCENE } from "../scene.config";
import { buildBrainPoints, buildCoreEdges, buildWorld } from "./builders";

const n = parseNeurons(fixtureBuf("neurons.bin"));
const g = parseGraph(fixtureBuf("graph.bin"));

test("buildBrainPoints geometry has count vertices and coreCount core flags", () => {
  const pts = buildBrainPoints(n, 1);
  const pos = pts.geometry.getAttribute("position");
  const core = pts.geometry.getAttribute("aCore");
  expect(pos.count).toBe(n.count);
  expect(pts.geometry.getAttribute("aActivity").count).toBe(n.count);
  let sum = 0;
  for (let i = 0; i < core.count; i++) sum += core.getX(i);
  expect(sum).toBe(n.coreCount);
});

test("buildCoreEdges index is even-length and core-core only", () => {
  const seg = buildCoreEdges(g, n.coreCount);
  const idx = seg.geometry.getIndex()!;
  expect(idx.count % 2).toBe(0);
  for (let i = 0; i < idx.count; i++) expect(idx.getX(i)).toBeLessThan(n.coreCount);
});

test("buildWorld: one mesh per object, one PointLight per light, plus sun + hemi", () => {
  const world = buildWorld(SCENE);
  const pointLights = world.children.filter((c) => c instanceof THREE.PointLight);
  const dirLights = world.children.filter((c) => c instanceof THREE.DirectionalLight);
  const hemiLights = world.children.filter((c) => c instanceof THREE.HemisphereLight);
  const meshes = world.children.filter((c) => c instanceof THREE.Mesh);
  expect(pointLights.length).toBe(SCENE.lights.length);
  expect(dirLights.length).toBe(1);
  expect(hemiLights.length).toBe(1);
  // one mesh per object + one emissive marker per light
  expect(meshes.length).toBe(SCENE.objects.length + SCENE.lights.length);
});
