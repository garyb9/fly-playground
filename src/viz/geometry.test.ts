import { expect, test } from "vitest";
import { parseNeurons } from "../formats/neurons";
import { parseGraph } from "../formats/graph";
import { fixtureBuf } from "../formats/fixture";
import { brainPositions, coreFlags, coreEdgePairs, activityColour } from "./geometry";

const n = parseNeurons(fixtureBuf("neurons.bin"));
const g = parseGraph(fixtureBuf("graph.bin"));

test("brainPositions is count*3 finite floats, scaled", () => {
  const p = brainPositions(n, 2);
  expect(p.length).toBe(n.count * 3);
  expect([...p].every(Number.isFinite)).toBe(true);
  expect(p[0]).toBeCloseTo(n.pos[0]! * 2);
});
test("coreFlags marks exactly coreCount neurons", () => {
  const f = coreFlags(n);
  expect(f.length).toBe(n.count);
  expect([...f].reduce((a, b) => a + b, 0)).toBe(n.coreCount);
});
test("coreEdgePairs are all core-core and even-length", () => {
  const e = coreEdgePairs(g, n.coreCount);
  expect(e.length % 2).toBe(0);
  for (const idx of e) expect(idx).toBeLessThan(n.coreCount);
});
test("activityColour ramps cold→hot monotonically", () => {
  const [r0, gr0, b0] = activityColour(0);
  const [r1, gr1, b1] = activityColour(1);
  expect(r1).toBeGreaterThanOrEqual(r0);
  expect(r1 + gr1 + b1).toBeGreaterThan(r0 + gr0 + b0); // hot is brighter
});
