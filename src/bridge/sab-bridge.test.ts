import { expect, test } from "vitest";
import { RingLayout, writeOutput, readInput } from "./ring";
import { SabBridge } from "./sab-bridge";
import type { FromWorker, ToWorker } from "./protocol";

// The FakeWorker captures the SAB from the `init` message and echoes `ready`.
// NOTE (deviation from plan): the plan typed the fake with `any`; eslint
// (`@typescript-eslint/no-explicit-any`) rejects that, so it is typed with the
// real protocol types instead — same shape, no `eslint-disable`.
const READY_GROUPS = { roles: { input: { a: [0] }, readout: { b: [1] } } };

test("stimulus written by the bridge is visible on the worker side", async () => {
  let sab: SharedArrayBuffer | null = null;
  const fw = {
    onmessage: null as null | ((e: { data: FromWorker }) => void),
    postMessage(m: ToWorker & { sab?: SharedArrayBuffer }) {
      if (m.t === "init") {
        sab = m.sab ?? null;
        queueMicrotask(() =>
          fw.onmessage?.({
            data: { t: "ready", nNeurons: 4, coreCount: 2, groups: READY_GROUPS },
          }),
        );
      }
    },
    terminate() {},
  };
  const b = new SabBridge(() => fw as unknown as Worker);
  // NOTE (deviation from plan): the plan passed `groups: {}` here but then reads
  // the ring as RingLayout(1, 1, 8). SabBridge sizes the ring by peeking
  // `assets.groups`, so `{}` would size RingLayout(0, 0, 8) and the assertion's
  // view would overrun the SAB. Pass the same 1-in/1-out groups the fake's
  // `ready` message already carries.
  await b.init(
    { neurons: new ArrayBuffer(8), graph: new ArrayBuffer(8), groups: READY_GROUPS },
    { seed: 1, snapMax: 8 },
  );
  b.setStimulus(Float32Array.from([0.7]));
  const L = new RingLayout(1, 1, 8);
  const v = L.views(sab!);
  // NOTE (deviation from plan): plan used `toEqual([0.7])`; a Float32 readback is
  // Math.fround(0.7), so an exact compare cannot pass. Use `toBeCloseTo`,
  // matching the plan's own second test.
  expect(readInput(v)[0]).toBeCloseTo(0.7);
});

test("readState survives a torn write by returning the previous good copy", async () => {
  let sab: SharedArrayBuffer | null = null;
  const fw = {
    onmessage: null as null | ((e: { data: FromWorker }) => void),
    postMessage(m: ToWorker & { sab?: SharedArrayBuffer }) {
      if (m.t === "init") {
        sab = m.sab ?? null;
        queueMicrotask(() =>
          fw.onmessage?.({
            data: { t: "ready", nNeurons: 4, coreCount: 2, groups: READY_GROUPS },
          }),
        );
      }
    },
    terminate() {},
  };
  const b = new SabBridge(() => fw as unknown as Worker);
  await b.init(
    { neurons: new ArrayBuffer(8), graph: new ArrayBuffer(8), groups: READY_GROUPS },
    { seed: 1, snapMax: 8 },
  );
  const L = new RingLayout(1, 1, 8);
  const v = L.views(sab!);
  writeOutput(v, {
    readouts: Float32Array.from([0.42]),
    activity: new Float32Array(8),
    nSnapshot: 4,
    activeCount: 4,
    simHz: 200,
    tick: 7,
    paused: 0,
  });
  expect(b.readState().readouts[0]).toBeCloseTo(0.42);
  Atomics.store(v.control, 0, Atomics.load(v.control, 0) + 1); // now odd → torn
  expect(b.readState().readouts[0]).toBeCloseTo(0.42); // unchanged, not garbage
});
