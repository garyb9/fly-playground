/** Preserve all nonzero-current paths of up to three edges from candidate
 * descending cells to selected motors. Longer/recurrent influences are not
 * claimed complete. Prefix activation retains the shipped graph unchanged. */
export function circuitProfile(
  graph: ArrayBuffer,
  sources: number[],
  motors: number[],
  core: number,
) {
  const header = new DataView(graph),
    n = header.getUint32(8, true),
    edges = Number(header.getBigUint64(16, true));
  const offsets = new Uint32Array(graph, 32, n + 1);
  const targets = new Uint32Array(graph, 32 + (n + 1) * 4, edges);
  const weights = new Int16Array(graph, 32 + (n + 1) * 4 + edges * 4, edges);
  const ends = new Set(motors),
    memo = new Map<number, boolean>();
  const reaches = (node: number, remaining: number): boolean => {
    if (ends.has(node)) return true;
    if (!remaining) return false;
    const key = node * 4 + remaining;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    for (let k = offsets[node]!; k < offsets[node + 1]!; k++)
      if (weights[k] && reaches(targets[k]!, remaining - 1)) {
        memo.set(key, true);
        return true;
      }
    memo.set(key, false);
    return false;
  };
  const members = new Set([...sources, ...motors]),
    seen = new Set<number>();
  let retainedEdges = 0;
  const edgeIds = new Set<number>();
  const visit = (node: number, remaining: number) => {
    const key = node * 4 + remaining;
    if (seen.has(key) || !remaining || ends.has(node)) return;
    seen.add(key);
    for (let k = offsets[node]!; k < offsets[node + 1]!; k++)
      if (weights[k] && reaches(targets[k]!, remaining - 1)) {
        const target = targets[k]!;
        members.add(target);
        edgeIds.add(k);
        visit(target, remaining - 1);
      }
  };
  for (const source of sources) visit(source, 3);
  retainedEdges = edgeIds.size;
  const indices = [...members].sort((a, b) => a - b);
  return {
    maxHops: 3,
    indices,
    retainedEdges,
    minimumDepth: Math.max(core, ...indices.map((i) => i + 1)),
  };
}
