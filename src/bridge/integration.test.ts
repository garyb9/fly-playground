import { expect, test } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fixtureBuf, fixtureJson } from "../formats/fixture";
import { parseGroups } from "../formats/groups";
import { buildRoleTable, roleNeuronLists } from "../sim/roles";
import { stepAccumulator, type AccState } from "./step-accumulator";
import type { SimLike } from "./sim-bridge";

// The wasm `Sim` also exposes the role-definition methods that `SimLike` omits
// (the worker normally calls them). Type them here so the test needs no `any`.
type WasmSim = SimLike & {
  define_input_role(name: string, neurons: Uint32Array): number;
  define_readout_role(name: string, neurons: Uint32Array): number;
};
type WasmSimCtor = new (n: Uint8Array, g: Uint8Array, seed: bigint) => WasmSim;

const pkg = fileURLToPath(new URL("../../crates/fly-sim/pkg-node/fly_sim.js", import.meta.url));
const havePkg = existsSync(pkg);

test.runIf(havePkg)("looming ramp drives escape across threshold via the real wasm", async () => {
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  const { Sim } = require(pkg) as { Sim: WasmSimCtor };
  const groups = parseGroups(fixtureJson("groups.json"));
  const rt = buildRoleTable(groups);
  const lists = roleNeuronLists(groups, rt);
  const sim = new Sim(
    new Uint8Array(fixtureBuf("neurons.bin")),
    new Uint8Array(fixtureBuf("graph.bin")),
    42n,
  );
  const inputIds = lists.input.map((ids, i) =>
    sim.define_input_role(rt.inputOrder[i]!, Uint32Array.from(ids)),
  );
  lists.readout.forEach((ids, i) =>
    sim.define_readout_role(rt.readoutOrder[i]!, Uint32Array.from(ids)),
  );
  const escapeIdx = rt.readout.escape!;

  const cfg = { TICK_MS: 5, MAX_CATCHUP_MS: 20, hzEmaTau: 0.5 };
  let st: AccState = { acc: 0, tick: 0, hzEma: 0 };
  const stim = new Float32Array(rt.inputOrder.length);
  let crossed = -1;
  for (let frame = 0; frame < 200 && crossed < 0; frame++) {
    stim[rt.input.looming!] = Math.min(1.5, frame / 30);
    st = stepAccumulator(st, 16.7, stim, sim, inputIds, cfg);
    if (sim.readout(escapeIdx) > 0.5) crossed = st.tick;
  }
  expect(crossed).toBeGreaterThan(0);
  expect(crossed).toBeLessThan(1200); // well within the ~400-tick budget after the ramp

  // and it stays quiet with no stimulus
  const sim2 = new Sim(
    new Uint8Array(fixtureBuf("neurons.bin")),
    new Uint8Array(fixtureBuf("graph.bin")),
    42n,
  );
  lists.input.forEach((ids, i) => sim2.define_input_role(rt.inputOrder[i]!, Uint32Array.from(ids)));
  lists.readout.forEach((ids, i) =>
    sim2.define_readout_role(rt.readoutOrder[i]!, Uint32Array.from(ids)),
  );
  let st2: AccState = { acc: 0, tick: 0, hzEma: 0 };
  for (let i = 0; i < 200; i++)
    st2 = stepAccumulator(st2, 16.7, new Float32Array(rt.inputOrder.length), sim2, inputIds, cfg);
  expect(sim2.readout(escapeIdx)).toBeLessThan(0.5);
});

test.runIf(havePkg)("raising noiseSigma raises baseline activity via the real wasm", async () => {
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  const { Sim } = require(pkg) as { Sim: WasmSimCtor };
  const groups = parseGroups(fixtureJson("groups.json"));
  const rt = buildRoleTable(groups);
  const lists = roleNeuronLists(groups, rt);
  const mk = () => {
    const s = new Sim(
      new Uint8Array(fixtureBuf("neurons.bin")),
      new Uint8Array(fixtureBuf("graph.bin")),
      7n,
    );
    lists.input.forEach((ids, i) => s.define_input_role(rt.inputOrder[i]!, Uint32Array.from(ids)));
    lists.readout.forEach((ids, i) =>
      s.define_readout_role(rt.readoutOrder[i]!, Uint32Array.from(ids)),
    );
    return s;
  };
  const meanActivity = (s: WasmSim) => {
    const a = s.activity_snapshot();
    let sum = 0;
    for (let i = 0; i < a.length; i++) sum += a[i]!;
    return sum / a.length;
  };
  const quiet = mk();
  for (let i = 0; i < 300; i++) quiet.step(1);
  const loud = mk();
  loud.set_params(5, 20, 1, 0, 2, 0.2);
  for (let i = 0; i < 300; i++) loud.step(1);
  expect(meanActivity(loud)).toBeGreaterThan(meanActivity(quiet));
});

test.runIf(havePkg)(
  "a one-sided light drives the contralateral wing readout higher (phototaxis path)",
  async () => {
    const { createRequire } = await import("node:module");
    const require = createRequire(import.meta.url);
    const { Sim } = require(pkg) as { Sim: WasmSimCtor };
    const groups = parseGroups(fixtureJson("groups.json"));
    const rt = buildRoleTable(groups);
    const lists = roleNeuronLists(groups, rt);
    const sim = new Sim(
      new Uint8Array(fixtureBuf("neurons.bin")),
      new Uint8Array(fixtureBuf("graph.bin")),
      5n,
    );
    const inputIds = lists.input.map((ids, i) =>
      sim.define_input_role(rt.inputOrder[i]!, Uint32Array.from(ids)),
    );
    lists.readout.forEach((ids, i) =>
      sim.define_readout_role(rt.readoutOrder[i]!, Uint32Array.from(ids)),
    );
    const cfg = { TICK_MS: 5, MAX_CATCHUP_MS: 20, hzEmaTau: 0.5 };
    let st: AccState = { acc: 0, tick: 0, hzEma: 0 };
    const stim = new Float32Array(rt.inputOrder.length);
    // Drive the LEFT eye: in the seed-42 synthetic fixture only `light_l → wing_r`
    // is a net-excitatory contralateral path (the `light_r` group 13/14/15 is
    // partly inhibitory, so `light_r` suppresses `wing_l` instead of driving it).
    // The mechanism under test is sign-agnostic (spec §3.7 / §4.3): a one-sided
    // light produces a contralateral wing asymmetry through the real brain.
    stim[rt.input.light_l!] = 1.0; // sustained light on the left
    for (let f = 0; f < 400; f++) st = stepAccumulator(st, 16.7, stim, sim, inputIds, cfg);
    // fixture wires light_l → wing_r (contralateral)
    expect(sim.readout(rt.readout.wing_r!)).toBeGreaterThan(sim.readout(rt.readout.wing_l!));
  },
);
