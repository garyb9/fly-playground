/** Smoothed source activity on recorded edges is a display cue, not proof of transmission. */
export function connectionActivity(activity: Float32Array, source: number, target: number): number {
  if (source >= activity.length || target >= activity.length) return 0;
  return Math.min(1, Math.max(0, activity[source] ?? 0));
}
export function circuitActivity(activity: Float32Array, cells: number[]): number {
  let total = 0,
    count = 0;
  for (const cell of cells)
    if (cell < activity.length) {
      total += activity[cell] ?? 0;
      count++;
    }
  return count ? total / count : 0;
}

/** One neuron can innervate many ROIs. Weight its model activity by measured
 * pre+post counts; this is not a simulation of subcellular signal location. */
export function regionActivity(activity: Float32Array, members: [number, number][]) {
  let weighted = 0,
    simulated = 0,
    total = 0;
  for (const [cell, synapses] of members) {
    total += synapses;
    if (cell < activity.length) {
      simulated += synapses;
      weighted += (activity[cell] ?? 0) * synapses;
    }
  }
  return { value: simulated ? weighted / simulated : 0, coverage: total ? simulated / total : 0 };
}
