import { test, expect } from "vitest";
import { parseNeurons } from "../../formats/neurons";
import { parseGraph } from "../../formats/graph";
import { fixtureBuf } from "../../formats/fixture";
import { buildPanelCloud } from "./panel-cloud";
const n = parseNeurons(fixtureBuf("neurons.bin"));
const g = parseGraph(fixtureBuf("graph.bin"));
test("cloud preserves neuron count, clears old activity on depth reduction and filters only points", () => {
  const c = buildPanelCloud(n, g);
  expect(c.points.geometry.getAttribute("position").count).toBe(n.count);
  c.update(new Float32Array(n.count).fill(1));
  c.update(new Float32Array(48).fill(0.5));
  const a = c.points.geometry.getAttribute("aActivity");
  expect(a.getX(47)).toBe(0.5);
  expect(a.getX(48)).toBe(0);
  expect(c.points.geometry.getAttribute("aEnabled").getX(48)).toBe(0);
  c.setHiddenGroups(new Set([2]));
  for (let i = 0; i < n.count; i++)
    expect(c.points.geometry.getAttribute("aVisible").getX(i)).toBe(n.groupId[i] === 2 ? 0 : 1);
  expect(c.edges.geometry.getAttribute("position").count % 2).toBe(0);
  expect(c.edges.geometry.getAttribute("aVisible")).toBeUndefined();
  c.dispose();
});
