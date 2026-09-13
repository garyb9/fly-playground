import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { runAssay, validateAssay, type AssayDefinition, type AssaySim } from "./assay";
import { motorRegistry } from "../sim/motor-registry";
const { Sim } = createRequire(import.meta.url)("../../crates/fly-sim/pkg-node/fly_sim.js") as {
  Sim: new (n: Uint8Array, g: Uint8Array, seed: bigint) => AssaySim;
};
const base = new URL("../../public/data/malecns/", import.meta.url);
const neurons = readFileSync(new URL("neurons.bin", base)),
  graph = readFileSync(new URL("graph.bin", base));
const groups = JSON.parse(readFileSync(new URL("groups.json", base), "utf8"));
const roles = groups.roles.readout;
const motors = motorRegistry(JSON.parse(readFileSync(new URL("cells.json", base), "utf8")));
const definition: AssayDefinition = {
  version: 1,
  graphVersion: "test",
  seed: 42,
  activeCount: 1585,
  params: { dtMs: 5, tauMMs: 20, vThreshold: 1, vReset: 0, refracMs: 2, noiseSigma: 0 },
  pulse: { cells: groups.roles.input.looming, amplitude: 1.5, startTick: 80, durationTicks: 80 },
  silence: roles.escape,
  readouts: roles,
  tonic: { cells: [...new Set<number>([...roles.wing_l, ...roles.wing_r])], amplitude: 0.6 },
  ticks: 320,
};
function trial(condition: "control" | "stimulated" | "silenced") {
  const sim = new Sim(neurons, graph, 42n);
  try {
    return runAssay(sim, definition, condition);
  } finally {
    sim.free();
  }
}
test("real DNp03 reaches steering motors; motor blockade removes steering and restoration replays", () => {
  const results = [];
  for (const condition of ["control", "stimulated", "silenced", "restored"] as const) {
    const sim = new Sim(neurons, graph, 42n);
    try {
      results.push(
        runAssay(
          sim,
          {
            ...definition,
            readouts: { ...roles, ...motors.readouts },
            pulse: { ...definition.pulse, cells: motors.readouts.dnp03_l! },
            silence: [...motors.readouts.steer_l!, ...motors.readouts.steer_r!],
            tonic: { cells: motors.tonic, amplitude: 0.85 },
          },
          condition,
        ),
      );
    } finally {
      sim.free();
    }
  }
  const [control, stimulated, silenced, restored] = results;
  expect(
    stimulated!.samples.some(
      (s, i) => Math.abs(s.steering - control!.samples[i]!.steering) > 0.001,
    ),
  ).toBe(true);
  expect(silenced!.samples.every((s) => s.steering === 0)).toBe(true);
  expect(restored!.samples).toEqual(stimulated!.samples);
  expect(
    stimulated!.samples.some((s, i) => Math.abs(s.heading - control!.samples[i]!.heading) > 0.001),
  ).toBe(true);
});
test("real graph looming response changes body motion and escape silencing blocks it", () => {
  const control = trial("control"),
    stimulated = trial("stimulated"),
    silenced = trial("silenced");
  expect(control.peakEscape).toBe(0);
  expect(stimulated.peakEscape).toBeGreaterThan(0.5);
  expect(silenced.peakEscape).toBe(0);
  expect(
    stimulated.samples.some((s, i) => Math.abs(s.speed - control.samples[i]!.speed) > 0.1),
  ).toBe(true);
  expect(
    stimulated.samples.some((s, i) => Math.abs(s.height - silenced.samples[i]!.height) > 0.05),
  ).toBe(true);
  expect(trial("stimulated").samples).toEqual(stimulated.samples);
});
test("saved assays reject incompatible graphs and invalid or inactive targets", () => {
  expect(validateAssay(definition, "test", 166700, 1585)).toBe(definition);
  expect(() => validateAssay(definition, "other", 166700, 1585)).toThrow();
  expect(() => validateAssay({ ...definition, seed: NaN }, "test", 166700, 1585)).toThrow();
  expect(() =>
    validateAssay(
      { ...definition, pulse: { ...definition.pulse, cells: [1585] } },
      "test",
      166700,
      1585,
    ),
  ).toThrow();
});
test("bilateral motor stimulation produces opposite modeled turns", () => {
  const turn = (side: "wing_l" | "wing_r") => {
    const sim = new Sim(neurons, graph, 42n);
    try {
      return runAssay(
        sim,
        { ...definition, pulse: { ...definition.pulse, cells: roles[side] }, silence: roles[side] },
        "stimulated",
      );
    } finally {
      sim.free();
    }
  };
  const left = turn("wing_l"),
    right = turn("wing_r");
  const l = left.samples[159]!.heading,
    r = right.samples[159]!.heading;
  expect(Math.abs(l)).toBeGreaterThan(0.01);
  expect(Math.abs(r)).toBeGreaterThan(0.01);
  expect(Math.sign(l)).not.toBe(Math.sign(r));
});
