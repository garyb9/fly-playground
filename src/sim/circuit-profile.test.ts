import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { circuitProfile } from "./circuit-profile";
import { motorRegistry } from "./motor-registry";
test("the shipped saccade preset retains more of the native pathway than just the named cells", () => {
  const base = new URL("../../public/data/malecns/full/", import.meta.url);
  const bytes = readFileSync(new URL("graph.bin", base));
  const m = motorRegistry(JSON.parse(readFileSync(new URL("cells.json", base), "utf8")));
  const sources = [...m.readouts.dnp03_l!, ...m.readouts.dnp03_r!];
  const motors = [...m.readouts.steer_l!, ...m.readouts.steer_r!];
  const p = circuitProfile(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    sources,
    motors,
    1585,
  );
  expect(p.retainedEdges).toBeGreaterThan(0);
  expect(p.indices.length).toBeGreaterThan(sources.length + motors.length);
  expect(p.minimumDepth).toBeGreaterThan(1585);
  expect(p.minimumDepth).toBeLessThanOrEqual(166700);
  expect(p.indices.every((i) => i < p.minimumDepth)).toBe(true);
});
