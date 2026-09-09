import type { SimBridge, SimInitConfig, SimState, LifParams } from "./sim-bridge";
import type { FromWorker, ToWorker } from "./protocol";
import { buildRoleTable, type RoleTable } from "../sim/roles";
import { parseGroups } from "../formats/groups";
import { RingLayout, writeInput, readOutput } from "./ring";

export class SabBridge implements SimBridge {
  private worker: Worker;
  private roleTable!: RoleTable;
  private layout!: RingLayout;
  private views!: ReturnType<RingLayout["views"]>;
  private last: SimState = {
    readouts: new Float32Array(0),
    activity: new Float32Array(0),
    simHz: 0,
    tick: 0,
    paused: false,
  };

  constructor(workerFactory: () => Worker) {
    this.worker = workerFactory();
  }

  init(
    assets: { neurons: ArrayBuffer; graph: ArrayBuffer; groups: unknown },
    config: SimInitConfig,
  ) {
    return new Promise<{ nNeurons: number; coreCount: number; roleTable: RoleTable }>(
      (resolve, reject) => {
        // Peek at role counts to size the ring before the worker replies.
        const groups = parseGroups(assets.groups);
        const rt = buildRoleTable(groups);
        this.roleTable = rt;
        this.layout = new RingLayout(rt.inputOrder.length, rt.readoutOrder.length, config.snapMax);
        const sab = new SharedArrayBuffer(this.layout.bytes);
        this.views = this.layout.views(sab);
        this.last = {
          readouts: new Float32Array(rt.readoutOrder.length),
          activity: new Float32Array(0),
          simHz: 0,
          tick: 0,
          paused: false,
        };
        this.worker.onmessage = (e: MessageEvent<FromWorker>) => {
          const m = e.data;
          if (m.t === "ready")
            resolve({ nNeurons: m.nNeurons, coreCount: m.coreCount, roleTable: rt });
          else if (m.t === "error") reject(new Error(m.message));
        };
        this.worker.postMessage(
          { t: "init", assets, config, sab } as ToWorker & { sab: SharedArrayBuffer },
          [assets.neurons, assets.graph],
        );
      },
    );
  }

  setStimulus(v: Float32Array) {
    writeInput(this.views, v);
  }
  readState() {
    const got = readOutput(this.views);
    if (got) this.last = { ...got };
    return this.last;
  }
  setActiveCount(n: number) {
    this.worker.postMessage({ t: "setActiveCount", n } as ToWorker);
  }
  setParams(p: Partial<LifParams>) {
    this.worker.postMessage({ t: "setParams", p } as ToWorker);
  }
  pause() {
    this.worker.postMessage({ t: "pause" } as ToWorker);
  }
  resume() {
    this.worker.postMessage({ t: "resume" } as ToWorker);
  }
  reset() {
    this.worker.postMessage({ t: "reset" } as ToWorker);
  }
  dispose() {
    this.worker.postMessage({ t: "dispose" } as ToWorker);
    this.worker.terminate();
  }
}
