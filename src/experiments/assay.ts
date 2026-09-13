import { Body } from "../body/body";
import { v, len, type Readouts } from "../body/types";
import type { LifParams, SimLike } from "../bridge/sim-bridge";

export interface AssayDefinition {
  version: 1;
  graphVersion: string;
  seed: number;
  activeCount: number;
  params: LifParams;
  pulse: { startTick: number; durationTicks: number; amplitude: number; cells: number[] };
  silence: number[];
  readouts: Record<string, number[]>;
  tonic: { cells: number[]; amplitude: number };
  ticks: number;
}
export interface AssaySample {
  descending: number;
  steering: number;
  power: number;
  tick: number;
  stimulus: number;
  escape: number;
  wing: number;
  height: number;
  speed: number;
  heading: number;
}
export interface AssayResult {
  condition: "control" | "stimulated" | "silenced" | "restored";
  samples: AssaySample[];
  peakEscape: number;
  finalHeight: number;
  elapsedMs: number;
}
export interface AssaySim extends SimLike {
  define_readout_role(name: string, cells: Uint32Array): number;
  free(): void;
}
/** A fixed-tick isolated assay: identical body, seed, drive and timing in each condition. */
export function runAssay(
  sim: AssaySim,
  definition: AssayDefinition,
  condition: AssayResult["condition"],
): AssayResult {
  const d = definition,
    p = d.params;
  sim.reset?.(BigInt(d.seed));
  sim.set_active_count?.(d.activeCount);
  sim.set_params(p.dtMs, p.tauMMs, p.vThreshold, p.vReset, p.refracMs, p.noiseSigma);
  sim.set_bias?.(Uint32Array.from(d.tonic.cells), d.tonic.amplitude);
  const roles = Object.entries(d.readouts).map(
    ([name, cells]) => [name, sim.define_readout_role(name, Uint32Array.from(cells))] as const,
  );
  if (condition === "silenced") sim.silence_cells?.(Uint32Array.from(d.silence), true);
  if (condition === "restored") {
    sim.silence_cells?.(Uint32Array.from(d.silence), true);
    sim.silence_cells?.(Uint32Array.from(d.silence), false);
  }
  const body = new Body(v(0, 5, 0), 0, true, d.seed);
  const world = {
    aabbs: [],
    lights: [],
    bounds: { min: v(-100, -100, -100), max: v(100, 100, 100) },
  };
  const cells = Uint32Array.from(d.pulse.cells),
    samples: AssaySample[] = [];
  let peakEscape = 0;
  const start = performance.now();
  for (let tick = 0; tick < d.ticks; tick++) {
    const stimulus =
      condition !== "control" &&
      tick >= d.pulse.startTick &&
      tick < d.pulse.startTick + d.pulse.durationTicks
        ? d.pulse.amplitude
        : 0;
    if (stimulus) sim.inject_cells?.(cells, stimulus);
    sim.step(1);
    const readouts: Readouts = Object.fromEntries(
      roles.map(([name, id]) => [name, sim.readout(id)]),
    );
    body.step(p.dtMs / 1000, readouts, world);
    const pose = body.pose();
    peakEscape = Math.max(peakEscape, readouts.escape ?? 0);
    samples.push({
      descending: (readouts.dnp03_l ?? 0) - (readouts.dnp03_r ?? 0),
      steering: (readouts.steer_l ?? 0) - (readouts.steer_r ?? 0),
      power:
        ((readouts.power_l ?? readouts.wing_l ?? 0) + (readouts.power_r ?? readouts.wing_r ?? 0)) /
        2,
      tick: tick + 1,
      stimulus,
      escape: readouts.escape ?? 0,
      wing: ((readouts.wing_l ?? 0) + (readouts.wing_r ?? 0)) / 2,
      height: pose.position.y,
      speed: len(body.state().vel),
      heading: Math.atan2(pose.forward.z, pose.forward.x),
    });
  }
  return {
    condition,
    samples,
    peakEscape,
    finalHeight: body.pose().position.y,
    elapsedMs: performance.now() - start,
  };
}
export function validateAssay(
  value: unknown,
  graphVersion: string,
  count: number,
  core: number,
): AssayDefinition {
  const d = value as AssayDefinition;
  const finite = (n: unknown, lo: number, hi: number) =>
    typeof n === "number" && Number.isFinite(n) && n >= lo && n <= hi;
  const integer = (n: unknown, lo: number, hi: number) => finite(n, lo, hi) && Number.isInteger(n);
  const cells = (v: unknown) =>
    Array.isArray(v) && v.length <= count && v.every((n) => integer(n, 0, count - 1));
  if (
    !d ||
    d.version !== 1 ||
    d.graphVersion !== graphVersion ||
    !integer(d.seed, 0, 0xffffffff) ||
    !integer(d.activeCount, core, count) ||
    !integer(d.ticks, 1, 2000) ||
    !d.params ||
    d.params.dtMs !== 5 ||
    !finite(d.params.tauMMs, 1, 1000) ||
    !finite(d.params.vThreshold, 0.01, 10) ||
    !finite(d.params.vReset, -10, 10) ||
    !finite(d.params.refracMs, 0, 100) ||
    !finite(d.params.noiseSigma, 0, 2) ||
    !d.pulse ||
    !integer(d.pulse.startTick, 0, d.ticks - 1) ||
    !integer(d.pulse.durationTicks, 1, d.ticks - d.pulse.startTick) ||
    !finite(d.pulse.amplitude, -5, 5) ||
    !cells(d.pulse.cells) ||
    !cells(d.silence) ||
    !d.tonic ||
    !cells(d.tonic.cells) ||
    !finite(d.tonic.amplitude, -5, 5) ||
    !d.readouts ||
    typeof d.readouts !== "object" ||
    Object.keys(d.readouts).length > 32 ||
    !Object.values(d.readouts).every(cells)
  )
    throw new Error(
      "Invalid assay or different graph version. Use a saved assay from this data bundle.",
    );
  for (const ids of [d.pulse.cells, d.silence, d.tonic.cells, ...Object.values(d.readouts)])
    if (ids.some((i) => i >= d.activeCount))
      throw new Error("Assay targets must be inside the simulated depth.");
  return d;
}
