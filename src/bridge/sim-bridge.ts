// Task 4 fills in the SimBridge interface, transports, and createSimBridge().

/** Shared type — the minimal surface the worker bridge drives the Sim through. */
export interface SimLike {
  inject(roleId: number, value: number): void;
  step(ticks: number): void;
  readout(roleId: number): number;
  activity_snapshot(): Float32Array;
}
