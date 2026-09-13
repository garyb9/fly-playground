/// <reference lib="webworker" />
import initWasm, { Sim } from "../../crates/fly-sim/pkg/fly_sim.js";
import wasmUrl from "../../crates/fly-sim/pkg/fly_sim_bg.wasm?url";
import { runAssay, type AssayDefinition } from "./assay";
self.onmessage = async (
  event: MessageEvent<{ neurons: ArrayBuffer; graph: ArrayBuffer; definition: AssayDefinition }>,
) => {
  try {
    await initWasm({ module_or_path: wasmUrl });
    const { neurons, graph, definition } = event.data;
    const results = [];
    for (const condition of ["control", "stimulated", "silenced", "restored"] as const) {
      const sim = new Sim(new Uint8Array(neurons), new Uint8Array(graph), BigInt(definition.seed));
      try {
        results.push(runAssay(sim, definition, condition));
      } finally {
        sim.free();
      }
      postMessage({ progress: condition });
    }
    postMessage({ results });
  } catch (error) {
    postMessage({ error: String(error) });
  }
};
