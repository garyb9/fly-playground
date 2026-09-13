import type { EmbodiedSnapshot } from "./embodied";
import type { MovementMode } from "../body/movement";
const MODES: MovementMode[] = [
  "neural",
  "assisted",
  "landing",
  "grounded",
  "taking off",
  "wall recovery",
];
const CTRL_INTS = 8;
const SEQ = 0,
  ACTIVE = 1,
  HZ_MILLI = 2,
  PAUSED = 3,
  TICK_LO = 4,
  TICK_HI = 5,
  N_SNAP = 6;

export class RingLayout {
  readonly controlOffset = 0;
  readonly inputOffset: number;
  readonly outputOffset: number;
  readonly bytes: number;
  constructor(
    readonly nInput: number,
    readonly nReadout: number,
    readonly snapMax: number,
  ) {
    this.inputOffset = CTRL_INTS * 4;
    this.outputOffset = this.inputOffset + nInput * 4;
    this.bytes = this.outputOffset + (nReadout + snapMax + 14 + nInput) * 4;
  }
  views(sab: SharedArrayBuffer) {
    return {
      control: new Int32Array(sab, this.controlOffset, CTRL_INTS),
      input: new Float32Array(sab, this.inputOffset, this.nInput),
      output: new Float32Array(sab, this.outputOffset, this.nReadout + this.snapMax),
      body: new Float32Array(
        sab,
        this.outputOffset + (this.nReadout + this.snapMax) * 4,
        14 + this.nInput,
      ),
      _nReadout: this.nReadout,
    };
  }
}
type V = ReturnType<RingLayout["views"]>;

export function writeInput(v: V, stimulus: Float32Array) {
  v.input.set(stimulus.subarray(0, v.input.length));
}
export function readInput(v: V): Float32Array {
  return v.input.slice();
}

export function writeOutput(
  v: V,
  d: {
    embodied?: EmbodiedSnapshot;
    readouts: Float32Array;
    activity: Float32Array;
    nSnapshot: number;
    activeCount: number;
    simHz: number;
    tick: number;
    paused: number;
  },
) {
  const seq = Atomics.load(v.control, SEQ);
  const odd = seq % 2 === 0 ? seq + 1 : seq; // enter the write: seq is odd
  Atomics.store(v.control, SEQ, odd);
  v.output.set(d.readouts.subarray(0, v._nReadout), 0);
  v.output.set(d.activity.subarray(0, d.nSnapshot), v._nReadout);
  Atomics.store(v.control, 7, d.embodied ? 1 : 0);
  if (d.embodied) {
    const { state: s, mode, stimulus } = d.embodied;
    v.body.set([
      s.position.x,
      s.position.y,
      s.position.z,
      s.orientation.x,
      s.orientation.y,
      s.orientation.z,
      s.orientation.w,
      s.vel.x,
      s.vel.y,
      s.vel.z,
      s.angVel.x,
      s.angVel.y,
      s.angVel.z,
      MODES.indexOf(mode),
    ]);
    v.body.set(stimulus, 14);
  }
  Atomics.store(v.control, ACTIVE, d.activeCount | 0);
  Atomics.store(v.control, HZ_MILLI, Math.round(d.simHz * 1000));
  Atomics.store(v.control, PAUSED, d.paused | 0);
  Atomics.store(v.control, TICK_LO, (d.tick % 0x100000000) | 0);
  Atomics.store(v.control, TICK_HI, Math.floor(d.tick / 0x100000000) | 0);
  Atomics.store(v.control, N_SNAP, d.nSnapshot | 0);
  Atomics.store(v.control, SEQ, odd + 1); // leave the write: seq is even again
}

export function readOutput(v: V) {
  const s1 = Atomics.load(v.control, SEQ);
  if (s1 % 2 !== 0) return null;
  const nSnap = Atomics.load(v.control, N_SNAP);
  const readouts = v.output.slice(0, v._nReadout);
  const activity = v.output.slice(v._nReadout, v._nReadout + nSnap);
  const hz = Atomics.load(v.control, HZ_MILLI) / 1000;
  const tick =
    Atomics.load(v.control, TICK_HI) * 0x100000000 + (Atomics.load(v.control, TICK_LO) >>> 0);
  const paused = Atomics.load(v.control, PAUSED) !== 0;
  let embodied: EmbodiedSnapshot | undefined;
  if (Atomics.load(v.control, 7)) {
    const b = v.body.slice();
    embodied = {
      state: {
        position: { x: b[0]!, y: b[1]!, z: b[2]! },
        orientation: { x: b[3]!, y: b[4]!, z: b[5]!, w: b[6]! },
        vel: { x: b[7]!, y: b[8]!, z: b[9]! },
        angVel: { x: b[10]!, y: b[11]!, z: b[12]! },
      },
      mode: MODES[b[13]!] ?? "neural",
      stimulus: b.slice(14),
    };
  }
  const s2 = Atomics.load(v.control, SEQ);
  if (s2 !== s1) return null;
  return { readouts, activity, simHz: hz, tick, paused, embodied };
}
