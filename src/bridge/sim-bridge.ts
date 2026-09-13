import type { RoleTable } from "../sim/roles";
import { PmBridge } from "./pm-bridge";
import { SabBridge } from "./sab-bridge";

export interface Intervention {
  kind: "pulse" | "hold" | "silence" | "restore" | "stop" | "tonic";
  cells: number[];
  amplitude?: number;
  durationMs?: number;
}

/** Config passed to the worker on init. */
export interface SimInitConfig {
  embodied?: import("./embodied").EmbodiedConfig;
  seed: number;
  snapMax: number;
  lif?: Partial<LifParams>;
  tonicDrive?: { cells: number[]; amplitude: number };
}

/** LIF neuron parameters (ms-domain; the worker converts to Plan-01's dt-domain). */
export interface LifParams {
  dtMs: number;
  tauMMs: number;
  vThreshold: number;
  vReset: number;
  refracMs: number;
  noiseSigma: number;
}

/** The latest snapshot the main thread reads each render frame. */
export interface SimState {
  embodied?: import("./embodied").EmbodiedSnapshot;
  readouts: Float32Array; // length = readoutOrder.length
  activity: Float32Array; // length = nSnapshot (valid prefix); values ~0..1
  simHz: number;
  tick: number;
  paused: boolean;
}

/** Transport-agnostic handle the app drives the sim worker through. */
export interface SimBridge {
  setWorld?(world: import("../body/types").WorldQuery): void;
  setInputs?(modalities: boolean, flow: boolean): void;
  movement?(command: import("../body/movement").MovementCommand): void;
  resetBody?(start: import("../body/types").Vec3, heading: number): void;
  init(
    assets: { neurons: ArrayBuffer; graph: ArrayBuffer; groups: unknown },
    config: SimInitConfig,
  ): Promise<{ nNeurons: number; coreCount: number; roleTable: RoleTable }>;
  intervene?(command: Intervention): void;
  setStimulus(v: Float32Array): void;
  readState(): SimState;
  setActiveCount(n: number): void;
  setParams(p: Partial<LifParams>): void;
  pause(): void;
  resume(): void;
  reset(): void;
  dispose(): void;
}

/** Shared type — the minimal surface the worker bridge drives the Sim through. */
export interface SimLike {
  set_bias?(ids: Uint32Array, value: number): void;
  inject_cells?(ids: Uint32Array, value: number): void;
  silence_cells?(ids: Uint32Array, value: boolean): void;
  clear_interventions?(): void;
  reset?(seed: bigint): void;
  set_active_count?(n: number): void;
  inject(roleId: number, value: number): void;
  step(ticks: number): void;
  readout(roleId: number): number;
  activity_snapshot(): Float32Array;
  set_params(
    dtMs: number,
    tauMMs: number,
    vThreshold: number,
    vReset: number,
    refracMs: number,
    noiseSigma: number,
  ): void;
}

export function createSimBridge(workerFactory: () => Worker): SimBridge {
  return globalThis.crossOriginIsolated
    ? new SabBridge(workerFactory)
    : new PmBridge(workerFactory);
}
