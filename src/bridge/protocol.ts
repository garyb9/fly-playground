export interface StatePayload {
  readouts: Float32Array;
  activity: Float32Array;
  simHz: number;
  tick: number;
}

export type ToWorker =
  | {
      t: "init";
      assets: { neurons: ArrayBuffer; graph: ArrayBuffer; groups: unknown };
      config: import("./sim-bridge").SimInitConfig;
    }
  | { t: "setActiveCount"; n: number }
  | { t: "setParams"; p: Partial<import("./sim-bridge").LifParams> }
  | { t: "pause" }
  | { t: "resume" }
  | { t: "reset" }
  | { t: "dispose" }
  | { t: "stimulus"; v: Float32Array };

export type FromWorker =
  | { t: "ready"; nNeurons: number; coreCount: number; groups: unknown }
  | { t: "state"; readouts: Float32Array; activity: Float32Array; simHz: number; tick: number }
  | { t: "error"; message: string };

export function encodeState(s: StatePayload): {
  payload: FromWorker & { t: "state" };
  transfer: Transferable[];
} {
  const readouts = s.readouts.slice();
  const activity = s.activity.slice();
  return {
    payload: { t: "state", readouts, activity, simHz: s.simHz, tick: s.tick },
    transfer: [readouts.buffer, activity.buffer],
  };
}
export function decodeState(p: FromWorker & { t: "state" }): StatePayload {
  return { readouts: p.readouts, activity: p.activity, simHz: p.simHz, tick: p.tick };
}
