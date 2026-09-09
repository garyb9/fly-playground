import type { SimLike } from "./sim-bridge";

export interface AccState { acc: number; tick: number; hzEma: number; }

export function stepAccumulator(
  state: AccState, elapsedMs: number, latched: Float32Array, sim: SimLike,
  inputRoleIds: number[], cfg: { TICK_MS: number; MAX_CATCHUP_MS: number; hzEmaTau: number },
): AccState {
  let acc = Math.min(state.acc + elapsedMs, cfg.MAX_CATCHUP_MS);
  let tick = state.tick;
  let ticksThisCall = 0;
  while (acc >= cfg.TICK_MS) {
    for (let k = 0; k < inputRoleIds.length; k++) sim.inject(inputRoleIds[k]!, latched[k] ?? 0);
    sim.step(1);
    acc -= cfg.TICK_MS;
    tick++;
    ticksThisCall++;
  }
  const seconds = Math.max(elapsedMs / 1000, 1e-6);
  const observedHz = ticksThisCall / seconds;
  const a = 1 - Math.exp(-seconds / cfg.hzEmaTau);
  const hzEma = state.hzEma + (observedHz - state.hzEma) * a;
  return { acc, tick, hzEma };
}
