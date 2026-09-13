import { expect, test } from "vitest";
import { RingLayout, writeOutput, readOutput, writeInput, readInput } from "./ring";
import { v } from "../body/types";

const L = new RingLayout(6, 5, 16);
test("body pose, mode, sensory input and neural tick round-trip in the same snapshot", () => {
  const views = L.views(new SharedArrayBuffer(L.bytes));
  const embodied = {
    state: {
      position: v(1, 2, 3),
      orientation: { x: 0, y: 0, z: 0, w: 1 },
      vel: v(4, 5, 6),
      angVel: v(),
    },
    mode: "grounded" as const,
    stimulus: Float32Array.from([1, 2, 3, 4, 5, 6]),
  };
  writeOutput(views, {
    embodied,
    readouts: new Float32Array(5),
    activity: new Float32Array(16),
    nSnapshot: 16,
    activeCount: 16,
    tick: 89,
    simHz: 200,
    paused: 1,
  });
  const got = readOutput(views)!;
  expect(got.embodied).toEqual(embodied);
  expect(got.tick).toBe(89);
  expect(got.paused).toBe(true);
});

test("output round-trips through the ring", () => {
  const sab = new SharedArrayBuffer(L.bytes);
  const v = L.views(sab);
  const readouts = Float32Array.from([0.1, 0.2, 0.3, 0.4, 0.5]);
  const activity = Float32Array.from({ length: 16 }, (_, i) => i / 16);
  const d = {
    readouts,
    activity,
    nSnapshot: 10,
    activeCount: 200,
    simHz: 187.5,
    tick: 4_000_000_050,
    paused: 0,
  };
  writeOutput(v, d);
  const got = readOutput(v);
  expect(got).not.toBeNull();
  expect([...got!.readouts]).toEqual([...readouts]);
  expect([...got!.activity]).toEqual([...activity.slice(0, 10)]);
  expect(got!.simHz).toBeCloseTo(187.5, 1);
  expect(got!.tick).toBe(4_000_000_050); // 53-bit split survives
  expect(got!.paused).toBe(false);

  writeOutput(v, { ...d, paused: 1 });
  expect(readOutput(v)!.paused).toBe(true);
});

test("a torn read (odd seq) returns null", () => {
  const sab = new SharedArrayBuffer(L.bytes);
  const v = L.views(sab);
  Atomics.store(v.control, 0, 3); // odd: writer mid-write
  expect(readOutput(v)).toBeNull();
});

test("input region is a plain copy", () => {
  const sab = new SharedArrayBuffer(L.bytes);
  const v = L.views(sab);
  writeInput(v, Float32Array.from([1, 2, 3, 4, 5, 6]));
  expect([...readInput(v)]).toEqual([1, 2, 3, 4, 5, 6]);
});
