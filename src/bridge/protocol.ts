export interface StatePayload {
  embodied?: import("./embodied").EmbodiedSnapshot;
  readouts: Float32Array;
  activity: Float32Array;
  simHz: number;
  tick: number;
  paused: boolean;
}

export type ToWorker =
  | { t: "world"; world: import("../body/types").WorldQuery }
  | { t: "inputs"; modalities: boolean; flow: boolean }
  | { t: "movement"; command: import("../body/movement").MovementCommand }
  | { t: "resetBody"; start: import("../body/types").Vec3; heading: number }
  | {
      t: "init";
      assets: { neurons: ArrayBuffer; graph: ArrayBuffer; groups: unknown };
      config: import("./sim-bridge").SimInitConfig;
    }
  | { t: "setActiveCount"; n: number }
  | { t: "setParams"; p: Partial<import("./sim-bridge").LifParams> }
  | { t: "intervene"; command: import("./sim-bridge").Intervention }
  | { t: "pause" }
  | { t: "resume" }
  | { t: "reset" }
  | { t: "dispose" }
  | { t: "stimulus"; v: Float32Array };

export type FromWorker =
  | { t: "ready"; nNeurons: number; coreCount: number; groups: unknown }
  | {
      t: "state";
      embodied?: import("./embodied").EmbodiedSnapshot;
      readouts: Float32Array;
      activity: Float32Array;
      simHz: number;
      tick: number;
      paused: boolean;
    }
  | { t: "error"; message: string };

export function encodeState(s: StatePayload): {
  payload: FromWorker & { t: "state" };
  transfer: Transferable[];
} {
  const readouts = s.readouts.slice();
  const activity = s.activity.slice();
  return {
    payload: {
      t: "state",
      embodied: s.embodied,
      readouts,
      activity,
      simHz: s.simHz,
      tick: s.tick,
      paused: s.paused,
    },
    transfer: [readouts.buffer, activity.buffer],
  };
}
export function decodeState(p: FromWorker & { t: "state" }): StatePayload {
  return {
    embodied: p.embodied,
    readouts: p.readouts,
    activity: p.activity,
    simHz: p.simHz,
    tick: p.tick,
    paused: p.paused,
  };
}
