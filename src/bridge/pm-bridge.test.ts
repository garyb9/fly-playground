import { expect, test } from "vitest";
import { PmBridge } from "./pm-bridge";
import type { ToWorker, FromWorker } from "./protocol";

class FakeWorker {
  onmessage: ((e: { data: FromWorker }) => void) | null = null;
  posted: ToWorker[] = [];
  handler: (m: ToWorker, reply: (f: FromWorker, transfer?: Transferable[]) => void) => void =
    () => {};
  postMessage(m: ToWorker) {
    this.posted.push(m);
    queueMicrotask(() => this.handler(m, (f) => this.onmessage?.({ data: f })));
  }
  terminate() {}
}

test("init resolves on ready and exposes roleTable", async () => {
  const fw = new FakeWorker();
  fw.handler = (m, reply) => {
    if (m.t === "init")
      reply({
        t: "ready",
        nNeurons: 500,
        coreCount: 48,
        groups: { roles: { input: { looming: [0] }, readout: { escape: [1] } } },
      });
  };
  const b = new PmBridge(() => fw as unknown as Worker);
  const info = await b.init(
    { neurons: new ArrayBuffer(8), graph: new ArrayBuffer(8), groups: {} },
    { seed: 1, snapMax: 16 },
  );
  expect(info.nNeurons).toBe(500);
  expect(info.roleTable.readoutOrder).toEqual(["escape"]);
});

test("init consumes (transfers) the caller's neurons/graph buffers", async () => {
  // A FakeWorker that performs a REAL structured-clone transfer, so the source
  // ArrayBuffers detach exactly as they do across a Worker boundary. This is the
  // regression guard for the main.ts boot bug: `bridge.init` hands the caller's
  // `neurons`/`graph` to the worker in the postMessage transfer list, which
  // detaches them synchronously — so `main()` MUST `parseNeurons`/`parseGraph`
  // BEFORE calling `bridge.init`, never after.
  class TransferringWorker {
    onmessage: ((e: { data: FromWorker }) => void) | null = null;
    postMessage(m: ToWorker, transfer: Transferable[] = []) {
      structuredClone(m, { transfer }); // really detaches everything in `transfer`
      queueMicrotask(() =>
        this.onmessage?.({
          data: {
            t: "ready",
            nNeurons: 4,
            coreCount: 2,
            groups: { roles: { input: { a: [0] }, readout: { b: [1] } } },
          },
        }),
      );
    }
    terminate() {}
  }

  const fw = new TransferringWorker();
  const b = new PmBridge(() => fw as unknown as Worker);
  const neurons = new ArrayBuffer(16);
  const graph = new ArrayBuffer(16);
  expect(neurons.byteLength).toBe(16);
  await b.init({ neurons, graph, groups: {} }, { seed: 1, snapMax: 16 });
  expect(neurons.byteLength).toBe(0);
  expect(graph.byteLength).toBe(0);
});

test("setStimulus posts a stimulus message; readState returns last state", async () => {
  const fw = new FakeWorker();
  fw.handler = (m, reply) => {
    if (m.t === "init")
      reply({
        t: "ready",
        nNeurons: 4,
        coreCount: 2,
        groups: { roles: { input: { a: [0] }, readout: { b: [1] } } },
      });
  };
  const b = new PmBridge(() => fw as unknown as Worker);
  await b.init(
    { neurons: new ArrayBuffer(8), graph: new ArrayBuffer(8), groups: {} },
    { seed: 1, snapMax: 8 },
  );
  b.setStimulus(Float32Array.from([0.5]));
  expect(fw.posted.some((p) => p.t === "stimulus")).toBe(true);
  fw.onmessage?.({
    data: {
      t: "state",
      readouts: Float32Array.from([0.9]),
      activity: new Float32Array(4),
      simHz: 200,
      tick: 10,
    },
  });
  // NOTE (deviation from plan): readouts is a Float32Array, so 0.9 reads back as
  // Math.fround(0.9); the plan's `toBe(0.9)` cannot pass against its own verbatim code.
  expect(b.readState().readouts[0]).toBe(Math.fround(0.9));
  expect(b.readState().tick).toBe(10);
});
