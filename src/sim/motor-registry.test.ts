import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { motorRegistry } from "./motor-registry";
import type { Cell } from "../data/dataset";
const cells: Cell[] = JSON.parse(
  readFileSync(new URL("../../public/data/malecns/full/cells.json", import.meta.url), "utf8"),
);
test("real power and steering groups are bilateral, disjoint and do not tonic-drive steering", () => {
  const m = motorRegistry(cells);
  expect(m.readouts.power_l).toHaveLength(12);
  expect(m.readouts.power_r).toHaveLength(12);
  expect(m.readouts.steer_l!.length).toBeGreaterThan(0);
  expect(m.readouts.steer_l!.length).toBe(m.readouts.steer_r!.length);
  expect(m.tonic.some((i) => [...m.readouts.steer_l!, ...m.readouts.steer_r!].includes(i))).toBe(
    false,
  );
  expect(m.readouts.dnp03_l).toEqual([403]);
  expect(m.readouts.dnp03_r).toEqual([464]);
});
test("all six leg populations resolve native body IDs without overlap or tonic injection", () => {
  const m = motorRegistry(cells);
  const legs = Object.entries(m.readouts).filter(([name]) => name.startsWith("leg_"));
  expect(legs).toHaveLength(6);
  expect(legs.every(([, ids]) => ids.length > 0)).toBe(true);
  const ids = legs.flatMap(([, ids]) => ids);
  expect(ids).toHaveLength(381);
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids.some((i) => m.tonic.includes(i))).toBe(false);
});
