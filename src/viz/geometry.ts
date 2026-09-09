// Pure, framework-free geometry math for the brain point cloud + core-edge lines.
// No `three` import here — this file is consumed by `builders.ts` and by tests
// that never touch a renderer.

import type { NeuronsFile } from "../formats/neurons";
import type { GraphFile } from "../formats/graph";
import { isCore } from "../formats/neurons";
import { row } from "../formats/graph";

/** Flattened `x,y,z` positions (`count * 3`), each multiplied by `scaleFactor`. */
export function brainPositions(n: NeuronsFile, scaleFactor: number): Float32Array {
  const out = new Float32Array(n.count * 3);
  for (let i = 0; i < out.length; i++) out[i] = n.pos[i]! * scaleFactor;
  return out;
}

/** One float per neuron: `1` for core neurons, `0` otherwise. Sums to `coreCount`. */
export function coreFlags(n: NeuronsFile): Float32Array {
  const out = new Float32Array(n.count);
  for (let i = 0; i < n.count; i++) out[i] = isCore(n, i) ? 1 : 0;
  return out;
}

/**
 * Flattened endpoint index pairs `[src, dst, src, dst, ...]` for every edge whose
 * BOTH endpoints are core neurons (`src < coreCount && dst < coreCount`). Each
 * directed edge from the CSR graph is emitted once.
 */
export function coreEdgePairs(g: GraphFile, coreCount: number): Float32Array {
  const pairs: number[] = [];
  for (let s = 0; s < coreCount; s++) {
    for (const [t] of row(g, s)) if (t < coreCount) pairs.push(s, t);
  }
  return Float32Array.from(pairs);
}

/**
 * Maps activity `t` in `[0, 1]` (clamped) to an RGB triple in `[0, 1]`, ramping
 * cold → hot. Monotone per channel toward hot; hot is brighter overall.
 * cold `#1b1e2b` → amber `#d98a1f` → near-white `#fdf0d5`.
 */
export function activityColour(t: number): [number, number, number] {
  const c = Math.max(0, Math.min(1, t));
  const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
  if (c < 0.6) {
    const u = c / 0.6;
    return [lerp(0.106, 0.851, u), lerp(0.118, 0.541, u), lerp(0.169, 0.122, u)];
  }
  const u = (c - 0.6) / 0.4;
  return [lerp(0.851, 0.992, u), lerp(0.541, 0.941, u), lerp(0.122, 0.835, u)];
}
