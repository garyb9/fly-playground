/// <reference lib="webworker" />
import initWasm, { Sim } from "../../crates/fly-sim/pkg/fly_sim.js";
import wasmUrl from "../../crates/fly-sim/pkg/fly_sim_bg.wasm?url";
import type { ToWorker, FromWorker } from "./protocol";
import { encodeState } from "./protocol";
import { buildRoleTable, roleNeuronLists } from "../sim/roles";
import { parseGroups } from "../formats/groups";
import { WorkerCore } from "./worker-core";
import { CONFIG } from "../app/config";

let core: WorkerCore | null = null;
let running = false;
let lastTs = 0;

function post(m: FromWorker, transfer: Transferable[] = []) {
  (self as DedicatedWorkerGlobalScope).postMessage(m, transfer);
}

async function onInit(msg: Extract<ToWorker, { t: "init" }>) {
  await initWasm(wasmUrl);
  const sim = new Sim(
    new Uint8Array(msg.assets.neurons),
    new Uint8Array(msg.assets.graph),
    BigInt(msg.config.seed),
  );
  const groups = parseGroups(msg.assets.groups);
  const rt = buildRoleTable(groups);
  const lists = roleNeuronLists(groups, rt);
  const inputIds = lists.input.map((ids, i) =>
    sim.define_input_role(rt.inputOrder[i]!, Uint32Array.from(ids)),
  );
  const readoutIds = lists.readout.map((ids, i) =>
    sim.define_readout_role(rt.readoutOrder[i]!, Uint32Array.from(ids)),
  );
  core = new WorkerCore(
    sim as unknown as import("./sim-bridge").SimLike,
    rt,
    inputIds,
    readoutIds,
    { ...CONFIG.worker, snapMax: msg.config.snapMax, coreFloor: CONFIG.sim.coreFloor },
  );
  core.setActiveCount(sim.neuron_count());
  post({
    t: "ready",
    nNeurons: sim.neuron_count(),
    coreCount: sim.core_count(),
    groups: msg.assets.groups,
  });
  running = true;
  lastTs = performance.now();
  loop();
}

function loop() {
  if (!core) return;
  const now = performance.now();
  const elapsed = now - lastTs;
  lastTs = now;
  if (running) {
    const f = core.frame(elapsed);
    const enc = encodeState(f);
    post(enc.payload, enc.transfer);
  }
  setTimeout(loop, 0);
}

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  try {
    if (m.t === "init") void onInit(m);
    else if (m.t === "stimulus") core?.setStimulus(m.v);
    else if (m.t === "setActiveCount") core?.setActiveCount(m.n);
    else if (m.t === "pause") running = false;
    else if (m.t === "resume") {
      running = true;
      lastTs = performance.now();
    } else if (m.t === "reset") core?.reset();
    else if (m.t === "dispose") {
      running = false;
      core = null;
    }
  } catch (err) {
    post({ t: "error", message: String(err) });
  }
};
