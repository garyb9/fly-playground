import { expect, test } from "vitest";
import { RingLayout, writeOutput, readOutput, writeInput, readInput } from "./ring";

const L = new RingLayout(6, 5, 16);

test("output round-trips through the ring", () => {
  const sab = new SharedArrayBuffer(L.bytes);
  const v = L.views(sab);
  const readouts = Float32Array.from([0.1, 0.2, 0.3, 0.4, 0.5]);
  const activity = Float32Array.from({ length: 16 }, (_, i) => i / 16);
  writeOutput(v, {
    readouts,
    activity,
    nSnapshot: 10,
    activeCount: 200,
    simHz: 187.5,
    tick: 4_000_000_050,
    paused: 0,
  });
  const got = readOutput(v);
  expect(got).not.toBeNull();
  expect([...got!.readouts]).toEqual([...readouts]);
  expect([...got!.activity]).toEqual([...activity.slice(0, 10)]);
  expect(got!.simHz).toBeCloseTo(187.5, 1);
  expect(got!.tick).toBe(4_000_000_050); // 53-bit split survives
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
