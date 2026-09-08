const REC = 24;

export interface NeuronsFile {
  version: number;
  coreCount: number;
  count: number;
  ids: BigUint64Array;
  pos: Float32Array;
  groupId: Uint16Array;
  flags: Uint8Array;
}

function coded(message: string, code: string): Error {
  const e = new Error(message) as Error & { code: string };
  e.code = code;
  return e;
}

export function parseNeurons(buf: ArrayBuffer): NeuronsFile {
  if (buf.byteLength < 16) throw coded("neurons.bin too short", "TOO_SHORT");
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x4e594c46) throw coded("neurons.bin bad magic", "BAD_MAGIC");
  const version = dv.getUint32(4, true);
  const count = dv.getUint32(8, true);
  const coreCount = dv.getUint32(12, true);
  const need = 16 + count * REC;
  if (buf.byteLength < need) throw coded("neurons.bin truncated", "TOO_SHORT");

  const ids = new BigUint64Array(count);
  const pos = new Float32Array(count * 3);
  const groupId = new Uint16Array(count);
  const flags = new Uint8Array(count);
  for (let k = 0; k < count; k++) {
    const o = 16 + k * REC;
    ids[k] = dv.getBigUint64(o, true);
    pos[k * 3] = dv.getFloat32(o + 8, true);
    pos[k * 3 + 1] = dv.getFloat32(o + 12, true);
    pos[k * 3 + 2] = dv.getFloat32(o + 16, true);
    groupId[k] = dv.getUint16(o + 20, true);
    flags[k] = dv.getUint8(o + 22);
  }
  return { version, coreCount, count, ids, pos, groupId, flags };
}

export const isCore = (n: NeuronsFile, i: number) => (n.flags[i]! & 0b0001) !== 0;
export const isInhibitory = (n: NeuronsFile, i: number) => (n.flags[i]! & 0b0010) !== 0;
export const isInput = (n: NeuronsFile, i: number) => (n.flags[i]! & 0b0100) !== 0;
export const isReadout = (n: NeuronsFile, i: number) => (n.flags[i]! & 0b1000) !== 0;
