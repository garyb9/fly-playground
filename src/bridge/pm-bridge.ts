import type { SimBridge, SimInitConfig, SimState, LifParams } from "./sim-bridge";
import type { FromWorker, ToWorker } from "./protocol";
import { buildRoleTable, type RoleTable } from "../sim/roles";
import { parseGroups } from "../formats/groups";

export class PmBridge implements SimBridge {
  private worker: Worker;
  private roleTable!: RoleTable;
  private last: SimState = {
    readouts: new Float32Array(0),
    activity: new Float32Array(0),
    simHz: 0,
    tick: 0,
    paused: false,
  };
  private stim = new Float32Array(0);

  constructor(workerFactory: () => Worker) {
    this.worker = workerFactory();
  }

  init(
    assets: { neurons: ArrayBuffer; graph: ArrayBuffer; groups: unknown },
    config: SimInitConfig,
  ) {
    return new Promise<{ nNeurons: number; coreCount: number; roleTable: RoleTable }>(
      (resolve, reject) => {
        this.worker.onmessage = (e: MessageEvent<FromWorker>) => {
          const m = e.data;
          if (m.t === "ready") {
            this.roleTable = buildRoleTable(parseGroups(m.groups));
            this.stim = new Float32Array(this.roleTable.inputOrder.length);
            this.last = {
              readouts: new Float32Array(this.roleTable.readoutOrder.length),
              activity: new Float32Array(0),
              simHz: 0,
              tick: 0,
              paused: false,
            };
            this.worker.onmessage = (ev: MessageEvent<FromWorker>) => this.onMessage(ev.data);
            resolve({ nNeurons: m.nNeurons, coreCount: m.coreCount, roleTable: this.roleTable });
          } else if (m.t === "error") reject(new Error(m.message));
        };
        this.post({ t: "init", assets, config }, [assets.neurons, assets.graph]);
      },
    );
  }
  private onMessage(m: FromWorker) {
    if (m.t === "state")
      this.last = {
        embodied: m.embodied,
        readouts: m.readouts,
        activity: m.activity,
        simHz: m.simHz,
        tick: m.tick,
        paused: m.paused,
      };
  }
  private post(m: ToWorker, transfer: Transferable[] = []) {
    this.worker.postMessage(m, transfer);
  }

  intervene(command: import("./sim-bridge").Intervention) {
    this.worker.postMessage({ t: "intervene", command } satisfies ToWorker);
  }
  setWorld(world: import("../body/types").WorldQuery) {
    this.post({ t: "world", world });
  }
  setInputs(modalities: boolean, flow: boolean) {
    this.post({ t: "inputs", modalities, flow });
  }
  movement(command: import("../body/movement").MovementCommand) {
    this.post({ t: "movement", command });
  }
  resetBody(start: import("../body/types").Vec3, heading: number) {
    this.post({ t: "resetBody", start, heading });
  }
  setStimulus(v: Float32Array) {
    this.stim = v.slice();
    this.post({ t: "stimulus", v: this.stim }, [this.stim.buffer]);
    this.stim = new Float32Array(this.roleTable.inputOrder.length); // buffer was transferred
  }
  readState() {
    return this.last;
  }
  setActiveCount(n: number) {
    this.post({ t: "setActiveCount", n });
  }
  setParams(p: Partial<LifParams>) {
    this.post({ t: "setParams", p });
  }
  pause() {
    this.post({ t: "pause" });
  }
  resume() {
    this.post({ t: "resume" });
  }
  reset() {
    this.post({ t: "reset" });
  }
  dispose() {
    this.post({ t: "dispose" });
    this.worker.terminate();
  }
}
