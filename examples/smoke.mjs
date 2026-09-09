// Manual smoke: load the node-target wasm, drive a looming ramp, watch `escape` climb.
// Run: yarn rs:smoke
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Sim } = require("../crates/fly-sim/pkg-node/fly_sim.js"); // CJS, wasm auto-loaded, no init()

const dir = fileURLToPath(new URL("../pipeline/out/fixture/", import.meta.url));
const neurons = readFileSync(dir + "neurons.bin");
const graph = readFileSync(dir + "graph.bin");
const groups = JSON.parse(readFileSync(dir + "groups.json", "utf8"));

const sim = new Sim(new Uint8Array(neurons), new Uint8Array(graph), 42n);
const looming = sim.define_input_role("looming", Uint32Array.from(groups.roles.input.looming));
const escape = sim.define_readout_role("escape", Uint32Array.from(groups.roles.readout.escape));

for (let t = 0; t < 500; t++) {
  sim.inject(looming, Math.min(1.5, t / 120));
  sim.step(1);
  if (t % 40 === 0)
    console.log(`tick ${String(t).padStart(3)}  escape=${sim.readout(escape).toFixed(3)}`);
}
console.log(`final escape readout = ${sim.readout(escape).toFixed(3)} (expect > 0.5)`);
