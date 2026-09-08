import { expect, test } from "vitest";
import { parseNeurons, isCore, isInput, isReadout } from "./neurons";
import { parseGraph, row } from "./graph";
import { parseGroups } from "./groups";
import { fixtureBuf, fixtureJson } from "./fixture";

test("parseNeurons matches the fixture contract", () => {
  const n = parseNeurons(fixtureBuf("neurons.bin"));
  expect(n.count).toBe(500);
  expect(n.coreCount).toBe(48);
  for (let i = 0; i < 48; i++) expect(isCore(n, i)).toBe(true);
  for (let i = 48; i < 500; i++) expect(isCore(n, i)).toBe(false);
  for (let i = 0; i < 8; i++) expect(isInput(n, i)).toBe(true);
  for (let i = 24; i < 32; i++) expect(isReadout(n, i)).toBe(true);
  expect(n.pos.length).toBe(1500);
  expect([...n.pos].every(Number.isFinite)).toBe(true);
});

test("parseGraph yields valid CSR and the looming->escape wiring", () => {
  const g = parseGraph(fixtureBuf("graph.bin"));
  expect(g.nNodes).toBe(500);
  expect(g.offsets.length).toBe(501);
  expect(g.offsets[500]).toBe(g.nEdges);
  expect(g.wNorm).toBeGreaterThan(0);
  for (let i = 0; i < 500; i++) expect(g.offsets[i]! <= g.offsets[i + 1]!).toBe(true);
  expect([...g.targets].every((t) => t < 500)).toBe(true);
  for (let src = 0; src < 8; src++) {
    const tgts = new Set([...row(g, src)].map(([t]) => t));
    for (let esc = 24; esc < 32; esc++) expect(tgts.has(esc)).toBe(true);
  }
});

test("parseGroups reads roles", () => {
  const gr = parseGroups(fixtureJson("groups.json"));
  expect(gr.inputRoles.looming).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  expect(gr.readoutRoles.escape).toEqual([24, 25, 26, 27, 28, 29, 30, 31]);
  expect(gr.groups.length).toBeGreaterThan(0);
});

test("bad magic is rejected with a coded error", () => {
  const buf = fixtureBuf("neurons.bin");
  const u8 = new Uint8Array(buf);
  u8[0] = u8[0]! ^ 0xff;
  expect(() => parseNeurons(buf)).toThrowError(/magic/i);
});

test("truncated graph is rejected", () => {
  const buf = fixtureBuf("graph.bin").slice(0, 40);
  expect(() => parseGraph(buf)).toThrow();
});
