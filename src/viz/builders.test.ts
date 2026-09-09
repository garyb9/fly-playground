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

test("buildWorld: one mesh per object + one marker per light + a ground disc; one cool key + hemi; no grid", () => {
  const world = buildWorld(SCENE);
  const meshes = world.children.filter((c) => c instanceof THREE.Mesh);
  const dir = world.children.filter((c) => c instanceof THREE.DirectionalLight);
  const hemi = world.children.filter((c) => c instanceof THREE.HemisphereLight);
  const points = world.children.filter((c) => c instanceof THREE.PointLight);
  expect(points.length).toBe(SCENE.lights.length);
  expect(dir.length).toBe(1);
  expect(hemi.length).toBe(1);
  // objects + one emissive marker per light + the ground disc
  expect(meshes.length).toBe(SCENE.objects.length + SCENE.lights.length + 1);
  expect(world.children.some((c) => c.name === "ground-disc")).toBe(true);
});
