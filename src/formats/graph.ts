export interface GraphFile {
  version: number;
  nNodes: number;
  nEdges: number;
  wNorm: number;
  offsets: Uint32Array;
  targets: Uint32Array;
  weights: Int16Array;
}

function coded(message: string, code: string): Error {
  const e = new Error(message) as Error & { code: string };
  e.code = code;
  return e;
}

export function parseGraph(buf: ArrayBuffer): GraphFile {
  if (buf.byteLength < 32) throw coded("graph.bin too short", "TOO_SHORT");
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x47594c46) throw coded("graph.bin bad magic", "BAD_MAGIC");
  const version = dv.getUint32(4, true);
  const nNodes = dv.getUint32(8, true);
  const nEdges = Number(dv.getBigUint64(16, true));
  const wNorm = dv.getFloat32(24, true);

  const offBytes = (nNodes + 1) * 4;
  const tgtBytes = nEdges * 4;
  const wtBytes = nEdges * 2;
  if (buf.byteLength < 32 + offBytes + tgtBytes + wtBytes)
    throw coded("graph.bin truncated", "TOO_SHORT");

  const offsets = new Uint32Array(buf.slice(32, 32 + offBytes));
  const targets = new Uint32Array(buf.slice(32 + offBytes, 32 + offBytes + tgtBytes));
  const weights = new Int16Array(buf.slice(32 + offBytes + tgtBytes, 32 + offBytes + tgtBytes + wtBytes));

  if (offsets[0] !== 0 || offsets[nNodes] !== nEdges) throw coded("graph.bin bad offsets", "BAD_OFFSETS");
  for (let i = 0; i < nNodes; i++)
    if (offsets[i]! > offsets[i + 1]!) throw coded("graph.bin non-monotonic offsets", "BAD_OFFSETS");

  // Target-range parity with the Rust decoder (`format.rs` rejects `t >= n_nodes`
  // with `BadOffsets`): an out-of-range target would otherwise `row()`-index a
  // position array to `undefined`/NaN in Plan 02's brainviz.
  for (let k = 0; k < targets.length; k++)
    if (targets[k]! >= nNodes) throw coded("graph.bin target out of range", "BAD_OFFSETS");

  return { version, nNodes, nEdges, wNorm, offsets, targets, weights };
}

export function* row(g: GraphFile, i: number): Generator<[number, number]> {
  const s = g.offsets[i]!;
  const e = g.offsets[i + 1]!;
  for (let k = s; k < e; k++) yield [g.targets[k]!, g.weights[k]!];
}
