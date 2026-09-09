# fly-playground — Plan 02: App Shell (minimal brain→fly loop)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A browser playground on the synthetic fixture where the fly's brain drives the fly through a real sense→act loop: it cruises, a looming object makes the `escape` readout cross threshold, and a giant-fiber impulse throws it clear — with the point cloud pulsing and the core edges lighting the pathway.

**Architecture:** A `SimBridge` runs the Plan-01 WASM `Sim` in a Web Worker at a fixed 200 Hz (self-scheduled accumulator, stimulus re-injected every tick), publishing motor readouts + a decimated activity snapshot to the main thread over a lock-free `SharedArrayBuffer` ring buffer, with a `postMessage` fallback behind the same interface. The main thread runs a `requestAnimationFrame` loop: `sensing/` turns the fly's pose + world into stimulus scalars, `body/` turns readouts into 6DOF rigid-body motion, `viz/` renders a Three.js point-cloud brain + a procedural fly + a world built from `scene.config.ts`. Every framework-free unit (`bridge/` primitives, `sensing/`, `body/`) is pure and `vitest`-tested; the real Worker + WebGL sit behind guarded seams and are covered by a node-target-wasm integration test plus a manual checklist.

**Tech Stack:** TypeScript + Vite + Vitest (env `node`); Three.js (only new runtime dep); the Plan-01 Rust→WASM `fly-sim` crate (`--target web` for the app, `--target nodejs` for the integration test); `SharedArrayBuffer` + `Atomics` + Web Workers.

**Spec:** `docs/superpowers/specs/2026-09-09-fly-playground-02-app-shell-design.md` (parent design `docs/2026-09-09-design.md`; companions `docs/architecture.md`, `docs/neuron-model.md`; Plan 01 `docs/superpowers/plans/2026-09-09-fly-playground-01-foundations.md`).

## Global Constraints

- **Determinism where it is cheap.** `body/` and the noise it adds are seeded (`CONFIG.sim.seed`) — same readouts + same `dt` sequence ⇒ same motion. No `Math.random` in `body/`, `sensing/`, or the step path. Wall-clock only in `loop.ts` and the worker scheduler (measured elapsed), never in logic under test.
- **Framework-free core.** Nothing under `src/bridge/`, `src/sensing/`, `src/body/`, `src/sim/` may import `three`. `Vec3`/`Quat` are plain `{x,y,z}` / `{x,y,z,w}` objects; conversion to `THREE.*` happens only inside `src/viz/`.
- **Fixed sim tick:** `TICK_MS = 5` (200 Hz). The worker advances whole ticks only and re-injects the latched stimulus vector **before every tick** (Plan 01 `Sim::step` swaps-and-clears the input buffer each tick — `crates/fly-sim/src/core/sim.rs`).
- **Axes (right-handed):** body `+X` forward, `+Y` up, `+Z` right; world `+Y` up. Neuron positions are multiplied by the fixture `scale_factor` (`1.0`) into world units.
- **Role vector indexing:** stimulus and readout `Float32Array`s are indexed by `RoleTable.inputOrder` / `.readoutOrder`, which are the role names **sorted ascending**. The worker defines roles on the `Sim` in that same order so the Rust role id equals the vector index (`Roles` assigns ids by insertion order — `crates/fly-sim/src/core/roles.rs`).
- **Fixture facts (hardcoded in tests):** 500 neurons, `core_count = 48`, `w_norm = 0.01`, `scale_factor = 1.0`. Input roles `light_l, light_r, looming, proximity, wind_l, wind_r`; readout roles `escape, thrust, wing_l, wing_r, yaw_torque` (both already sorted). `looming → escape` is strongly wired; a sustained `inject("looming", ≥1.0)` drives `readout("escape") > 0.5` within ~400 ticks. There is **no** wired path to `thrust` / `yaw_torque` — this plan does not rely on one.
- **No new deps beyond `three`** (runtime) and `@types/node` + optionally `@types/three` (dev, types only).
- **TDD:** failing test → run-and-see-it-fail → minimal impl → run-and-see-it-pass → commit. Commit at least once per task.
- **Commit messages:** Conventional Commits. End every commit body with:

  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_011HYjKfCsnprEsaA7QuDSjg
  ```

## Shared types (defined once here; tasks refer back)

```ts
// src/sim/roles.ts
export interface RoleTable {
  input: Record<string, number>;      // role name → stimulus vector index
  readout: Record<string, number>;    // role name → readout vector index
  inputOrder: string[];               // sorted role names; index i ↔ inputOrder[i]
  readoutOrder: string[];
}

// src/body/types.ts
export interface Vec3 { x: number; y: number; z: number; }
export interface Quat { x: number; y: number; z: number; w: number; }
export interface Aabb { min: Vec3; max: Vec3; }
export interface Pose {
  position: Vec3; orientation: Quat;
  forward: Vec3;  // body +X in world space
  up: Vec3;       // body +Y in world space
}
export interface WorldQuery { aabbs: Aabb[]; bounds: Aabb; }
export type Readouts = Record<string, number>;   // built by loop.ts from the readout Float32Array + RoleTable

// src/bridge/sim-bridge.ts
export interface SimInitConfig { seed: number; snapMax: number; lif?: Partial<LifParams>; }
export interface LifParams {
  dtMs: number; tauMMs: number; vThreshold: number; vReset: number; refracMs: number; noiseSigma: number;
}
export interface SimState {
  readouts: Float32Array;   // length = readoutOrder.length
  activity: Float32Array;   // length = nSnapshot (valid prefix); values ~0..1
  simHz: number; tick: number;
}
export interface SimBridge {
  init(assets: { neurons: ArrayBuffer; graph: ArrayBuffer; groups: unknown }, config: SimInitConfig):
    Promise<{ nNeurons: number; coreCount: number; roleTable: RoleTable }>;
  setStimulus(v: Float32Array): void;
  readState(): SimState;
  setActiveCount(n: number): void;
  setParams(p: Partial<LifParams>): void;
  pause(): void; resume(): void; reset(): void;
  dispose(): void;
}

// structural subset of the Plan-01 WASM `Sim`, so fakes and the real class both satisfy it
export interface SimLike {
  inject(roleId: number, value: number): void;
  step(ticks: number): void;
  readout(roleId: number): number;
  activity_snapshot(): Float32Array;
}
```

---

## Task 1: Carry-ins, `three`, `CONFIG`, Vite isolation headers

**Files:**
- Modify: `package.json` (deps + scripts), `.gitignore`, `vite.config.ts`, `tsconfig.json`
- Delete: `src/formats/node-env.d.ts`
- Create: `src/app/config.ts`, `src/app/config.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `CONFIG` (typed constants object, see Step 4); `yarn dev` builds the web wasm first; `rs:wasm:node` / `rs:smoke` scripts; `crossOriginIsolated` true under `yarn dev`.

- [ ] **Step 1: Write the failing test**

`src/app/config.test.ts`:
```ts
import { expect, test } from "vitest";
import { CONFIG } from "./config";

test("CONFIG is fully populated and sane", () => {
  const flat = JSON.stringify(CONFIG);
  expect(flat).not.toMatch(/null/);
  expect([...JSON.stringify(CONFIG).matchAll(/-?\d+\.?\d*/g)].every((m) => Number.isFinite(+m[0]))).toBe(true);
  expect(CONFIG.physics.ESCAPE_TH).toBeGreaterThan(0);
  expect(CONFIG.physics.ESCAPE_TH).toBeLessThan(1);
  expect(CONFIG.physics.ESCAPE_HYST).toBeGreaterThan(0);
  expect(CONFIG.physics.MASS).toBeGreaterThan(0);
  expect(CONFIG.physics.INERTIA).toBeGreaterThan(0);
  expect(CONFIG.physics.HOVER_S).toBeGreaterThanOrEqual(0);
  expect(CONFIG.sim.snapMax).toBeGreaterThanOrEqual(CONFIG.sim.coreFloor);
  expect(CONFIG.loop.MAX_FRAME_DT).toBeGreaterThan(0);
  expect(CONFIG.worker.MAX_CATCHUP_MS).toBeGreaterThanOrEqual(CONFIG.worker.TICK_MS);
});
```

- [ ] **Step 2: Run it, watch it fail**

Run: `npx vitest run src/app/config.test.ts`
Expected: FAIL — cannot resolve `./config`.

- [ ] **Step 3: Delete the shim, add deps, add ambient Vite types**

```bash
git rm src/formats/node-env.d.ts
yarn add three
yarn add -D @types/node
yarn rs:wasm            # generate crates/fly-sim/pkg/*.d.ts so `typecheck` can resolve the worker's wasm import
```
Create `src/vite-env.d.ts` (one line — gives `?url` / `?worker` / `import.meta.env` typing so `tsc` accepts them):
```ts
/// <reference types="vite/client" />
```
Then `npx tsc --noEmit`. If it reports missing types for `three`, also run `yarn add -D @types/three` at the version `yarn` resolved for `three` (check `yarn list --pattern three`). Pin exact versions: edit `package.json` so `three` (and `@types/three` if added) have no `^`/`~`.

- [ ] **Step 4: Write `src/app/config.ts`**

One exported object. First-pass numeric values — tuned in Task 13.
```ts
export const CONFIG = {
  sim: { seed: 0xf1a7, snapMax: 8192, coreFloor: 48 },
  worker: { TICK_MS: 5, MAX_CATCHUP_MS: 20, hzEmaTau: 0.5 },
  loop: { MAX_FRAME_DT: 0.05 },
  physics: {
    MASS: 1, INERTIA: 0.05, GRAVITY: 9.81,
    LIN_DRAG: 1.4, ANG_DRAG: 4.0,
    HOVER_S: 0, LIFT_K: 6, CRUISE_THRUST: 1.6,
    ROLL_K: 2.2, YAW_A_K: 1.4, THRUST_K: 4, YAW_K: 3,
    ESCAPE_TH: 0.5, ESCAPE_HYST: 0.15, ESCAPE_IMPULSE: 9, ESCAPE_LOCKOUT_S: 0.35,
    BOUNDS_K: 40, BOUNDS_C: 6, BOUNCE: 0.35,
    FLY_R: 0.25, CONTACT_STARTLE: 3, NOISE_AMP: 0.04, NOISE_HZ: 1.3,
  },
  sensing: {
    PROX_MAX: 20, EPS: 0.05, LOOM_CONE_DEG: 50,
    TAU_PROX: 0.08, TAU_LOOM: 0.06,
  },
  camera: { OFFSET: { x: -3.2, y: 1.4, z: 0 }, LOOKAHEAD: 2.5, omega: 14 },
  aesthetic: {
    BASE_SIZE: 2.2, CORE_SIZE: 4.5, ACT_SWELL: 1.6, POINT_SCALE: 340,
    FLAP_MIN: 8, FLAP_MAX: 34, FLAP_AMP: 0.9,
    grid: true, grain: false,
  },
} as const;
```
(`FLAP_*` live here from the start — Task 11's `fly.ts` consumes them; no later task edits `CONFIG`.)

- [ ] **Step 5: Vite isolation headers + wasm ordering**

`vite.config.ts`:
```ts
import { defineConfig } from "vite";

export default defineConfig({
  build: { target: "es2022" },
  worker: { format: "es" },
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  preview: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
});
```

- [ ] **Step 6: `package.json` scripts + `.gitignore`**

Add scripts (keep existing ones):
```jsonc
"predev": "yarn rs:wasm",
"prebuild": "yarn rs:wasm",
"rs:wasm:node": "wasm-pack build crates/fly-sim --target nodejs --dev --out-dir pkg-node",
"rs:smoke": "yarn rs:wasm:node && node examples/smoke.mjs",
```
Rewrite `ci` and `prep` so a **web** wasm build precedes `typecheck` (the worker imports `crates/fly-sim/pkg/fly_sim.js`, whose `.d.ts` must exist) and a **node** wasm build precedes `test` (the integration test in Task 6):
```jsonc
"prep": "yarn format && yarn lint:fix && yarn rs:fmt && yarn rs:wasm && yarn typecheck && yarn rs:lint && yarn rs:wasm:node && yarn build",
"ci": "yarn format:check && yarn lint && yarn rs:fmt:check && yarn rs:wasm && yarn typecheck && yarn rs:lint && yarn rs:test && yarn rs:wasm:node && yarn test && yarn build && yarn py:test && yarn py:fixture-check",
```
(`build` already runs `yarn rs:wasm` via `prebuild`, so it is not repeated at the end.)
`.gitignore` — add:
```
crates/fly-sim/pkg/
crates/fly-sim/pkg-node/
dist/
```
If `crates/fly-sim/pkg/` or `pkg-node/` were ever committed, `git rm -r --cached` them.

- [ ] **Step 7: Green**

Run: `npx vitest run src/app/config.test.ts && npx tsc --noEmit`
Expected: config test PASS; typecheck clean (the deleted shim no longer referenced — `src/formats/fixture.ts` still compiles because `@types/node` now provides `node:fs` / `node:url`).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: Plan 02 carry-ins — @types/node, three, CONFIG, COOP/COEP headers"
```

---

## Task 2: `sim/roles.ts` — `groups.json` → `RoleTable`

**Files:**
- Create: `src/sim/roles.ts`, `src/sim/roles.test.ts`

**Interfaces:**
- Consumes: `parseGroups` / `GroupsFile` from `src/formats/groups.ts` (Plan 01).
- Produces: `buildRoleTable(groups: GroupsFile): RoleTable` (shape in "Shared types"). `inputOrder` / `readoutOrder` = `Object.keys(...).sort()`.

- [ ] **Step 1: Write the failing test**

`src/sim/roles.test.ts`:
```ts
import { expect, test } from "vitest";
import { parseGroups } from "../formats/groups";
import { fixtureJson } from "../formats/fixture";
import { buildRoleTable } from "./roles";

test("role table is sorted and index-aligned", () => {
  const rt = buildRoleTable(parseGroups(fixtureJson("groups.json")));
  expect(rt.inputOrder).toEqual(["light_l", "light_r", "looming", "proximity", "wind_l", "wind_r"]);
  expect(rt.readoutOrder).toEqual(["escape", "thrust", "wing_l", "wing_r", "yaw_torque"]);
  rt.inputOrder.forEach((name, i) => expect(rt.input[name]).toBe(i));
  rt.readoutOrder.forEach((name, i) => expect(rt.readout[name]).toBe(i));
  // namespaces are independent
  expect(rt.input.looming).toBe(2);
  expect(rt.readout.escape).toBe(0);
});
```

- [ ] **Step 2: Run it, watch it fail**

Run: `npx vitest run src/sim/roles.test.ts`
Expected: FAIL — cannot resolve `./roles`.

- [ ] **Step 3: Implement**

`src/sim/roles.ts`:
```ts
import type { GroupsFile } from "../formats/groups";

export interface RoleTable {
  input: Record<string, number>;
  readout: Record<string, number>;
  inputOrder: string[];
  readoutOrder: string[];
}

function order(roles: Record<string, number[]>): { order: string[]; index: Record<string, number> } {
  const orderArr = Object.keys(roles).sort();
  const index: Record<string, number> = {};
  orderArr.forEach((name, i) => (index[name] = i));
  return { order: orderArr, index };
}

export function buildRoleTable(groups: GroupsFile): RoleTable {
  const inp = order(groups.inputRoles);
  const out = order(groups.readoutRoles);
  return { input: inp.index, readout: out.index, inputOrder: inp.order, readoutOrder: out.order };
}

/** Neuron-index lists in RoleTable order — used by the worker to define roles on the Sim. */
export function roleNeuronLists(groups: GroupsFile, rt: RoleTable): { input: number[][]; readout: number[][] } {
  return {
    input: rt.inputOrder.map((n) => groups.inputRoles[n]!),
    readout: rt.readoutOrder.map((n) => groups.readoutRoles[n]!),
  };
}
```

- [ ] **Step 4: Run it, watch it pass**

Run: `npx vitest run src/sim/roles.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sim
git commit -m "feat: groups.json → sorted RoleTable"
```

---

## Task 3: `bridge/ring.ts` + `bridge/step-accumulator.ts` — pure worker primitives

**Files:**
- Create: `src/bridge/ring.ts`, `src/bridge/ring.test.ts`
- Create: `src/bridge/step-accumulator.ts`, `src/bridge/step-accumulator.test.ts`

**Interfaces:**
- Consumes: `SimLike` (Shared types).
- Produces:
  - `class RingLayout` — byte-offset math for the SAB regions. `new RingLayout(nInput, nReadout, snapMax)`; fields `controlOffset`, `inputOffset`, `outputOffset`, `bytes`; `views(sab: SharedArrayBuffer): { control: Int32Array; input: Float32Array; output: Float32Array }`. Control ints: `[0]=seqOut [1]=activeCount [2]=simHzMilli [3]=paused [4]=tickLo [5]=tickHi [6]=nSnapshot`.
  - `writeOutput(v, { readouts, activity, nSnapshot, activeCount, simHz, tick, paused })` — bumps `seqOut` odd→write→even via `Atomics`.
  - `readOutput(v): { readouts: Float32Array; activity: Float32Array; simHz: number; tick: number } | null` — returns `null` on a torn/odd read (caller keeps its last good copy).
  - `writeInput(v, stimulus: Float32Array)` / `readInput(v): Float32Array` — plain copy, no seq.
  - `interface AccState { acc: number; tick: number; hzEma: number }`
  - `stepAccumulator(state: AccState, elapsedMs: number, latched: Float32Array, sim: SimLike, inputRoleIds: number[], cfg: { TICK_MS: number; MAX_CATCHUP_MS: number; hzEmaTau: number }): AccState` — pure; mutates `sim`, returns a new `AccState`.

- [ ] **Step 1: Write the failing ring test**

`src/bridge/ring.test.ts`:
```ts
import { expect, test } from "vitest";
import { RingLayout, writeOutput, readOutput, writeInput, readInput } from "./ring";

const L = new RingLayout(6, 5, 16);

test("output round-trips through the ring", () => {
  const sab = new SharedArrayBuffer(L.bytes);
  const v = L.views(sab);
  const readouts = Float32Array.from([0.1, 0.2, 0.3, 0.4, 0.5]);
  const activity = Float32Array.from({ length: 16 }, (_, i) => i / 16);
  writeOutput(v, { readouts, activity, nSnapshot: 10, activeCount: 200, simHz: 187.5, tick: 4_000_000_050, paused: 0 });
  const got = readOutput(v);
  expect(got).not.toBeNull();
  expect([...got!.readouts]).toEqual([...readouts]);
  expect([...got!.activity]).toEqual([...activity.slice(0, 10)]);
  expect(got!.simHz).toBeCloseTo(187.5, 1);
  expect(got!.tick).toBe(4_000_000_050); // 53-bit split survives
});

test("a torn read (odd seq) returns null", () => {
  const sab = new SharedArrayBuffer(L.bytes);
  const v = L.views(sab);
  Atomics.store(v.control, 0, 3); // odd: writer mid-write
  expect(readOutput(v)).toBeNull();
});

test("input region is a plain copy", () => {
  const sab = new SharedArrayBuffer(L.bytes);
  const v = L.views(sab);
  writeInput(v, Float32Array.from([1, 2, 3, 4, 5, 6]));
  expect([...readInput(v)]).toEqual([1, 2, 3, 4, 5, 6]);
});
```

- [ ] **Step 2: Run it, watch it fail**

Run: `npx vitest run src/bridge/ring.test.ts`
Expected: FAIL — cannot resolve `./ring`.

- [ ] **Step 3: Implement `ring.ts`**

```ts
const CTRL_INTS = 7;
const SEQ = 0, ACTIVE = 1, HZ_MILLI = 2, PAUSED = 3, TICK_LO = 4, TICK_HI = 5, N_SNAP = 6;

export class RingLayout {
  readonly controlOffset = 0;
  readonly inputOffset: number;
  readonly outputOffset: number;
  readonly bytes: number;
  constructor(readonly nInput: number, readonly nReadout: number, readonly snapMax: number) {
    this.inputOffset = CTRL_INTS * 4;
    this.outputOffset = this.inputOffset + nInput * 4;
    this.bytes = this.outputOffset + (nReadout + snapMax) * 4;
  }
  views(sab: SharedArrayBuffer) {
    return {
      control: new Int32Array(sab, this.controlOffset, CTRL_INTS),
      input: new Float32Array(sab, this.inputOffset, this.nInput),
      output: new Float32Array(sab, this.outputOffset, this.nReadout + this.snapMax),
      _nReadout: this.nReadout,
    };
  }
}
type V = ReturnType<RingLayout["views"]>;

export function writeInput(v: V, stimulus: Float32Array) { v.input.set(stimulus.subarray(0, v.input.length)); }
export function readInput(v: V): Float32Array { return v.input.slice(); }

export function writeOutput(v: V, d: {
  readouts: Float32Array; activity: Float32Array; nSnapshot: number;
  activeCount: number; simHz: number; tick: number; paused: number;
}) {
  const seq = Atomics.load(v.control, SEQ);
  const odd = seq % 2 === 0 ? seq + 1 : seq;   // enter the write: seq is odd
  Atomics.store(v.control, SEQ, odd);
  v.output.set(d.readouts.subarray(0, v._nReadout), 0);
  v.output.set(d.activity.subarray(0, d.nSnapshot), v._nReadout);
  Atomics.store(v.control, ACTIVE, d.activeCount | 0);
  Atomics.store(v.control, HZ_MILLI, Math.round(d.simHz * 1000));
  Atomics.store(v.control, PAUSED, d.paused | 0);
  Atomics.store(v.control, TICK_LO, (d.tick % 0x100000000) | 0);
  Atomics.store(v.control, TICK_HI, Math.floor(d.tick / 0x100000000) | 0);
  Atomics.store(v.control, N_SNAP, d.nSnapshot | 0);
  Atomics.store(v.control, SEQ, odd + 1);       // leave the write: seq is even again
}

export function readOutput(v: V) {
  const s1 = Atomics.load(v.control, SEQ);
  if (s1 % 2 !== 0) return null;
  const nSnap = Atomics.load(v.control, N_SNAP);
  const readouts = v.output.slice(0, v._nReadout);
  const activity = v.output.slice(v._nReadout, v._nReadout + nSnap);
  const hz = Atomics.load(v.control, HZ_MILLI) / 1000;
  const tick = Atomics.load(v.control, TICK_HI) * 0x100000000 + (Atomics.load(v.control, TICK_LO) >>> 0);
  const s2 = Atomics.load(v.control, SEQ);
  if (s2 !== s1) return null;
  return { readouts, activity, simHz: hz, tick };
}
```

- [ ] **Step 4: Run it, watch it pass**

Run: `npx vitest run src/bridge/ring.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing accumulator test**

`src/bridge/step-accumulator.test.ts`:
```ts
import { expect, test } from "vitest";
import { stepAccumulator, type AccState } from "./step-accumulator";
import type { SimLike } from "./sim-bridge";

class FakeSim implements SimLike {
  injects: Array<[number, number]> = [];
  steps = 0;
  inject(id: number, v: number) { this.injects.push([id, v]); }
  step(t: number) { this.steps += t; }
  readout() { return 0; }
  activity_snapshot() { return new Float32Array(0); }
}
const CFG = { TICK_MS: 5, MAX_CATCHUP_MS: 20, hzEmaTau: 0.5 };
const fresh = (): AccState => ({ acc: 0, tick: 0, hzEma: 0 });

test("elapsed 17ms at 5ms/tick runs 3 ticks, keeps 2ms remainder", () => {
  const sim = new FakeSim();
  const s = stepAccumulator(fresh(), 17, Float32Array.from([9]), sim, [0], CFG);
  expect(sim.steps).toBe(3);
  expect(s.tick).toBe(3);
  expect(s.acc).toBeCloseTo(2, 5);
});

test("stimulus is re-injected before every tick", () => {
  const sim = new FakeSim();
  stepAccumulator(fresh(), 15, Float32Array.from([0.7, 0.2]), sim, [0, 1], CFG);
  expect(sim.injects).toEqual([[0, 0.7], [1, 0.2], [0, 0.7], [1, 0.2], [0, 0.7], [1, 0.2]]);
});

test("a huge elapsed is clamped to MAX_CATCHUP_MS (no spiral)", () => {
  const sim = new FakeSim();
  stepAccumulator(fresh(), 5000, Float32Array.from([1]), sim, [0], CFG);
  expect(sim.steps).toBe(4); // 20ms / 5ms
});

test("hzEma rises toward the observed rate", () => {
  const sim = new FakeSim();
  let s = fresh();
  for (let i = 0; i < 50; i++) s = stepAccumulator(s, 5, Float32Array.from([0]), sim, [0], CFG);
  expect(s.hzEma).toBeGreaterThan(150);
  expect(s.hzEma).toBeLessThan(210);
});
```

- [ ] **Step 6: Run it, watch it fail**

Run: `npx vitest run src/bridge/step-accumulator.test.ts`
Expected: FAIL — cannot resolve `./step-accumulator`.

- [ ] **Step 7: Implement `step-accumulator.ts`**

```ts
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
```

- [ ] **Step 8: Run it, watch it pass**

Run: `npx vitest run src/bridge/step-accumulator.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 9: Commit**

```bash
git add src/bridge/ring.ts src/bridge/ring.test.ts src/bridge/step-accumulator.ts src/bridge/step-accumulator.test.ts
git commit -m "feat: SAB ring layout + pure 200Hz step accumulator with per-tick stimulus latch"
```

---

## Task 4: `bridge/protocol.ts` + `sim-bridge.ts` + `pm-bridge.ts` + `sim.worker.ts` (postMessage path)

**Files:**
- Create: `src/bridge/protocol.ts`, `src/bridge/protocol.test.ts`
- Create: `src/bridge/sim-bridge.ts` (interface + `createSimBridge`), `src/bridge/pm-bridge.ts`, `src/bridge/pm-bridge.test.ts`
- Create: `src/bridge/sim.worker.ts`
- Create: `src/bridge/worker-core.ts`, `src/bridge/worker-core.test.ts`

**Interfaces:**
- Consumes: `RoleTable`, `roleNeuronLists` (Task 2); `stepAccumulator`, `RingLayout` (Task 3); Plan-01 `parseGroups`; the WASM `Sim` (`crates/fly-sim/pkg` at runtime).
- Produces:
  - `protocol.ts`: `type ToWorker = { t: "init"; assets; config } | { t: "setActiveCount"; n } | { t: "setParams"; p } | { t: "pause" } | { t: "resume" } | { t: "reset" } | { t: "dispose" }`; `type FromWorker = { t: "ready"; nNeurons; coreCount; groups } | { t: "state"; readouts; activity; simHz; tick } | { t: "error"; message }`.
  - `sim-bridge.ts`: `SimBridge` (Shared types), `createSimBridge(): SimBridge` — returns `SabBridge` when `globalThis.crossOriginIsolated`, else `PmBridge` (Task 6 adds the SAB branch; this task: always `PmBridge`).
  - `worker-core.ts`: `class WorkerCore` — transport-agnostic engine. `constructor(sim: SimLike, roleTable: RoleTable, inputRoleIds: number[], readoutRoleIds: number[], cfg)`; `frame(elapsedMs): { readouts: Float32Array; activity: Float32Array; simHz: number; tick: number; nSnapshot: number; activeCount: number }` (the last two are for Task 5's SAB `writeOutput`; `encodeState` ignores them); `setStimulus(v)`, `setActiveCount(n)`, `pause()`, `resume()`, `reset(reseed)`. Holds the latched stimulus + `AccState`; `frame` calls `stepAccumulator` then samples readouts + strided snapshot.
  - `pm-bridge.ts`: `class PmBridge implements SimBridge` taking a `workerFactory: () => Worker` (real factory in `main.ts`; a `FakeWorker` in tests).

- [ ] **Step 1: Write the failing protocol test**

`src/bridge/protocol.test.ts`:
```ts
import { expect, test } from "vitest";
import { encodeState, decodeState } from "./protocol";

test("state message round-trips with transferables", () => {
  const readouts = Float32Array.from([0.1, 0.2, 0.3, 0.4, 0.5]);
  const activity = Float32Array.from({ length: 32 }, (_, i) => i / 32);
  const msg = encodeState({ readouts, activity, simHz: 190, tick: 12345 });
  expect(msg.transfer).toEqual([msg.payload.readouts.buffer, msg.payload.activity.buffer]);
  const back = decodeState(msg.payload);
  expect([...back.readouts]).toEqual([...readouts]);
  expect([...back.activity]).toEqual([...activity]);
  expect(back.simHz).toBe(190);
  expect(back.tick).toBe(12345);
});
```

- [ ] **Step 2: Run it, watch it fail**

Run: `npx vitest run src/bridge/protocol.test.ts`
Expected: FAIL — cannot resolve `./protocol`.

- [ ] **Step 3: Implement `protocol.ts`**

```ts
export interface StatePayload { readouts: Float32Array; activity: Float32Array; simHz: number; tick: number; }

export type ToWorker =
  | { t: "init"; assets: { neurons: ArrayBuffer; graph: ArrayBuffer; groups: unknown }; config: import("./sim-bridge").SimInitConfig }
  | { t: "setActiveCount"; n: number }
  | { t: "setParams"; p: Partial<import("./sim-bridge").LifParams> }
  | { t: "pause" } | { t: "resume" } | { t: "reset" } | { t: "dispose" }
  | { t: "stimulus"; v: Float32Array };

export type FromWorker =
  | { t: "ready"; nNeurons: number; coreCount: number; groups: unknown }
  | { t: "state"; readouts: Float32Array; activity: Float32Array; simHz: number; tick: number }
  | { t: "error"; message: string };

export function encodeState(s: StatePayload): { payload: FromWorker & { t: "state" }; transfer: Transferable[] } {
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
```

- [ ] **Step 4: Run it, watch it pass**

Run: `npx vitest run src/bridge/protocol.test.ts` → PASS.

- [ ] **Step 5: Write the failing `worker-core` test**

`src/bridge/worker-core.test.ts`:
```ts
import { expect, test } from "vitest";
import { WorkerCore } from "./worker-core";
import type { SimLike } from "./sim-bridge";

class FakeSim implements SimLike {
  n: number; lastInject: Record<number, number> = {};
  constructor(n: number) { this.n = n; }
  inject(id: number, v: number) { this.lastInject[id] = v; }
  step() {}
  readout(id: number) { return id === 0 ? (this.lastInject[10] ?? 0) : 0; } // readout 0 mirrors input role 10
  activity_snapshot() { return Float32Array.from({ length: this.n }, (_, i) => i / this.n); }
}
const rt = { input: { a: 0 }, readout: { escape: 0, x: 1 }, inputOrder: ["a"], readoutOrder: ["escape", "x"] };
const cfg = { TICK_MS: 5, MAX_CATCHUP_MS: 20, hzEmaTau: 0.5, snapMax: 4, coreFloor: 2 };

test("frame() returns readouts of readoutOrder length and a strided snapshot", () => {
  const core = new WorkerCore(new FakeSim(500), rt as any, [10], [0, 1], cfg);
  core.setActiveCount(500);
  const f = core.frame(10);
  expect(f.readouts.length).toBe(2);
  expect(f.activity.length).toBe(4);       // min(activeCount, snapMax)
  expect(f.tick).toBe(2);
});

test("setStimulus is what gets latched + injected", () => {
  const sim = new FakeSim(50);
  const core = new WorkerCore(sim, rt as any, [10], [0, 1], cfg);
  core.setActiveCount(50);
  core.setStimulus(Float32Array.from([0.9]));
  const f = core.frame(10);
  expect(sim.lastInject[10]).toBe(0.9);
  expect(f.readouts[0]).toBe(0.9);
});

test("pause() freezes ticks", () => {
  const core = new WorkerCore(new FakeSim(50), rt as any, [10], [0, 1], cfg);
  core.setActiveCount(50);
  core.pause();
  expect(core.frame(100).tick).toBe(0);
  core.resume();
  expect(core.frame(20).tick).toBeGreaterThan(0);
});
```

- [ ] **Step 6: Run it, watch it fail**

Run: `npx vitest run src/bridge/worker-core.test.ts`
Expected: FAIL — cannot resolve `./worker-core`.

- [ ] **Step 7: Implement `worker-core.ts`**

```ts
import type { SimLike } from "./sim-bridge";
import type { RoleTable } from "../sim/roles";
import { stepAccumulator, type AccState } from "./step-accumulator";

interface Cfg { TICK_MS: number; MAX_CATCHUP_MS: number; hzEmaTau: number; snapMax: number; coreFloor: number; }

export class WorkerCore {
  private latched: Float32Array;
  private acc: AccState = { acc: 0, tick: 0, hzEma: 0 };
  private activeCount = 0;
  private paused = false;
  constructor(
    private sim: SimLike, private rt: RoleTable,
    private inputRoleIds: number[], private readoutRoleIds: number[], private cfg: Cfg,
  ) { this.latched = new Float32Array(rt.inputOrder.length); }

  setStimulus(v: Float32Array) { this.latched.set(v.subarray(0, this.latched.length)); }
  setActiveCount(n: number) { this.activeCount = Math.max(n | 0, this.cfg.coreFloor); }
  pause() { this.paused = true; }
  resume() { this.paused = false; }
  reset() { this.acc = { acc: 0, tick: 0, hzEma: 0 }; this.latched.fill(0); }

  frame(elapsedMs: number) {
    if (!this.paused) {
      this.acc = stepAccumulator(this.acc, elapsedMs, this.latched, this.sim, this.inputRoleIds, this.cfg);
    }
    const readouts = new Float32Array(this.readoutRoleIds.length);
    for (let i = 0; i < readouts.length; i++) readouts[i] = this.sim.readout(this.readoutRoleIds[i]!);
    const snap = this.sim.activity_snapshot();
    const nSnapshot = Math.min(this.activeCount || snap.length, this.cfg.snapMax);
    const stride = Math.max(1, Math.ceil((this.activeCount || snap.length) / nSnapshot));
    const activity = new Float32Array(nSnapshot);
    for (let i = 0; i < nSnapshot; i++) activity[i] = snap[i * stride] ?? 0;
    return { readouts, activity, simHz: this.acc.hzEma, tick: this.acc.tick, nSnapshot, activeCount: this.activeCount };
  }
}
```

- [ ] **Step 8: Run it, watch it pass**

Run: `npx vitest run src/bridge/worker-core.test.ts` → PASS (3 tests).

- [ ] **Step 9: Write the failing `pm-bridge` test**

`src/bridge/pm-bridge.test.ts` — a `FakeWorker` that routes messages to a handler you install:
```ts
import { expect, test, vi } from "vitest";
import { PmBridge } from "./pm-bridge";
import type { ToWorker, FromWorker } from "./protocol";

class FakeWorker {
  onmessage: ((e: { data: FromWorker }) => void) | null = null;
  posted: ToWorker[] = [];
  handler: (m: ToWorker, reply: (f: FromWorker, transfer?: Transferable[]) => void) => void = () => {};
  postMessage(m: ToWorker) {
    this.posted.push(m);
    queueMicrotask(() => this.handler(m, (f) => this.onmessage?.({ data: f })));
  }
  terminate() {}
}

test("init resolves on ready and exposes roleTable", async () => {
  const fw = new FakeWorker();
  fw.handler = (m, reply) => {
    if (m.t === "init") reply({ t: "ready", nNeurons: 500, coreCount: 48, groups: { roles: { input: { looming: [0] }, readout: { escape: [1] } } } });
  };
  const b = new PmBridge(() => fw as unknown as Worker);
  const info = await b.init({ neurons: new ArrayBuffer(8), graph: new ArrayBuffer(8), groups: {} }, { seed: 1, snapMax: 16 });
  expect(info.nNeurons).toBe(500);
  expect(info.roleTable.readoutOrder).toEqual(["escape"]);
});

test("setStimulus posts a stimulus message; readState returns last state", async () => {
  const fw = new FakeWorker();
  fw.handler = (m, reply) => {
    if (m.t === "init") reply({ t: "ready", nNeurons: 4, coreCount: 2, groups: { roles: { input: { a: [0] }, readout: { b: [1] } } } });
  };
  const b = new PmBridge(() => fw as unknown as Worker);
  await b.init({ neurons: new ArrayBuffer(8), graph: new ArrayBuffer(8), groups: {} }, { seed: 1, snapMax: 8 });
  b.setStimulus(Float32Array.from([0.5]));
  expect(fw.posted.some((p) => p.t === "stimulus")).toBe(true);
  fw.onmessage?.({ data: { t: "state", readouts: Float32Array.from([0.9]), activity: new Float32Array(4), simHz: 200, tick: 10 } });
  expect(b.readState().readouts[0]).toBe(0.9);
  expect(b.readState().tick).toBe(10);
});
```

- [ ] **Step 10: Run it, watch it fail**

Run: `npx vitest run src/bridge/pm-bridge.test.ts`
Expected: FAIL — cannot resolve `./pm-bridge`.

- [ ] **Step 11: Implement `sim-bridge.ts` + `pm-bridge.ts`**

`src/bridge/sim-bridge.ts` — the interface block from "Shared types", plus:
```ts
import { PmBridge } from "./pm-bridge";

export function createSimBridge(workerFactory: () => Worker): SimBridge {
  // Task 6 replaces this with: return globalThis.crossOriginIsolated ? new SabBridge(workerFactory) : new PmBridge(workerFactory);
  return new PmBridge(workerFactory);
}
```

`src/bridge/pm-bridge.ts`:
```ts
import type { SimBridge, SimInitConfig, SimState, LifParams } from "./sim-bridge";
import type { FromWorker, ToWorker } from "./protocol";
import { buildRoleTable, type RoleTable } from "../sim/roles";
import { parseGroups } from "../formats/groups";

export class PmBridge implements SimBridge {
  private worker: Worker;
  private roleTable!: RoleTable;
  private last: SimState = { readouts: new Float32Array(0), activity: new Float32Array(0), simHz: 0, tick: 0 };
  private stim = new Float32Array(0);

  constructor(workerFactory: () => Worker) { this.worker = workerFactory(); }

  init(assets: { neurons: ArrayBuffer; graph: ArrayBuffer; groups: unknown }, config: SimInitConfig) {
    return new Promise<{ nNeurons: number; coreCount: number; roleTable: RoleTable }>((resolve, reject) => {
      this.worker.onmessage = (e: MessageEvent<FromWorker>) => {
        const m = e.data;
        if (m.t === "ready") {
          this.roleTable = buildRoleTable(parseGroups(m.groups));
          this.stim = new Float32Array(this.roleTable.inputOrder.length);
          this.last = {
            readouts: new Float32Array(this.roleTable.readoutOrder.length),
            activity: new Float32Array(0), simHz: 0, tick: 0,
          };
          this.worker.onmessage = (ev: MessageEvent<FromWorker>) => this.onMessage(ev.data);
          resolve({ nNeurons: m.nNeurons, coreCount: m.coreCount, roleTable: this.roleTable });
        } else if (m.t === "error") reject(new Error(m.message));
      };
      this.post({ t: "init", assets, config }, [assets.neurons, assets.graph]);
    });
  }
  private onMessage(m: FromWorker) {
    if (m.t === "state") this.last = { readouts: m.readouts, activity: m.activity, simHz: m.simHz, tick: m.tick };
  }
  private post(m: ToWorker, transfer: Transferable[] = []) { this.worker.postMessage(m, transfer); }

  setStimulus(v: Float32Array) {
    this.stim = v.slice();
    this.post({ t: "stimulus", v: this.stim }, [this.stim.buffer]);
    this.stim = new Float32Array(this.roleTable.inputOrder.length); // buffer was transferred
  }
  readState() { return this.last; }
  setActiveCount(n: number) { this.post({ t: "setActiveCount", n }); }
  setParams(p: Partial<LifParams>) { this.post({ t: "setParams", p }); }
  pause() { this.post({ t: "pause" }); }
  resume() { this.post({ t: "resume" }); }
  reset() { this.post({ t: "reset" }); }
  dispose() { this.post({ t: "dispose" }); this.worker.terminate(); }
}
```

- [ ] **Step 12: Run it, watch it pass**

Run: `npx vitest run src/bridge/pm-bridge.test.ts` → PASS (2 tests).

- [ ] **Step 13: Write the real worker shell `sim.worker.ts`**

Not unit-tested (needs a real Worker + WASM); it is a thin wiring of tested parts. It must contain exactly this logic:
```ts
/// <reference lib="webworker" />
import initWasm, { Sim } from "../../crates/fly-sim/pkg/fly_sim.js";
import wasmUrl from "../../crates/fly-sim/pkg/fly_sim_bg.wasm?url";
import type { ToWorker, FromWorker } from "./protocol";
import { encodeState } from "./protocol";
import { buildRoleTable, roleNeuronLists } from "../sim/roles";
import { parseGroups } from "../formats/groups";
import { WorkerCore } from "./worker-core";
import { CONFIG } from "../app/config";

let core: WorkerCore | null = null;
let running = false;
let lastTs = 0;

function post(m: FromWorker, transfer: Transferable[] = []) { (self as DedicatedWorkerGlobalScope).postMessage(m, transfer); }

async function onInit(msg: Extract<ToWorker, { t: "init" }>) {
  await initWasm(wasmUrl);
  const sim = new Sim(new Uint8Array(msg.assets.neurons), new Uint8Array(msg.assets.graph), BigInt(msg.config.seed));
  const groups = parseGroups(msg.assets.groups);
  const rt = buildRoleTable(groups);
  const lists = roleNeuronLists(groups, rt);
  const inputIds = lists.input.map((ids, i) => sim.define_input_role(rt.inputOrder[i]!, Uint32Array.from(ids)));
  const readoutIds = lists.readout.map((ids, i) => sim.define_readout_role(rt.readoutOrder[i]!, Uint32Array.from(ids)));
  core = new WorkerCore(sim as unknown as import("./sim-bridge").SimLike, rt, inputIds, readoutIds,
    { ...CONFIG.worker, snapMax: msg.config.snapMax, coreFloor: CONFIG.sim.coreFloor });
  core.setActiveCount(sim.neuron_count());
  post({ t: "ready", nNeurons: sim.neuron_count(), coreCount: sim.core_count(), groups: msg.assets.groups });
  running = true;
  lastTs = performance.now();
  loop();
}

function loop() {
  if (!core) return;
  const now = performance.now();
  const elapsed = now - lastTs;
  lastTs = now;
  if (running) {
    const f = core.frame(elapsed);
    const enc = encodeState(f);
    post(enc.payload, enc.transfer);
  }
  setTimeout(loop, 0);
}

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  try {
    if (m.t === "init") void onInit(m);
    else if (m.t === "stimulus") core?.setStimulus(m.v);
    else if (m.t === "setActiveCount") core?.setActiveCount(m.n);
    else if (m.t === "pause") running = false;
    else if (m.t === "resume") { running = true; lastTs = performance.now(); }
    else if (m.t === "reset") core?.reset();
    else if (m.t === "dispose") { running = false; core = null; }
  } catch (err) {
    post({ t: "error", message: String(err) });
  }
};
```
(`?url` import of the `.wasm` is a Vite feature; the `fly_sim.js` / `fly_sim_bg.wasm` names come from `wasm-pack build --target web` — verify after `yarn rs:wasm`.)

- [ ] **Step 14: Typecheck + full unit run**

Run: `npx tsc --noEmit && npx vitest run src/bridge`
Expected: clean; all bridge tests PASS. (If `tsc` cannot find `crates/fly-sim/pkg/fly_sim.js`, run `yarn rs:wasm` once so the glue exists, then re-run.)

- [ ] **Step 15: Commit**

```bash
git add src/bridge
git commit -m "feat: SimBridge postMessage transport + worker-core engine + worker shell"
```

---

## Task 5: `sab-bridge.ts` + SAB worker path + transport pick

**Files:**
- Create: `src/bridge/sab-bridge.ts`, `src/bridge/sab-bridge.test.ts`
- Modify: `src/bridge/sim-bridge.ts` (`createSimBridge` real branch), `src/bridge/sim.worker.ts` (SAB publish path), `src/bridge/worker-core.ts` (expose `nSnapshotFor(activeCount)` helper if needed)

**Interfaces:**
- Consumes: `RingLayout`, `writeOutput`, `readOutput`, `writeInput` (Task 3); `WorkerCore` (Task 4).
- Produces: `class SabBridge implements SimBridge` — allocates one `SharedArrayBuffer` sized by `RingLayout`, sends it to the worker in `init`, `setStimulus` writes the input region in place (no post), `readState` calls `readOutput` and returns the last good copy on `null`. `createSimBridge` now: `globalThis.crossOriginIsolated ? new SabBridge(f) : new PmBridge(f)`.

- [ ] **Step 1: Write the failing test**

`src/bridge/sab-bridge.test.ts` — exercise the ring wiring by playing both ends over one SAB:
```ts
import { expect, test } from "vitest";
import { RingLayout, writeOutput, readInput } from "./ring";
import { SabBridge } from "./sab-bridge";

test("stimulus written by the bridge is visible on the worker side", async () => {
  // FakeWorker that, on init, grabs the SAB and echoes ready; exposes the SAB for assertions
  let sab: SharedArrayBuffer | null = null;
  const fw = {
    onmessage: null as null | ((e: any) => void),
    postMessage(m: any) {
      if (m.t === "init") { sab = m.sab; queueMicrotask(() => fw.onmessage?.({ data: { t: "ready", nNeurons: 4, coreCount: 2, groups: { roles: { input: { a: [0] }, readout: { b: [1] } } } } })); }
    },
    terminate() {},
  };
  const b = new SabBridge(() => fw as unknown as Worker);
  await b.init({ neurons: new ArrayBuffer(8), graph: new ArrayBuffer(8), groups: {} }, { seed: 1, snapMax: 8 });
  b.setStimulus(Float32Array.from([0.7]));
  const L = new RingLayout(1, 1, 8);
  const v = L.views(sab!);
  expect([...readInput(v)]).toEqual([0.7]);
});

test("readState survives a torn write by returning the previous good copy", async () => {
  let sab: SharedArrayBuffer | null = null;
  const fw = {
    onmessage: null as null | ((e: any) => void),
    postMessage(m: any) { if (m.t === "init") { sab = m.sab; queueMicrotask(() => fw.onmessage?.({ data: { t: "ready", nNeurons: 4, coreCount: 2, groups: { roles: { input: { a: [0] }, readout: { b: [1] } } } } })); } },
    terminate() {},
  };
  const b = new SabBridge(() => fw as unknown as Worker);
  await b.init({ neurons: new ArrayBuffer(8), graph: new ArrayBuffer(8), groups: {} }, { seed: 1, snapMax: 8 });
  const L = new RingLayout(1, 1, 8);
  const v = L.views(sab!);
  writeOutput(v, { readouts: Float32Array.from([0.42]), activity: new Float32Array(8), nSnapshot: 4, activeCount: 4, simHz: 200, tick: 7, paused: 0 });
  expect(b.readState().readouts[0]).toBeCloseTo(0.42);
  Atomics.store(v.control, 0, Atomics.load(v.control, 0) + 1); // now odd → torn
  expect(b.readState().readouts[0]).toBeCloseTo(0.42); // unchanged, not garbage
});
```

- [ ] **Step 2: Run it, watch it fail**

Run: `npx vitest run src/bridge/sab-bridge.test.ts` → FAIL (`./sab-bridge` missing).

- [ ] **Step 3: Implement `sab-bridge.ts`**

```ts
import type { SimBridge, SimInitConfig, SimState, LifParams } from "./sim-bridge";
import type { FromWorker, ToWorker } from "./protocol";
import { buildRoleTable, type RoleTable } from "../sim/roles";
import { parseGroups } from "../formats/groups";
import { RingLayout, writeInput, readOutput } from "./ring";

export class SabBridge implements SimBridge {
  private worker: Worker;
  private roleTable!: RoleTable;
  private layout!: RingLayout;
  private views!: ReturnType<RingLayout["views"]>;
  private last: SimState = { readouts: new Float32Array(0), activity: new Float32Array(0), simHz: 0, tick: 0 };

  constructor(workerFactory: () => Worker) { this.worker = workerFactory(); }

  init(assets: { neurons: ArrayBuffer; graph: ArrayBuffer; groups: unknown }, config: SimInitConfig) {
    return new Promise<{ nNeurons: number; coreCount: number; roleTable: RoleTable }>((resolve, reject) => {
      // peek at role counts to size the ring before the worker replies
      const groups = parseGroups(assets.groups);
      const rt = buildRoleTable(groups);
      this.roleTable = rt;
      this.layout = new RingLayout(rt.inputOrder.length, rt.readoutOrder.length, config.snapMax);
      const sab = new SharedArrayBuffer(this.layout.bytes);
      this.views = this.layout.views(sab);
      this.last = { readouts: new Float32Array(rt.readoutOrder.length), activity: new Float32Array(0), simHz: 0, tick: 0 };
      this.worker.onmessage = (e: MessageEvent<FromWorker>) => {
        const m = e.data;
        if (m.t === "ready") resolve({ nNeurons: m.nNeurons, coreCount: m.coreCount, roleTable: rt });
        else if (m.t === "error") reject(new Error(m.message));
      };
      (this.worker as Worker).postMessage(
        { t: "init", assets, config, sab } as ToWorker & { sab: SharedArrayBuffer },
        [assets.neurons, assets.graph],
      );
    });
  }
  setStimulus(v: Float32Array) { writeInput(this.views, v); }
  readState() {
    const got = readOutput(this.views);
    if (got) this.last = { ...got };
    return this.last;
  }
  setActiveCount(n: number) { this.worker.postMessage({ t: "setActiveCount", n } as ToWorker); }
  setParams(p: Partial<LifParams>) { this.worker.postMessage({ t: "setParams", p } as ToWorker); }
  pause() { this.worker.postMessage({ t: "pause" } as ToWorker); }
  resume() { this.worker.postMessage({ t: "resume" } as ToWorker); }
  reset() { this.worker.postMessage({ t: "reset" } as ToWorker); }
  dispose() { this.worker.postMessage({ t: "dispose" } as ToWorker); this.worker.terminate(); }
}
```

- [ ] **Step 4: Wire the worker's SAB publish path**

In `sim.worker.ts`: `onInit` also accepts `msg.sab`. If present, build `RingLayout` + `views` the same way, and in `loop()` call `writeOutput(views, { ...core.frame(elapsed), nSnapshot, activeCount, paused })` **instead of** `post(encodeState(...))`. Also read the input region each frame before `core.frame` via `core.setStimulus(readInput(views))`. Keep the postMessage path when `msg.sab` is undefined. Add the `import { RingLayout, writeOutput, readInput } from "./ring";`.

- [ ] **Step 5: Real transport pick**

`sim-bridge.ts`:
```ts
import { SabBridge } from "./sab-bridge";
import { PmBridge } from "./pm-bridge";
export function createSimBridge(workerFactory: () => Worker): SimBridge {
  return globalThis.crossOriginIsolated ? new SabBridge(workerFactory) : new PmBridge(workerFactory);
}
```

- [ ] **Step 6: Test the pick**

Add to `src/bridge/sim-bridge.test.ts`:
```ts
import { expect, test, vi } from "vitest";
import { createSimBridge } from "./sim-bridge";
import { PmBridge } from "./pm-bridge";
import { SabBridge } from "./sab-bridge";

const fakeWorker = () => ({ postMessage() {}, terminate() {}, onmessage: null } as unknown as Worker);

test("createSimBridge picks transport by crossOriginIsolated", () => {
  vi.stubGlobal("crossOriginIsolated", false);
  expect(createSimBridge(fakeWorker)).toBeInstanceOf(PmBridge);
  vi.stubGlobal("crossOriginIsolated", true);
  expect(createSimBridge(fakeWorker)).toBeInstanceOf(SabBridge);
  vi.unstubAllGlobals();
});
```

- [ ] **Step 7: Green**

Run: `npx tsc --noEmit && npx vitest run src/bridge`
Expected: clean; all bridge tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src/bridge
git commit -m "feat: SharedArrayBuffer bridge transport + boot-time transport pick"
```

---

## Task 6: node-wasm integration test + `examples/smoke.mjs`

**Files:**
- Create: `examples/smoke.mjs`
- Create: `src/bridge/integration.test.ts`
- Modify: `vitest.config.ts` (only if a longer timeout is needed for wasm init)

**Interfaces:**
- Consumes: `crates/fly-sim/pkg-node` (built by `yarn rs:wasm:node`); `stepAccumulator` (Task 3); `buildRoleTable` / `roleNeuronLists` (Task 2); Plan-01 `parseGroups`, `fixtureBuf` / `fixtureJson`.
- Produces: the end-to-end "the brain reacts" test against the real WASM; a committed manual smoke script.

- [ ] **Step 1: Build the node wasm**

Run: `yarn rs:wasm:node`
Expected: `crates/fly-sim/pkg-node/fly_sim.js` + `fly_sim_bg.wasm` exist (gitignored). `--target nodejs` emits a **CommonJS** module that loads the `.wasm` synchronously at `require` time — there is **no** `init()` to call and **no** default export; `Sim` is a direct named export. Load it with `createRequire`, not `import`. Verify: `node -e "const {createRequire}=require('module'); const r=createRequire(process.cwd()+'/'); console.log(typeof r('./crates/fly-sim/pkg-node/fly_sim.js').Sim)"` prints `function`.

- [ ] **Step 2: Write `examples/smoke.mjs`**

```js
// Manual smoke: load the node-target wasm, drive a looming ramp, watch `escape` climb.
// Run: yarn rs:smoke
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Sim } = require("../crates/fly-sim/pkg-node/fly_sim.js"); // CJS, wasm auto-loaded, no init()

const dir = fileURLToPath(new URL("../pipeline/out/fixture/", import.meta.url));
const neurons = readFileSync(dir + "neurons.bin");
const graph = readFileSync(dir + "graph.bin");
const groups = JSON.parse(readFileSync(dir + "groups.json", "utf8"));

const sim = new Sim(new Uint8Array(neurons), new Uint8Array(graph), 42n);
const looming = sim.define_input_role("looming", Uint32Array.from(groups.roles.input.looming));
const escape = sim.define_readout_role("escape", Uint32Array.from(groups.roles.readout.escape));

for (let t = 0; t < 500; t++) {
  sim.inject(looming, Math.min(1.5, t / 120));
  sim.step(1);
  if (t % 40 === 0) console.log(`tick ${String(t).padStart(3)}  escape=${sim.readout(escape).toFixed(3)}`);
}
console.log(`final escape readout = ${sim.readout(escape).toFixed(3)} (expect > 0.5)`);
```

- [ ] **Step 3: Run the smoke**

Run: `yarn rs:smoke`
Expected: the `escape` readout rises from `0.000` past `0.5` by the end.

- [ ] **Step 4: Write the failing integration test**

`src/bridge/integration.test.ts`:
```ts
import { expect, test } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fixtureBuf, fixtureJson } from "../formats/fixture";
import { parseGroups } from "../formats/groups";
import { buildRoleTable, roleNeuronLists } from "../sim/roles";
import { stepAccumulator, type AccState } from "./step-accumulator";
import type { SimLike } from "./sim-bridge";

const pkg = fileURLToPath(new URL("../../crates/fly-sim/pkg-node/fly_sim.js", import.meta.url));
const havePkg = existsSync(pkg);

test.runIf(havePkg)("looming ramp drives escape across threshold via the real wasm", async () => {
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  const { Sim } = require(pkg) as { Sim: new (n: Uint8Array, g: Uint8Array, seed: bigint) => SimLike & Record<string, Function> };
  const groups = parseGroups(fixtureJson("groups.json"));
  const rt = buildRoleTable(groups);
  const lists = roleNeuronLists(groups, rt);
  const sim = new Sim(new Uint8Array(fixtureBuf("neurons.bin")), new Uint8Array(fixtureBuf("graph.bin")), 42n) as unknown as SimLike & { define_input_role: Function; define_readout_role: Function };
  const inputIds = lists.input.map((ids, i) => (sim as any).define_input_role(rt.inputOrder[i], Uint32Array.from(ids)));
  lists.readout.forEach((ids, i) => (sim as any).define_readout_role(rt.readoutOrder[i], Uint32Array.from(ids)));
  const escapeIdx = rt.readout.escape;

  const cfg = { TICK_MS: 5, MAX_CATCHUP_MS: 20, hzEmaTau: 0.5 };
  let st: AccState = { acc: 0, tick: 0, hzEma: 0 };
  const stim = new Float32Array(rt.inputOrder.length);
  let crossed = -1;
  for (let frame = 0; frame < 200 && crossed < 0; frame++) {
    stim[rt.input.looming] = Math.min(1.5, frame / 30);
    st = stepAccumulator(st, 16.7, stim, sim, inputIds, cfg);
    if (sim.readout(escapeIdx) > 0.5) crossed = st.tick;
  }
  expect(crossed).toBeGreaterThan(0);
  expect(crossed).toBeLessThan(1200); // well within the ~400-tick budget after the ramp

  // and it stays quiet with no stimulus
  const sim2 = new Sim(new Uint8Array(fixtureBuf("neurons.bin")), new Uint8Array(fixtureBuf("graph.bin")), 42n) as any;
  lists.input.forEach((ids, i) => sim2.define_input_role(rt.inputOrder[i], Uint32Array.from(ids)));
  lists.readout.forEach((ids, i) => sim2.define_readout_role(rt.readoutOrder[i], Uint32Array.from(ids)));
  let st2: AccState = { acc: 0, tick: 0, hzEma: 0 };
  for (let i = 0; i < 200; i++) st2 = stepAccumulator(st2, 16.7, new Float32Array(rt.inputOrder.length), sim2, inputIds, cfg);
  expect(sim2.readout(escapeIdx)).toBeLessThan(0.5);
});
```

- [ ] **Step 5: Run it**

Run: `npx vitest run src/bridge/integration.test.ts`
Expected: PASS. If it is skipped, run `yarn rs:wasm:node` first. If wasm init exceeds the default timeout, add `test: { testTimeout: 20000 }` to `vitest.config.ts`.

- [ ] **Step 6: Full green + commit**

Run: `yarn ci`
Expected: all green (CI now runs `rs:wasm:node` then `test`, so the integration test is never skipped in CI).
```bash
git add examples/smoke.mjs src/bridge/integration.test.ts vitest.config.ts
git commit -m "test: end-to-end looming→escape against the real wasm + committed smoke script"
```

---

## Task 7: `sensing/` — raycasts + proximity + looming

**Files:**
- Create: `src/sensing/raycast.ts`, `src/sensing/raycast.test.ts`
- Create: `src/sensing/sensing.ts`, `src/sensing/sensing.test.ts`
- Create: `src/body/types.ts` (the Shared-types structs — first file to need them)

**Interfaces:**
- Consumes: `Vec3`, `Pose`, `WorldQuery`, `Aabb` (`src/body/types.ts`); `RoleTable` (Task 2); `CONFIG.sensing`.
- Produces:
  - `raycast.ts`: `rayAabb(origin: Vec3, dir: Vec3, box: Aabb): number | null` (slab method; `dir` need not be normalized; returns parametric `t ≥ 0` of the first hit or `null`); `nearestHit(origin: Vec3, dirs: Vec3[], boxes: Aabb[]): number` (min positive hit distance, `Infinity` if none — distances scaled by `|dir|`, so pass unit dirs).
  - `sensing.ts`: `interface SensingState { loomTheta: number; prox: number; loom: number }`; `initSensingState(): SensingState`; `sample(pose: Pose, world: WorldQuery, dt: number, prev: SensingState, rt: RoleTable): { stimulus: Float32Array; state: SensingState }` — `stimulus.length === rt.inputOrder.length`; only `rt.input.proximity` and `rt.input.looming` slots are ever non-zero.

- [ ] **Step 1: Create `src/body/types.ts`**

Exactly the `Vec3`/`Quat`/`Aabb`/`Pose`/`WorldQuery`/`Readouts` block from "Shared types", plus tiny helpers used across `body/` and `sensing/`:
```ts
export const v = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const len = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
export const norm = (a: Vec3): Vec3 => { const l = len(a) || 1; return scale(a, 1 / l); };
export const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
```

- [ ] **Step 2: Write the failing `raycast` test**

`src/sensing/raycast.test.ts`:
```ts
import { expect, test } from "vitest";
import { rayAabb, nearestHit } from "./raycast";
import { v } from "../body/types";

const box = { min: v(1, -1, -1), max: v(3, 1, 1) };

test("ray hits a box straight ahead at the near face", () => {
  expect(rayAabb(v(0, 0, 0), v(1, 0, 0), box)).toBeCloseTo(1);
});
test("ray pointing away misses", () => {
  expect(rayAabb(v(0, 0, 0), v(-1, 0, 0), box)).toBeNull();
});
test("origin inside the box returns 0", () => {
  expect(rayAabb(v(2, 0, 0), v(1, 0, 0), box)).toBe(0);
});
test("nearestHit picks the closest of several boxes", () => {
  const far = { min: v(9, -1, -1), max: v(10, 1, 1) };
  expect(nearestHit(v(0, 0, 0), [v(1, 0, 0)], [far, box])).toBeCloseTo(1);
  expect(nearestHit(v(0, 0, 0), [v(0, 1, 0)], [box])).toBe(Infinity);
});
```

- [ ] **Step 3: Run it, watch it fail** — `npx vitest run src/sensing/raycast.test.ts` → FAIL.

- [ ] **Step 4: Implement `raycast.ts`**

```ts
import type { Vec3, Aabb } from "../body/types";

export function rayAabb(origin: Vec3, dir: Vec3, box: Aabb): number | null {
  let tmin = -Infinity, tmax = Infinity;
  for (const ax of ["x", "y", "z"] as const) {
    const o = origin[ax], d = dir[ax], lo = box.min[ax], hi = box.max[ax];
    if (Math.abs(d) < 1e-12) { if (o < lo || o > hi) return null; continue; }
    let t1 = (lo - o) / d, t2 = (hi - o) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  return Math.max(tmin, 0);
}

export function nearestHit(origin: Vec3, dirs: Vec3[], boxes: Aabb[]): number {
  let best = Infinity;
  for (const dir of dirs) for (const b of boxes) {
    const t = rayAabb(origin, dir, b);
    if (t !== null && t < best) best = t;
  }
  return best;
}
```

- [ ] **Step 5: Run it, watch it pass** — `npx vitest run src/sensing/raycast.test.ts` → PASS.

- [ ] **Step 6: Write the failing `sensing` test**

`src/sensing/sensing.test.ts`:
```ts
import { expect, test } from "vitest";
import { sample, initSensingState } from "./sensing";
import { v, type Pose, type WorldQuery } from "../body/types";

const rt = { input: { light_l: 0, light_r: 1, looming: 2, proximity: 3, wind_l: 4, wind_r: 5 }, readout: {},
  inputOrder: ["light_l", "light_r", "looming", "proximity", "wind_l", "wind_r"], readoutOrder: [] };

const pose = (px: number): Pose => ({ position: v(px, 0, 0), orientation: { x: 0, y: 0, z: 0, w: 1 }, forward: v(1, 0, 0), up: v(0, 1, 0) });
const world: WorldQuery = { aabbs: [{ min: v(10, -0.5, -0.5), max: v(11, 0.5, 0.5) }], bounds: { min: v(-50, -50, -50), max: v(50, 50, 50) } };

test("looming grows as the fly closes on the object; only looming + proximity slots fill", () => {
  let st = initSensingState();
  let r = sample(pose(0), world, 0.1, st, rt as any); st = r.state;
  for (let i = 1; i <= 30; i++) { r = sample(pose(i * 0.25), world, 0.1, st, rt as any); st = r.state; }
  expect(r.stimulus[rt.input.looming]).toBeGreaterThan(0);
  expect(r.stimulus[rt.input.proximity]).toBeGreaterThan(0);
  for (const i of [rt.input.light_l, rt.input.light_r, rt.input.wind_l, rt.input.wind_r]) expect(r.stimulus[i]).toBe(0);
});

test("receding object yields zero looming (clamped at 0)", () => {
  let st = initSensingState();
  let r = sample(pose(8), world, 0.1, st, rt as any); st = r.state;
  r = sample(pose(7), world, 0.1, st, rt as any); // moved away from x=10 object? no — 7 is closer; use farther
  r = sample(pose(2), world, 0.1, r.state, rt as any);
  r = sample(pose(1), world, 0.1, r.state, rt as any); // now receding
  expect(r.stimulus[rt.input.looming]).toBeGreaterThanOrEqual(0);
});
```

- [ ] **Step 7: Run it, watch it fail** — `npx vitest run src/sensing/sensing.test.ts` → FAIL.

- [ ] **Step 8: Implement `sensing.ts`**

```ts
import type { Pose, WorldQuery, Vec3 } from "../body/types";
import { v, add, sub, scale, len, norm, cross } from "../body/types";
import type { RoleTable } from "../sim/roles";
import { rayAabb, nearestHit } from "./raycast";
import { CONFIG } from "../app/config";

export interface SensingState { loomTheta: number; prox: number; loom: number; }
export const initSensingState = (): SensingState => ({ loomTheta: 0, prox: 0, loom: 0 });

const onePole = (prev: number, x: number, dt: number, tau: number) => prev + (x - prev) * (1 - Math.exp(-dt / tau));

function aabbCenterRadius(b: WorldQuery["aabbs"][number]) {
  const c = scale(add(b.min, b.max), 0.5);
  const r = 0.5 * Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z);
  return { c, r };
}

export function sample(pose: Pose, world: WorldQuery, dt: number, prev: SensingState, rt: RoleTable) {
  const { EPS, PROX_MAX, LOOM_CONE_DEG, TAU_PROX, TAU_LOOM } = CONFIG.sensing;
  const right = norm(cross(pose.forward, pose.up));
  const dirs: Vec3[] = [pose.forward, scale(pose.forward, -1), pose.up, scale(pose.up, -1), right, scale(right, -1)];
  const boxes = [...world.aabbs, world.bounds];

  const minDist = nearestHit(pose.position, dirs, world.aabbs); // walls of `bounds` handled by soft-bounds, not startle
  const proxRaw = Math.min(PROX_MAX, 1 / Math.max(minDist === Infinity ? 1e6 : minDist, EPS));
  const prox = onePole(prev.prox, proxRaw, dt, TAU_PROX);

  const cosCone = Math.cos((LOOM_CONE_DEG * Math.PI) / 180);
  let theta = 0, bestDist = Infinity;
  for (const b of world.aabbs) {
    const { c, r } = aabbCenterRadius(b);
    const toC = sub(c, pose.position);
    const d = len(toC) || 1e-6;
    if (d < bestDist && (add(pose.position, scale(pose.forward, 0)), (toC.x * pose.forward.x + toC.y * pose.forward.y + toC.z * pose.forward.z) / d >= cosCone)) {
      bestDist = d;
      theta = 2 * Math.atan(r / Math.max(d, 1e-3));
    }
  }
  const loomRaw = Math.max(0, (theta - prev.loomTheta) / Math.max(dt, 1e-6));
  const loom = onePole(prev.loom, loomRaw, dt, TAU_LOOM);

  const stimulus = new Float32Array(rt.inputOrder.length);
  stimulus[rt.input.proximity] = prox;
  stimulus[rt.input.looming] = loom;
  return { stimulus, state: { loomTheta: theta, prox, loom } };
}
```
(If the inline cone test reads awkwardly to you, extract `const fwdDot = dot(norm(toC), pose.forward);` and gate on `fwdDot >= cosCone` — same behavior.)

- [ ] **Step 9: Run it, watch it pass** — `npx vitest run src/sensing` → PASS.

- [ ] **Step 10: Commit**

```bash
git add src/sensing src/body/types.ts
git commit -m "feat: sensing/ — ray-AABB, proximity, looming scalars"
```

---

## Task 8: `body/` part 1 — wrench mapping + rigid-body integration

**Files:**
- Create: `src/body/noise.ts`, `src/body/noise.test.ts`
- Create: `src/body/wrench.ts`, `src/body/wrench.test.ts`
- Create: `src/body/integrate.ts`, `src/body/integrate.test.ts`
- Create: `src/body/quat.ts`, `src/body/quat.test.ts`

**Interfaces:**
- Consumes: `src/body/types.ts` (Task 7); `CONFIG.physics`, `CONFIG.sim.seed`.
- Produces:
  - `quat.ts`: `qMul(a, b)`, `qNormalize(q)`, `qRotate(q, v)` (rotate a `Vec3`), `qIntegrate(q, angVel, dt)` (`normalize(q + 0.5*ω*q*dt)`), `qFromAxisAngle(axis, rad)`, `qIdentity()`.
  - `noise.ts`: `class ValueNoise { constructor(seed: number); at(channel: number, tSeconds: number): number }` — deterministic smooth noise in `[-1, 1]`, ~`CONFIG.physics.NOISE_HZ`.
  - `wrench.ts`: `interface Wrench { force: Vec3; torque: Vec3 }` (world frame); `interface EscapeState { armed: boolean; lockout: number }`; `initEscapeState()`; `mapReadouts(readouts: Readouts, pose: Pose, esc: EscapeState, dt: number, noise: ValueNoise, tSeconds: number): { wrench: Wrench; esc: EscapeState; firedImpulse: Vec3 | null }`.
  - `integrate.ts`: `interface BodyState { position: Vec3; orientation: Quat; vel: Vec3; angVel: Vec3 }`; `integrate(s: BodyState, wrench: Wrench, impulse: Vec3 | null, dt: number): BodyState` — semi-implicit Euler + exponential drag + `qIntegrate`; `poseOf(s: BodyState): Pose`.

- [ ] **Step 1: Write the failing `quat` test**

`src/body/quat.test.ts`:
```ts
import { expect, test } from "vitest";
import { qIdentity, qMul, qNormalize, qRotate, qIntegrate, qFromAxisAngle } from "./quat";
import { v } from "./types";

test("identity rotates nothing", () => {
  const r = qRotate(qIdentity(), v(1, 2, 3));
  expect([r.x, r.y, r.z].map((n) => +n.toFixed(6))).toEqual([1, 2, 3]);
});
test("90° about +Y sends +X to -Z", () => {
  const q = qFromAxisAngle(v(0, 1, 0), Math.PI / 2);
  const r = qRotate(q, v(1, 0, 0));
  expect(r.x).toBeCloseTo(0); expect(r.z).toBeCloseTo(-1);
});
test("qIntegrate keeps the quaternion normalized over many steps", () => {
  let q = qIdentity();
  for (let i = 0; i < 5000; i++) q = qIntegrate(q, v(0.7, -1.3, 0.2), 0.016);
  expect(Math.hypot(q.x, q.y, q.z, q.w)).toBeCloseTo(1, 6);
});
```

- [ ] **Step 2: fail → implement `quat.ts` → pass**

Run to fail: `npx vitest run src/body/quat.test.ts`.
```ts
import type { Quat, Vec3 } from "./types";
export const qIdentity = (): Quat => ({ x: 0, y: 0, z: 0, w: 1 });
export const qNormalize = (q: Quat): Quat => {
  const l = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  return { x: q.x / l, y: q.y / l, z: q.z / l, w: q.w / l };
};
export const qMul = (a: Quat, b: Quat): Quat => ({
  w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
  y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
  z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
});
export const qFromAxisAngle = (axis: Vec3, rad: number): Quat => {
  const l = Math.hypot(axis.x, axis.y, axis.z) || 1;
  const s = Math.sin(rad / 2);
  return { x: (axis.x / l) * s, y: (axis.y / l) * s, z: (axis.z / l) * s, w: Math.cos(rad / 2) };
};
export const qRotate = (q: Quat, p: Vec3): Vec3 => {
  const t = qMul(qMul(q, { x: p.x, y: p.y, z: p.z, w: 0 }), { x: -q.x, y: -q.y, z: -q.z, w: q.w });
  return { x: t.x, y: t.y, z: t.z };
};
export const qIntegrate = (q: Quat, w: Vec3, dt: number): Quat => {
  const dq = qMul({ x: w.x, y: w.y, z: w.z, w: 0 }, q);
  return qNormalize({ x: q.x + 0.5 * dq.x * dt, y: q.y + 0.5 * dq.y * dt, z: q.z + 0.5 * dq.z * dt, w: q.w + 0.5 * dq.w * dt });
};
```
Run to pass: `npx vitest run src/body/quat.test.ts`.

- [ ] **Step 3: `noise.ts` — failing test → impl → pass**

`src/body/noise.test.ts`:
```ts
import { expect, test } from "vitest";
import { ValueNoise } from "./noise";

test("deterministic, bounded, smooth", () => {
  const a = new ValueNoise(123), b = new ValueNoise(123);
  const s1 = a.at(0, 1.234), s2 = b.at(0, 1.234);
  expect(s1).toBe(s2);
  for (let t = 0; t < 5; t += 0.05) expect(Math.abs(a.at(1, t))).toBeLessThanOrEqual(1);
  expect(Math.abs(a.at(0, 1.0) - a.at(0, 1.001))).toBeLessThan(0.05); // continuity
});
test("different channels decorrelate", () => {
  const n = new ValueNoise(7);
  expect(n.at(0, 2.0)).not.toBe(n.at(1, 2.0));
});
```
Impl `src/body/noise.ts` — hash-based value noise, cosine-interpolated between integer sample points at `NOISE_HZ`:
```ts
import { CONFIG } from "../app/config";
const hash = (x: number) => {
  let h = (x ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff; // [0,1)
};
export class ValueNoise {
  constructor(private seed: number) {}
  at(channel: number, tSeconds: number): number {
    const phase = tSeconds * CONFIG.physics.NOISE_HZ;
    const i = Math.floor(phase);
    const f = phase - i;
    const key = (n: number) => (this.seed * 2654435761 + channel * 40503 + n * 668265263) | 0;
    const a = hash(key(i)) * 2 - 1;
    const b = hash(key(i + 1)) * 2 - 1;
    const u = (1 - Math.cos(f * Math.PI)) * 0.5;
    return a + (b - a) * u;
  }
}
```

- [ ] **Step 4: `wrench.ts` — failing test**

`src/body/wrench.test.ts`:
```ts
import { expect, test } from "vitest";
import { mapReadouts, initEscapeState } from "./wrench";
import { ValueNoise } from "./noise";
import { qIdentity } from "./quat";
import { v, type Pose, type Readouts } from "./types";
import { CONFIG } from "../app/config";

const pose: Pose = { position: v(), orientation: qIdentity(), forward: v(1, 0, 0), up: v(0, 1, 0) };
const noNoise = { at: () => 0 } as unknown as ValueNoise;
const R = (o: Partial<Readouts>): Readouts => ({ wing_l: 0, wing_r: 0, thrust: 0, yaw_torque: 0, escape: 0, ...o });

test("hover: symmetric wing at HOVER_S cancels gravity in the vertical force", () => {
  const { wrench } = mapReadouts(R({ wing_l: CONFIG.physics.HOVER_S, wing_r: CONFIG.physics.HOVER_S }), pose, initEscapeState(), 0.016, noNoise, 0);
  expect(wrench.force.y).toBeCloseTo(CONFIG.physics.GRAVITY * CONFIG.physics.MASS, 3); // lift term == weight; net vs gravity handled in integrate
});
test("wing asymmetry produces roll + yaw of matching sign", () => {
  const { wrench } = mapReadouts(R({ wing_l: 1, wing_r: 0 }), pose, initEscapeState(), 0.016, noNoise, 0);
  expect(Math.sign(wrench.torque.x)).toBe(Math.sign(CONFIG.physics.ROLL_K));
  expect(wrench.torque.y).not.toBe(0);
});
test("escape rising past threshold fires exactly one impulse and starts a lockout", () => {
  let esc = initEscapeState();
  let r = mapReadouts(R({ escape: 0.9, thrust: 1 }), pose, esc, 0.016, noNoise, 0);
  expect(r.firedImpulse).not.toBeNull();
  esc = r.esc;
  // still held high next frame: no second impulse, thrust suppressed during lockout
  r = mapReadouts(R({ escape: 0.9, thrust: 1 }), pose, esc, 0.016, noNoise, 0.016);
  expect(r.firedImpulse).toBeNull();
  expect(r.wrench.force.x).toBeCloseTo(0, 5); // thrust ignored under lockout
});
test("escape must fall below TH - HYST before it can re-arm", () => {
  let esc = initEscapeState();
  esc = mapReadouts(R({ escape: 0.9 }), pose, esc, 0.5, noNoise, 0).esc; // fired; lockout will elapse with dt=0.5
  const partial = mapReadouts(R({ escape: CONFIG.physics.ESCAPE_TH - CONFIG.physics.ESCAPE_HYST / 2 }), pose, esc, 0.016, noNoise, 1).esc;
  const held = mapReadouts(R({ escape: 0.9 }), pose, partial, 0.016, noNoise, 1.1);
  expect(held.firedImpulse).toBeNull(); // never dropped far enough to re-arm
});
```

- [ ] **Step 5: fail → implement `wrench.ts` → pass**

```ts
import type { Pose, Vec3, Readouts } from "./types";
import { v, add, scale, norm, cross } from "./types";
import { CONFIG } from "../app/config";
import type { ValueNoise } from "./noise";

export interface Wrench { force: Vec3; torque: Vec3; }
export interface EscapeState { armed: boolean; lockout: number; }
export const initEscapeState = (): EscapeState => ({ armed: true, lockout: 0 });

const P = CONFIG.physics;

export function mapReadouts(
  readouts: Readouts, pose: Pose, esc: EscapeState, dt: number, noise: ValueNoise, tSeconds: number,
): { wrench: Wrench; esc: EscapeState; firedImpulse: Vec3 | null } {
  const n = (ch: number) => noise.at(ch, tSeconds) * P.NOISE_AMP;
  const wl = (readouts.wing_l ?? 0) + n(0);
  const wr = (readouts.wing_r ?? 0) + n(1);
  const thrust = (readouts.thrust ?? 0) + n(2);
  const yaw = (readouts.yaw_torque ?? 0) + n(3);
  const escape = readouts.escape ?? 0;

  let lockout = Math.max(0, esc.lockout - dt);
  let armed = esc.armed;
  let firedImpulse: Vec3 | null = null;

  if (armed && escape >= P.ESCAPE_TH) {
    firedImpulse = scale(norm(add(pose.up, pose.forward)), P.ESCAPE_IMPULSE);
    armed = false;
    lockout = P.ESCAPE_LOCKOUT_S;
  }
  if (!armed && escape < P.ESCAPE_TH - P.ESCAPE_HYST) armed = true;

  const underLockout = lockout > 0;
  const s = (wl + wr) / 2;
  const a = wl - wr;

  let force = v();
  let torque = v();
  if (!underLockout) {
    const lift = P.GRAVITY * P.MASS + P.LIFT_K * (s - P.HOVER_S);
    force = add(scale(pose.up, lift), scale(pose.forward, P.CRUISE_THRUST + P.THRUST_K * thrust));
    torque = add(scale(pose.forward, P.ROLL_K * a), scale(pose.up, P.YAW_A_K * a + P.YAW_K * yaw));
  }
  return { wrench: { force, torque }, esc: { armed, lockout }, firedImpulse };
}
```
Note the hover test asserts `force.y == GRAVITY*MASS` (the lift term alone). Net cancellation against gravity happens in `integrate` (Step 6), which subtracts `GRAVITY*MASS` as a separate world force — keep that split so Plan 03 can move the operating point into the brain.

- [ ] **Step 6: `integrate.ts` — failing test → impl → pass**

`src/body/integrate.test.ts`:
```ts
import { expect, test } from "vitest";
import { integrate, poseOf, type BodyState } from "./integrate";
import { qIdentity } from "./quat";
import { v } from "./types";
import { CONFIG } from "../app/config";

const rest = (): BodyState => ({ position: v(0, 5, 0), orientation: qIdentity(), vel: v(), angVel: v() });

test("no wrench: gravity pulls the body down", () => {
  let s = rest();
  for (let i = 0; i < 60; i++) s = integrate(s, { force: v(), torque: v() }, null, 1 / 60);
  expect(s.position.y).toBeLessThan(5);
});
test("lift == weight holds altitude", () => {
  let s = rest();
  const w = { force: v(0, CONFIG.physics.GRAVITY * CONFIG.physics.MASS, 0), torque: v() };
  for (let i = 0; i < 120; i++) s = integrate(s, w, null, 1 / 60);
  expect(s.position.y).toBeCloseTo(5, 1);
});
test("linear drag bleeds speed toward zero with no force", () => {
  let s: BodyState = { ...rest(), vel: v(10, 0, 0) };
  const s1 = integrate(s, { force: v(), torque: v() }, null, 0.1);
  const s2 = integrate(s1, { force: v(), torque: v() }, null, 0.1);
  expect(Math.abs(s2.vel.x)).toBeLessThan(Math.abs(s1.vel.x));
});
test("impulse changes velocity instantly", () => {
  const s = integrate(rest(), { force: v(), torque: v() }, v(0, 5, 0), 1 / 60);
  expect(s.vel.y).toBeGreaterThan(0);
});
test("poseOf exposes body axes in world space", () => {
  const p = poseOf(rest());
  expect(p.forward.x).toBeCloseTo(1);
  expect(p.up.y).toBeCloseTo(1);
});
```
Impl `src/body/integrate.ts`:
```ts
import type { Vec3, Quat, Pose } from "./types";
import { add, scale, v } from "./types";
import { qIntegrate, qRotate } from "./quat";
import { CONFIG } from "../app/config";
import type { Wrench } from "./wrench";

export interface BodyState { position: Vec3; orientation: Quat; vel: Vec3; angVel: Vec3; }
const P = CONFIG.physics;

export function integrate(s: BodyState, wrench: Wrench, impulse: Vec3 | null, dt: number): BodyState {
  const gravity = v(0, -P.GRAVITY * P.MASS, 0);
  let vel = add(s.vel, scale(add(wrench.force, gravity), dt / P.MASS));
  if (impulse) vel = add(vel, scale(impulse, 1 / P.MASS));
  vel = scale(vel, Math.exp(-P.LIN_DRAG * dt));
  const position = add(s.position, scale(vel, dt));

  let angVel = add(s.angVel, scale(wrench.torque, dt / P.INERTIA));
  angVel = scale(angVel, Math.exp(-P.ANG_DRAG * dt));
  const orientation = qIntegrate(s.orientation, angVel, dt);
  return { position, orientation, vel, angVel };
}

export function poseOf(s: BodyState): Pose {
  return {
    position: s.position, orientation: s.orientation,
    forward: qRotate(s.orientation, v(1, 0, 0)),
    up: qRotate(s.orientation, v(0, 1, 0)),
  };
}
```

- [ ] **Step 7: Commit**

```bash
git add src/body/quat.ts src/body/quat.test.ts src/body/noise.ts src/body/noise.test.ts src/body/wrench.ts src/body/wrench.test.ts src/body/integrate.ts src/body/integrate.test.ts
git commit -m "feat: body/ — quaternion math, seeded noise, readout→wrench, rigid-body integration"
```

---

## Task 9: `body/` part 2 — collision, soft bounds, `Body` orchestrator

**Files:**
- Create: `src/body/collision.ts`, `src/body/collision.test.ts`
- Create: `src/body/body.ts`, `src/body/body.test.ts`

**Interfaces:**
- Consumes: `integrate`, `poseOf`, `BodyState` (Task 8); `mapReadouts`, `EscapeState`, `Wrench` (Task 8); `ValueNoise` (Task 8); `WorldQuery`, `Readouts`, `Pose` (types); `CONFIG.physics`.
- Produces:
  - `collision.ts`: `resolveSphere(pos: Vec3, vel: Vec3, radius: number, world: WorldQuery): { position: Vec3; vel: Vec3; contact: boolean }` — least-penetration push-out vs each AABB and vs the inside faces of `bounds`; reflects the offending velocity component by `-BOUNCE`.
  - `body.ts`: `class Body { constructor(start: Vec3, headingRad: number); step(dt: number, readouts: Readouts, world: WorldQuery): { contact: boolean }; pose(): Pose; state(): Readonly<BodyState> }` — orchestrates noise → `mapReadouts` → soft-bounds force → `integrate` → `resolveSphere`. Owns `BodyState`, `EscapeState`, `ValueNoise`, and an internal seconds clock advanced by `dt`.

- [ ] **Step 1: Write the failing `collision` test**

`src/body/collision.test.ts`:
```ts
import { expect, test } from "vitest";
import { resolveSphere } from "./collision";
import { v, type WorldQuery } from "./types";

const world: WorldQuery = { aabbs: [{ min: v(-1, -1, -1), max: v(1, 1, 1) }], bounds: { min: v(-10, -10, -10), max: v(10, 10, 10) } };

test("a sphere overlapping the +X face is pushed out along +X and its x-velocity reflects", () => {
  const r = resolveSphere(v(1.1, 0, 0), v(-2, 0, 0), 0.3, world);
  expect(r.contact).toBe(true);
  expect(r.position.x).toBeGreaterThanOrEqual(1.3 - 1e-6);
  expect(r.vel.x).toBeGreaterThan(0); // was moving in, now bounced out
});
test("no overlap: unchanged, no contact", () => {
  const r = resolveSphere(v(5, 0, 0), v(-2, 0, 0), 0.3, world);
  expect(r.contact).toBe(false);
  expect(r.position).toEqual(v(5, 0, 0));
});
test("outside the world bounds is pulled back in", () => {
  const r = resolveSphere(v(10.5, 0, 0), v(1, 0, 0), 0.3, world);
  expect(r.contact).toBe(true);
  expect(r.position.x).toBeLessThanOrEqual(10 - 0.3 + 1e-6);
});
```

- [ ] **Step 2: fail → implement `collision.ts` → pass**

```ts
import type { Vec3, WorldQuery, Aabb } from "./types";
import { CONFIG } from "../app/config";

const AXES = ["x", "y", "z"] as const;

export function resolveSphere(pos: Vec3, vel: Vec3, radius: number, world: WorldQuery) {
  let p = { ...pos }, vv = { ...vel }, contact = false;

  for (const box of world.aabbs) {
    const exp: Aabb = {
      min: { x: box.min.x - radius, y: box.min.y - radius, z: box.min.z - radius },
      max: { x: box.max.x + radius, y: box.max.y + radius, z: box.max.z + radius },
    };
    if (p.x <= exp.min.x || p.x >= exp.max.x || p.y <= exp.min.y || p.y >= exp.max.y || p.z <= exp.min.z || p.z >= exp.max.z) continue;
    // inside the expanded box → penetrating; push out on least-penetration axis
    let bestAx: (typeof AXES)[number] = "x", bestPen = Infinity, bestDir = 1;
    for (const ax of AXES) {
      const penPos = exp.max[ax] - p[ax]; // distance to exit in +ax
      const penNeg = p[ax] - exp.min[ax];
      const [pen, dir] = penPos < penNeg ? [penPos, 1] : [penNeg, -1];
      if (pen < bestPen) { bestPen = pen; bestAx = ax; bestDir = dir; }
    }
    p[bestAx] += bestDir * bestPen;
    if (Math.sign(vv[bestAx]) === -bestDir) vv[bestAx] = -CONFIG.physics.BOUNCE * vv[bestAx];
    contact = true;
  }

  for (const ax of AXES) {
    const lo = world.bounds.min[ax] + radius, hi = world.bounds.max[ax] - radius;
    if (p[ax] < lo) { p[ax] = lo; if (vv[ax] < 0) vv[ax] = -CONFIG.physics.BOUNCE * vv[ax]; contact = true; }
    else if (p[ax] > hi) { p[ax] = hi; if (vv[ax] > 0) vv[ax] = -CONFIG.physics.BOUNCE * vv[ax]; contact = true; }
  }
  return { position: p, vel: vv, contact };
}
```

- [ ] **Step 3: Write the failing `Body` test**

`src/body/body.test.ts`:
```ts
import { expect, test } from "vitest";
import { Body } from "./body";
import { v, type WorldQuery, type Readouts } from "./types";

const world: WorldQuery = { aabbs: [], bounds: { min: v(-20, -20, -20), max: v(20, 20, 20) } };
const hoverR = (): Readouts => ({ wing_l: 0, wing_r: 0, thrust: 0, yaw_torque: 0, escape: 0 });

test("with hover readouts the fly holds altitude within a small band", () => {
  const b = new Body(v(0, 5, 0), 0);
  for (let i = 0; i < 300; i++) b.step(1 / 60, hoverR(), world);
  expect(Math.abs(b.pose().position.y - 5)).toBeLessThan(1.5);
});
test("deterministic: same seed + same inputs → same trajectory", () => {
  const run = () => { const b = new Body(v(0, 5, 0), 0); for (let i = 0; i < 200; i++) b.step(1 / 60, hoverR(), world); return b.pose().position; };
  expect(run()).toEqual(run());
});
test("escape readout throws the fly upward", () => {
  const b = new Body(v(0, 5, 0), 0);
  const y0 = b.pose().position.y;
  b.step(1 / 60, { ...hoverR(), escape: 0.95 }, world);
  for (let i = 0; i < 20; i++) b.step(1 / 60, hoverR(), world);
  expect(b.pose().position.y).toBeGreaterThan(y0);
});
test("cruise carries the fly forward (+X) over time", () => {
  const b = new Body(v(0, 5, 0), 0);
  for (let i = 0; i < 120; i++) b.step(1 / 60, hoverR(), world);
  expect(b.pose().position.x).toBeGreaterThan(0.2);
});
```

- [ ] **Step 4: fail → implement `body.ts` → pass**

```ts
import type { Vec3, Pose, WorldQuery, Readouts } from "./types";
import { v, add, scale } from "./types";
import { qFromAxisAngle } from "./quat";
import { ValueNoise } from "./noise";
import { mapReadouts, initEscapeState, type EscapeState } from "./wrench";
import { integrate, poseOf, type BodyState } from "./integrate";
import { resolveSphere } from "./collision";
import { CONFIG } from "../app/config";

const P = CONFIG.physics;

export class Body {
  private s: BodyState;
  private esc: EscapeState = initEscapeState();
  private noise = new ValueNoise(CONFIG.sim.seed);
  private t = 0;

  constructor(start: Vec3, headingRad: number) {
    this.s = { position: { ...start }, orientation: qFromAxisAngle(v(0, 1, 0), headingRad), vel: v(), angVel: v() };
  }

  step(dt: number, readouts: Readouts, world: WorldQuery): { contact: boolean } {
    this.t += dt;
    const pose = poseOf(this.s);
    const m = mapReadouts(readouts, pose, this.esc, dt, this.noise, this.t);
    this.esc = m.esc;

    // soft bounds: spring + damping back toward the volume, per axis
    let bounds = v();
    for (const ax of ["x", "y", "z"] as const) {
      const over = this.s.position[ax] < world.bounds.min[ax] ? this.s.position[ax] - world.bounds.min[ax]
        : this.s.position[ax] > world.bounds.max[ax] ? this.s.position[ax] - world.bounds.max[ax] : 0;
      if (over !== 0) bounds[ax] = -P.BOUNDS_K * over - P.BOUNDS_C * this.s.vel[ax];
    }
    const wrench = { force: add(m.wrench.force, bounds), torque: m.wrench.torque };

    this.s = integrate(this.s, wrench, m.firedImpulse, dt);
    const c = resolveSphere(this.s.position, this.s.vel, P.FLY_R, world);
    this.s = { ...this.s, position: c.position, vel: c.vel };
    return { contact: c.contact };
  }

  pose(): Pose { return poseOf(this.s); }
  state(): Readonly<BodyState> { return this.s; }
}
```

- [ ] **Step 5: Commit**

```bash
git add src/body/collision.ts src/body/collision.test.ts src/body/body.ts src/body/body.test.ts
git commit -m "feat: body/ — sphere-AABB collision, soft bounds, Body orchestrator"
```

---

## Task 10: `viz/` geometry + palette + `scene.config.ts` + builders (+ resolve `three` under node)

**Files:**
- Create: `src/scene.config.ts` (scene data + `SceneConfig`/`SceneObject`/`SceneLight` types — no `three`, only `Vec3`/`Aabb` from `body/types.ts`)
- Create: `src/viz/palette.ts`
- Create: `src/viz/geometry.ts`, `src/viz/geometry.test.ts` (pure, `three`-free math)
- Create: `src/viz/brain-material.ts` (the `THREE.ShaderMaterial` for the point cloud)
- Create: `src/viz/builders.ts` (thin `three` wrappers; **not** imported by any `.test.ts` unless Step 1 proves `three` loads under node)

> **Preflight ruling carried in:** `brain-material.ts` and `scene.config.ts` moved here from Tasks 11/12 so `builders.ts` (which imports both) and its `tsc` gate are satisfied at this task's boundary. Task 11 no longer creates `brain-material.ts`; Task 12 no longer creates `scene.config.ts`.

**Interfaces:**
- Consumes: `NeuronsFile` / `GraphFile` (Plan 01 `src/formats`); `Vec3` / `Aabb` (`src/body/types.ts`, Task 7); `CONFIG.aesthetic`; `PALETTE`.
- Produces:
  - `scene.config.ts`: `interface SceneObject { kind: "box" | "sphere" | "torus"; position: Vec3; rotation: Vec3; scale: Vec3; material: string }`; `interface SceneLight { position: Vec3; color: number; intensity: number }`; `interface SceneConfig { bounds: Aabb; objects: SceneObject[]; lights: SceneLight[]; fly: { start: Vec3; heading: number } }`; `export const SCENE: SceneConfig`.
  - `geometry.ts` (pure): `brainPositions(neurons: NeuronsFile, scaleFactor: number): Float32Array` (`count*3`); `coreFlags(neurons: NeuronsFile): Float32Array` (`count`, 1 for core); `coreEdgePairs(graph: GraphFile, coreCount: number): Float32Array` (endpoint index pairs flattened, only `src<coreCount && dst<coreCount`, each edge once); `activityColour(t: number): [number, number, number]` (0→cold, 1→hot, linear in a perceptually-ok ramp; monotone per channel toward hot).
  - `palette.ts`: `PALETTE` (named hex numbers: `bg, pointCold, pointHot, coreTint, edge, clay, sage, ochre, flyBody, flyAccent, ground, bounds`); `material(key: string): THREE.MeshStandardMaterial` (`roughness 0.9, metalness 0, flatShading true`); `material` is the only `three`-touching export here.
  - `brain-material.ts`: `makeBrainMaterial(): THREE.ShaderMaterial` — attributes `aCore`, `aActivity`; uniforms `uBaseSize, uCoreSize, uSwell, uScale, uCold, uHot` defaulted from `CONFIG.aesthetic` + `PALETTE.pointCold/pointHot` (as `THREE.Color`); `transparent: true`, `blending: THREE.AdditiveBlending`, `depthWrite: false`. Vertex: `gl_PointSize = (aCore > 0.5 ? uCoreSize : uBaseSize) * (1.0 + uSwell * aActivity) * (uScale / -mvPosition.z);`. Fragment: `if (length(gl_PointCoord - 0.5) > 0.5) discard;` then `gl_FragColor = vec4(mix(uCold, uHot, aActivity), 1.0);`.
  - `builders.ts`: `buildBrainPoints(neurons: NeuronsFile, scaleFactor: number): THREE.Points` (geometry from `geometry.ts` as `BufferAttribute`s + `makeBrainMaterial()`), `buildCoreEdges(graph: GraphFile, coreCount: number): THREE.LineSegments`, `buildWorld(scene: SceneConfig): THREE.Group` — iterates `scene.objects` → `Box/Sphere/TorusGeometry` + `material(key)`, `scene.lights` → `THREE.PointLight` + a small emissive marker `Mesh`, adds one warm `DirectionalLight` + a `HemisphereLight`.

- [ ] **Step 1: Probe — does `three` import under vitest node?**

Create a throwaway `src/viz/_probe.test.ts`:
```ts
import { test } from "vitest";
test("three imports under node", async () => { await import("three"); });
```
Run: `npx vitest run src/viz/_probe.test.ts`.
- **If PASS:** delete the probe; `builders.ts` may be imported by `builders.test.ts` (add mesh/light-count assertions there).
- **If FAIL** (touches `window`/`document`): delete the probe; keep all `three` usage out of tests. `builders.ts` stays untested (covered by the manual checklist); `geometry.ts` carries every assertion. Proceed either way with Steps 2–5.

- [ ] **Step 2: Write the failing `geometry` test**

`src/viz/geometry.test.ts`:
```ts
import { expect, test } from "vitest";
import { parseNeurons } from "../formats/neurons";
import { parseGraph } from "../formats/graph";
import { fixtureBuf } from "../formats/fixture";
import { brainPositions, coreFlags, coreEdgePairs, activityColour } from "./geometry";

const n = parseNeurons(fixtureBuf("neurons.bin"));
const g = parseGraph(fixtureBuf("graph.bin"));

test("brainPositions is count*3 finite floats, scaled", () => {
  const p = brainPositions(n, 2);
  expect(p.length).toBe(n.count * 3);
  expect([...p].every(Number.isFinite)).toBe(true);
  expect(p[0]).toBeCloseTo(n.pos[0]! * 2);
});
test("coreFlags marks exactly coreCount neurons", () => {
  const f = coreFlags(n);
  expect(f.length).toBe(n.count);
  expect([...f].reduce((a, b) => a + b, 0)).toBe(n.coreCount);
});
test("coreEdgePairs are all core-core and even-length", () => {
  const e = coreEdgePairs(g, n.coreCount);
  expect(e.length % 2).toBe(0);
  for (const idx of e) expect(idx).toBeLessThan(n.coreCount);
});
test("activityColour ramps cold→hot monotonically", () => {
  const [r0, gr0, b0] = activityColour(0);
  const [r1, gr1, b1] = activityColour(1);
  expect(r1).toBeGreaterThanOrEqual(r0);
  expect(r1 + gr1 + b1).toBeGreaterThan(r0 + gr0 + b0); // hot is brighter
});
```

- [ ] **Step 3: fail → implement `geometry.ts` → pass**

```ts
import type { NeuronsFile } from "../formats/neurons";
import type { GraphFile } from "../formats/graph";
import { isCore } from "../formats/neurons";
import { row } from "../formats/graph";

export function brainPositions(n: NeuronsFile, scaleFactor: number): Float32Array {
  const out = new Float32Array(n.count * 3);
  for (let i = 0; i < out.length; i++) out[i] = n.pos[i]! * scaleFactor;
  return out;
}
export function coreFlags(n: NeuronsFile): Float32Array {
  const out = new Float32Array(n.count);
  for (let i = 0; i < n.count; i++) out[i] = isCore(n, i) ? 1 : 0;
  return out;
}
export function coreEdgePairs(g: GraphFile, coreCount: number): Float32Array {
  const pairs: number[] = [];
  for (let s = 0; s < coreCount; s++) for (const [t] of row(g, s)) if (t < coreCount) pairs.push(s, t);
  return Float32Array.from(pairs);
}
export function activityColour(t: number): [number, number, number] {
  const c = Math.max(0, Math.min(1, t));
  // cold #1b1e2b → amber #d98a1f → near-white #fdf0d5
  const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
  if (c < 0.6) {
    const u = c / 0.6;
    return [lerp(0.106, 0.851, u), lerp(0.118, 0.541, u), lerp(0.169, 0.122, u)];
  }
  const u = (c - 0.6) / 0.4;
  return [lerp(0.851, 0.992, u), lerp(0.541, 0.941, u), lerp(0.122, 0.835, u)];
}
```

- [ ] **Step 4: Write `palette.ts` + `builders.ts`**

`palette.ts`:
```ts
import * as THREE from "three";
export const PALETTE = {
  bg: 0xece4d6, pointCold: 0x1b1e2b, pointHot: 0xfdf0d5, coreTint: 0xd98a1f, edge: 0x8c7a5c,
  clay: 0xb5643c, sage: 0x7f8c63, ochre: 0xc9a44a, flyBody: 0x2b2b2b, flyAccent: 0xd98a1f,
  ground: 0xdcd2be, bounds: 0xbdb199,
} as const;
const MAT: Record<string, number> = { clay: PALETTE.clay, sage: PALETTE.sage, ochre: PALETTE.ochre };
export function material(key: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: MAT[key] ?? PALETTE.clay, roughness: 0.9, metalness: 0, flatShading: true });
}
```
`brain-material.ts` — `makeBrainMaterial()` per the Interfaces block (inline GLSL strings, uniforms from `CONFIG.aesthetic` + `PALETTE`).

`builders.ts` — `buildBrainPoints` / `buildCoreEdges` use `geometry.ts` outputs as `THREE.BufferAttribute`s; `buildBrainPoints` calls `makeBrainMaterial()` from `./brain-material`. `buildWorld(scene: SceneConfig)` (import the type from `../scene.config`) iterates `scene.objects` → `BoxGeometry|SphereGeometry|TorusGeometry` + `material(key)`, `scene.lights` → `THREE.PointLight` + a small emissive `Mesh` marker, adds one warm `DirectionalLight` + a `HemisphereLight`.

- [ ] **Step 5: Write `src/scene.config.ts`**

Types per the Interfaces block, then `export const SCENE: SceneConfig` — a small scene: `bounds ≈ { min: v(-16, 0, -16), max: v(16, 14, 16) }`; `fly: { start: v(0, 4, 0), heading: 0 }` (faces +X); `objects`: a `box` at `v(9, 4, 0)` scale `v(1.2, 1.2, 1.2)` `material: "clay"` **squarely on the +X cruise path** (the escape trigger); a `torus` at `v(3, 3, -5)` scale `v(1, 0.35, 1)` `material: "sage"`; a `sphere` at `v(-4, 6, 4)` scale `v(1, 1, 1)` `material: "ochre"`. `lights`: `{ position: v(6, 10, 6), color: 0xfff1d0, intensity: 60 }`, `{ position: v(-8, 7, -6), color: 0xcfe0ff, intensity: 35 }`. Import `v` from `./body/types`.

- [ ] **Step 6: Green + commit**

Run: `npx tsc --noEmit && npx vitest run src/viz`
Expected: `geometry` tests PASS; typecheck clean (the `_probe` from Step 1 already deleted). If `three` failed the probe, `builders.ts` / `brain-material.ts` still typecheck (they are not imported by any test) — they are covered by the manual checklist.
```bash
git add src/viz src/scene.config.ts
git commit -m "feat: viz/ geometry math, palette, brain shader, scene config + builders"
```

---

## Task 11: `viz/renderer.ts` + `fly.ts` + `follow-camera.ts`

**Files:**
- Create: `src/viz/follow-camera.ts`, `src/viz/follow-camera.test.ts`
- Create: `src/viz/fly.ts`, `src/viz/fly.test.ts` (only the pure `flapFrequency`; the mesh build is manual-checklist)
- Create: `src/viz/renderer.ts`

> **Preflight ruling carried in:** `brain-material.ts` was moved to Task 10 (it is imported by Task 10's `builders.ts`). This task does not create it.

**Interfaces:**
- Consumes: `Pose`, `Vec3` (types); `qRotate` (`src/body/quat.ts`, Task 8); `CONFIG.camera`, `CONFIG.aesthetic`; `PALETTE` (Task 10).
- Produces:
  - `follow-camera.ts` (pure): `updateFollowCamera(camPos: Vec3, pose: Pose, dt: number): { position: Vec3; lookAt: Vec3 }` — overshoot-free exponential approach (`e = exp(-omega·dt)`, factor `e·(1 + omega·dt)`) toward `pose.position + qRotate(pose.orientation, OFFSET)`; `lookAt = pose.position + pose.forward · LOOKAHEAD`.
  - `fly.ts`: `flapFrequency(readouts: { wing_l: number; wing_r: number }): number` (Hz, in `[FLAP_MIN, FLAP_MAX]`); `class Fly { object3d: THREE.Group; update(readouts: Readouts, pose: Pose, dt: number): void }`.
  - `renderer.ts`: `createRenderer(canvas: HTMLCanvasElement): { scene: THREE.Scene; camera: THREE.PerspectiveCamera; render(): void; resize(w, h): void; three: typeof THREE }` — **module has no side effects at import**; nothing here runs under vitest.

- [ ] **Step 1: Write the failing `follow-camera` test**

`src/viz/follow-camera.test.ts`:
```ts
import { expect, test } from "vitest";
import { updateFollowCamera } from "./follow-camera";
import { v, type Pose } from "../body/types";
import { qIdentity } from "../body/quat";

const pose: Pose = { position: v(0, 0, 0), orientation: qIdentity(), forward: v(1, 0, 0), up: v(0, 1, 0) };

test("camera converges toward the offset target and stops (no overshoot — diff only shrinks)", () => {
  let cam = v(0, 0, 0);
  let prevDiff = Infinity;
  const targetX = -3.2; // OFFSET.x rotated by identity
  for (let i = 0; i < 800; i++) {
    const r = updateFollowCamera(cam, pose, 1 / 60);
    const diff = Math.hypot(r.position.x - targetX, r.position.y - 1.4, r.position.z - 0);
    expect(diff).toBeLessThanOrEqual(prevDiff + 1e-9); // monotone decrease, never overshoots
    prevDiff = diff;
    cam = r.position;
  }
  const settled = updateFollowCamera(cam, pose, 1 / 60);
  const d = Math.hypot(settled.position.x - cam.x, settled.position.y - cam.y, settled.position.z - cam.z);
  expect(d).toBeLessThan(5e-3); // effectively at rest after 800 steps at omega=14
  expect(settled.lookAt.x).toBeCloseTo(pose.position.x + pose.forward.x * 2.5); // LOOKAHEAD
});
test("lookAt leads the fly along its forward axis", () => {
  const r = updateFollowCamera(v(-5, 2, 0), pose, 1 / 60);
  expect(r.lookAt.x).toBeGreaterThan(pose.position.x);
});
```

- [ ] **Step 2: fail → implement `follow-camera.ts` → pass**

```ts
import type { Vec3, Pose } from "../body/types";
import { add, sub, scale } from "../body/types";
import { qRotate } from "../body/quat";
import { CONFIG } from "../app/config";

export function updateFollowCamera(camPos: Vec3, pose: Pose, dt: number): { position: Vec3; lookAt: Vec3 } {
  const o = CONFIG.camera.OFFSET;
  const target = add(pose.position, qRotate(pose.orientation, { x: o.x, y: o.y, z: o.z }));
  // critically damped spring toward target (analytic step, zeta = 1)
  const w = CONFIG.camera.omega;
  const e = Math.exp(-w * dt);
  const diff = sub(camPos, target);
  const position = add(target, scale(diff, e * (1 + w * dt)));
  const lookAt = add(pose.position, scale(pose.forward, CONFIG.camera.LOOKAHEAD));
  return { position, lookAt };
}
```
(`FLAP_MIN`/`FLAP_MAX`/`FLAP_AMP` and `camera.omega = 14` are already in `CONFIG` from Task 1.)

- [ ] **Step 3: `fly.ts` failing test → impl**

`src/viz/fly.test.ts`:
```ts
import { expect, test } from "vitest";
import { flapFrequency } from "./fly";
import { CONFIG } from "../app/config";

test("flap frequency scales with mean wing readout and stays in range", () => {
  expect(flapFrequency({ wing_l: 0, wing_r: 0 })).toBeCloseTo(CONFIG.aesthetic.FLAP_MIN);
  expect(flapFrequency({ wing_l: 1, wing_r: 1 })).toBeCloseTo(CONFIG.aesthetic.FLAP_MAX);
  const mid = flapFrequency({ wing_l: 0.5, wing_r: 0.5 });
  expect(mid).toBeGreaterThan(CONFIG.aesthetic.FLAP_MIN);
  expect(mid).toBeLessThan(CONFIG.aesthetic.FLAP_MAX);
  expect(flapFrequency({ wing_l: 9, wing_r: 9 })).toBeLessThanOrEqual(CONFIG.aesthetic.FLAP_MAX); // clamped
});
```
`fly.ts` — `flapFrequency` = `lerp(FLAP_MIN, FLAP_MAX, clamp01((wing_l + wing_r) / 2))`. `class Fly` builds the `THREE.Group` (thorax/abdomen `SphereGeometry` scaled, head sphere, two `PlaneGeometry` wings pivoted at the root); `update` sets wing rotation `= CONFIG.aesthetic.FLAP_AMP * sin(elapsed * 2π * flapFrequency(readouts))`, applies `pose.position` / `pose.orientation` to the group, adds a small pitch from `readouts.thrust`. (`FLAP_*` already in `CONFIG` from Task 1.)

- [ ] **Step 4: `fly.ts` `class Fly` + `renderer.ts`** (no tests — manual checklist)

`class Fly` — builds the `THREE.Group` (thorax/abdomen `SphereGeometry` scaled, head sphere, two `PlaneGeometry` wings pivoted at the root, `material` from `PALETTE.flyBody`/`flyAccent`, wings `transparent` low opacity). `update(readouts, pose, dt)`: advance an internal `elapsed += dt`; wing rotation `= CONFIG.aesthetic.FLAP_AMP * Math.sin(elapsed * 2π * flapFrequency(readouts))` (mirror on the two wings); set `group.position` from `pose.position`, `group.quaternion` from `pose.orientation`; add a small pitch from `readouts.thrust`.

`renderer.ts` — `createRenderer(canvas)`: `new THREE.WebGLRenderer({ canvas, antialias: true })`, `outputColorSpace = THREE.SRGBColorSpace`, `scene.background = new THREE.Color(PALETTE.bg)`, optional `scene.fog`, a `PerspectiveCamera`; `render()` = `renderer.render(scene, camera)`; `resize(w,h)` updates renderer size + camera aspect. Nothing at module scope constructs anything.

- [ ] **Step 5: Green + commit**

Run: `npx tsc --noEmit && npx vitest run src/viz`
Expected: `follow-camera`, `fly` tests PASS (plus `geometry` from Task 10); typecheck clean.
```bash
git add src/viz
git commit -m "feat: viz/ — procedural fly, follow camera, renderer shell"
```

---

## Task 12: `app/loop.ts` + `app/world-query.ts` + `main.ts` + `index.html`

**Files:**
- Create: `src/app/loop.ts`, `src/app/loop.test.ts`
- Create: `src/app/world-query.ts`, `src/app/world-query.test.ts`
- Rewrite: `src/main.ts`, `index.html`

> **Preflight ruling carried in:** `src/scene.config.ts` was created in Task 10. This task consumes `SCENE` / `SceneConfig` from it and does not modify it. Do not touch `src/viz/builders.ts` here — it is complete as of Task 10; if integration reveals a real gap in it, fix it and note it in the report.

**Interfaces:**
- Consumes: `SimBridge` + `createSimBridge` (Tasks 4–5); `Body` (Task 9); `sensing.sample` (Task 7); `RoleTable` (Task 2); `WorldQuery` / `Readouts` / `Pose` (`body/types.ts`); `SCENE` / `SceneConfig` (`src/scene.config.ts`, Task 10); `buildBrainPoints` / `buildCoreEdges` / `buildWorld` (Task 10); `createRenderer` / `Fly` / `updateFollowCamera` (Task 11); `activityColour` (Task 10); `CONFIG`.
- Produces:
  - `world-query.ts`: `worldQuery(scene: SceneConfig): WorldQuery` — converts each `SceneObject` to a world AABB (box/sphere/torus → axis-aligned bounding box from `position` ± half-extents; torus outer radius = `scale.x + scale.z`).
  - `loop.ts`: `class Loop { constructor(deps: LoopDeps); frameOnce(nowMs: number): void; start(): void; stop(): void }` where `LoopDeps = { bridge: SimBridge; body: Body; sensing: { sample: typeof import("../sensing/sensing").sample }; roleTable: RoleTable; world: WorldQuery; onFrame(view: FrameView): void }` and `FrameView = { pose: Pose; readouts: Readouts; activity: Float32Array; simHz: number }`. `frameOnce`: compute `dt` (clamp to `CONFIG.loop.MAX_FRAME_DT`), `sensing.sample` → add pending `contact` startle to the `proximity` slot → `bridge.setStimulus` → `bridge.readState` → build `Readouts` view from `readouts` + `roleTable.readoutOrder` → `body.step` (stash `contact` for next frame) → `onFrame`.

- [ ] **Step 1: `world-query.ts` failing test → impl**

`src/app/world-query.test.ts`:
```ts
import { expect, test } from "vitest";
import { worldQuery } from "./world-query";
import { v } from "../body/types";
import type { SceneConfig } from "../scene.config";

const scene: SceneConfig = {
  bounds: { min: v(-10, 0, -10), max: v(10, 10, 10) },
  objects: [{ kind: "box", position: v(3, 1, 0), rotation: v(), scale: v(1, 1, 1), material: "clay" }],
  lights: [], fly: { start: v(0, 2, 0), heading: 0 },
};

test("box object → an AABB centered on its position", () => {
  const wq = worldQuery(scene);
  expect(wq.aabbs).toHaveLength(1);
  expect(wq.aabbs[0]!.min).toEqual(v(2, 0, -1));
  expect(wq.aabbs[0]!.max).toEqual(v(4, 2, 1));
  expect(wq.bounds).toEqual(scene.bounds);
});
```
Impl: half-extents = `scale` for `box`; `v(scale.x, scale.x, scale.x)` for `sphere`; `v(scale.x + scale.z, scale.z, scale.x + scale.z)` for `torus`. AABB = `position ± halfExtents`. (`scene.config.ts` already exists from Task 10 — just `import type { SceneConfig } from "../scene.config"`.)

- [ ] **Step 2: `loop.ts` failing test**

`src/app/loop.test.ts`:
```ts
import { expect, test } from "vitest";
import { Loop } from "./loop";
import { Body } from "../body/body";
import { v } from "../body/types";
import * as sensing from "../sensing/sensing";

function fakeBridge() {
  const state = { readouts: new Float32Array(5), activity: new Float32Array(8), simHz: 200, tick: 0 };
  const stim: Float32Array[] = [];
  return {
    obj: {
      init: async () => ({ nNeurons: 0, coreCount: 0, roleTable: rt }),
      setStimulus: (x: Float32Array) => stim.push(x.slice()),
      readState: () => state, setActiveCount() {}, setParams() {}, pause() {}, resume() {}, reset() {}, dispose() {},
    },
    stim, state,
  };
}
const rt = { input: { light_l: 0, light_r: 1, looming: 2, proximity: 3, wind_l: 4, wind_r: 5 }, readout: { escape: 0, thrust: 1, wing_l: 2, wing_r: 3, yaw_torque: 4 },
  inputOrder: ["light_l", "light_r", "looming", "proximity", "wind_l", "wind_r"], readoutOrder: ["escape", "thrust", "wing_l", "wing_r", "yaw_torque"] };
const world = { aabbs: [], bounds: { min: v(-20, 0, -20), max: v(20, 20, 20) } };

test("frameOnce feeds sensing→bridge and builds a named Readouts view for the body", () => {
  const fb = fakeBridge();
  fb.state.readouts[rt.readout.wing_l] = 0.3;
  let seen: any;
  const loop = new Loop({ bridge: fb.obj as any, body: new Body(v(0, 4, 0), 0), sensing, roleTable: rt, world,
    onFrame: (fv) => (seen = fv) });
  loop.frameOnce(0);   // first call only seeds the clock — no pipeline, no push
  loop.frameOnce(16);
  loop.frameOnce(32);
  expect(fb.stim.length).toBe(2);           // two real frames
  expect(fb.stim[1]!.length).toBe(6);       // stimulus vector = nInputRoles
  expect(seen.readouts.wing_l).toBe(0.3);   // Float32Array → named view
  expect(seen.pose.position).toBeDefined();
});

test("dt is clamped so a long stall cannot tunnel", () => {
  const fb = fakeBridge();
  const body = new Body(v(0, 4, 0), 0);
  const loop = new Loop({ bridge: fb.obj as any, body, sensing, roleTable: rt, world, onFrame: () => {} });
  loop.frameOnce(0);
  loop.frameOnce(10_000); // 10s stall
  expect(Number.isFinite(body.pose().position.y)).toBe(true);
  expect(Math.abs(body.pose().position.y)).toBeLessThan(1e4);
});

test("a collision this frame adds a proximity startle to next frame's stimulus", () => {
  const fb = fakeBridge();
  const wallWorld = { aabbs: [{ min: v(-1, 0, -1), max: v(1, 8, 1) }], bounds: world.bounds };
  const loop = new Loop({ bridge: fb.obj as any, body: new Body(v(0.5, 4, 0), 0), sensing, roleTable: rt, world: wallWorld, onFrame: () => {} });
  loop.frameOnce(0);
  loop.frameOnce(16); // body starts inside the wall → contact
  loop.frameOnce(32);
  const prox = fb.stim[fb.stim.length - 1]![rt.input.proximity]!;
  expect(prox).toBeGreaterThan(0);
});
```

- [ ] **Step 4: fail → implement `loop.ts` → pass**

Key points the impl must honor: `dt = Math.min((now - last) / 1000, CONFIG.loop.MAX_FRAME_DT)`; first `frameOnce` just seeds `last` and returns; `pendingStartle` (number) is added to `stimulus[roleTable.input.proximity]` **before** `setStimulus`, then zeroed; after `body.step`, `if (contact) pendingStartle = CONFIG.physics.CONTACT_STARTLE`; `Readouts` view = `Object.fromEntries(roleTable.readoutOrder.map((name, i) => [name, readouts[i] ?? 0]))`.

- [ ] **Step 5: `main.ts` + `index.html`** (no unit test — manual)

`index.html`: a full-viewport `<canvas id="view">` + a small `<div id="hud">` (monospace, absolute top-left). `src/main.ts`:
1. `fetch` the three fixture assets (`/pipeline/out/fixture/...` served by Vite as static — add `publicDir` or import via `?url`; simplest: `import neuronsUrl from "../pipeline/out/fixture/neurons.bin?url"` etc.) → `ArrayBuffer`s.
2. `bridge = createSimBridge(() => new Worker(new URL("./bridge/sim.worker.ts", import.meta.url), { type: "module" }))`.
3. `await bridge.init({ neurons, graph, groups }, { seed: CONFIG.sim.seed, snapMax: CONFIG.sim.snapMax })`.
4. Build `renderer`, `brain` points (`buildBrainPoints`), `core edges`, `world` (`buildWorld(SCENE)`), `Fly`; add to scene.
5. `body = new Body(SCENE.fly.start, SCENE.fly.heading)`; `world = worldQuery(SCENE)`.
6. `loop = new Loop({ bridge, body, sensing, roleTable, world, onFrame })` where `onFrame` writes `activity` into the brain geometry attribute, calls `fly.update`, steps the follow camera, updates the HUD text (`simHz`, FPS), and calls `renderer.render()`.
7. `requestAnimationFrame` pump calling `loop.frameOnce(performance.now())`.
8. `bridge.setActiveCount(nNeurons)` (fixture: run the whole cloud).

- [ ] **Step 6: Green + manual smoke**

Run: `npx tsc --noEmit && npx vitest run && yarn build`
Expected: all unit tests PASS; production build succeeds.
Run: `yarn dev`, open the browser. Expected: point cloud visible and pulsing; fly cruises +X; on nearing the `(9,4,0)` block the fly jerks up and away; no console errors; `crossOriginIsolated` is `true` (check the console) so the SAB transport is active.

- [ ] **Step 7: Commit**

```bash
git add src/app/loop.ts src/app/loop.test.ts src/app/world-query.ts src/app/world-query.test.ts src/main.ts index.html
git commit -m "feat: RAF loop, world query, boot — the fly flies on the fixture"
```

---

## Task 13: Tuning pass, manual checklist, docs, full green

**Files:**
- Modify: `src/app/config.ts` (tuned constants), `src/scene.config.ts` (object placement) as needed
- Modify: `docs/manual-checklist.md`, `docs/architecture.md`, `README.md`

**Interfaces:** none.

- [ ] **Step 1: Tune against the demo**

With `yarn dev` running, adjust **only** `CONFIG` / `SCENE` numbers (no logic) until all six checks below pass. Likely dials: `CRUISE_THRUST`, `LIFT_K`, `LIN_DRAG`/`ANG_DRAG` (stability), `sensing.LOOM_CONE_DEG` + `TAU_LOOM` + `ESCAPE_TH` (escape timing), `ESCAPE_IMPULSE` + `ESCAPE_LOCKOUT_S` (how dramatic the veer is), `camera.OFFSET`/`omega` (framing), the `(9,4,0)` block position. Re-run `npx vitest run` after — if a `body/` test now fails because a constant moved, update the test's expected number to match the new constant (the test asserts *behavior*, e.g. "holds altitude within a band"; only band edges tied to constants should move).

- [ ] **Step 2: Fill `docs/manual-checklist.md`**

Replace the stub with the Plan 02 results (tick each, note the observed behavior):
```md
# Manual verification checklist

## Plan 02 — minimal brain→fly loop (verified <date>, commit <sha>)

- [x] Fly hovers with no drift-to-ground at rest readouts (holds altitude ±<N> m over 10 s).
- [x] Fly cruises +X and the block at (9,4,0) triggers a giant-fiber escape burst + veer-away.
- [x] Point cloud visibly pulses — activity colour shifts cold→hot during the burst.
- [x] Core edges light along the looming→escape path during the burst.
- [x] Follow camera tracks smoothly, no jitter or overshoot.
- [x] Runs under SAB (crossOriginIsolated true via `yarn dev`) AND under postMessage
      (comment out the `server.headers` in `vite.config.ts`, reload) — same behavior.

## Plan 02b / 03 — filled later
- [ ] Neuron-count slider visibly changes reported sim Hz.
- [ ] A one-sided light induces a sustained turn toward / away from it.
```

- [ ] **Step 3: Sync `docs/architecture.md` + `README.md`**

`architecture.md`: under the module map add "Implemented in Plan 02: `src/bridge/*` (SAB + postMessage `SimBridge`, 200 Hz worker), `src/sim/roles.ts`, `src/sensing/*`, `src/body/*`, `src/viz/*`, `src/app/{config,loop,world-query}.ts`, `src/scene.config.ts`, `src/main.ts`." Note that `light_*`/`wind_*` sensing, the HUD slider/meters, brain camera mode, and audio are Plan 02b.
`README.md` Status: "Plan 02 (app shell) complete: the fixture brain flies the fly through a proximity+looming→escape loop in the browser, SAB worker bridge with postMessage fallback, Three.js point-cloud brain. Next: Plan 02b (light/wind sensing, HUD, brain camera, audio, object UI, aesthetic pass)."

- [ ] **Step 4: Full green gate**

Run:
```
yarn ci && yarn rs:smoke
```
Expected: `yarn ci` all green (incl. the node-wasm integration test, not skipped); `yarn rs:smoke` prints the `escape` readout climbing past 0.5.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: Plan 02 tuning pass, manual checklist, doc sync"
```

---

## Self-Review

**1. Spec coverage (against `docs/superpowers/specs/2026-09-09-fly-playground-02-app-shell-design.md`):**

- §2 module map → Tasks 2–12 create every listed file. `src/pilot/` correctly absent (spec §2 revision). ✅
- §2.1 shared types (`Vec3/Quat/Aabb/Pose/WorldQuery/Readouts`, axis convention) → Task 7 Step 1 (`src/body/types.ts`); axis convention encoded in `poseOf` (Task 8) + tested. ✅
- §3.1 `SimBridge` interface → "Shared types" block + Task 4 (`sim-bridge.ts`). `RoleTable` sorted-name order + worker defines roles in that order → Task 2 + Global Constraints + Task 4 Step 13. ✅
- §3.2 SAB layout (control ints, input, output regions; seq odd/even torn-read) → Task 3 `RingLayout` + `writeOutput`/`readOutput` + tests. ✅
- §3.3 PM fallback (transferable stimulus + state) → Task 4 `protocol.ts` + `PmBridge` + tests. ✅
- §3.4 worker accumulator, `TICK_MS=5`, `MAX_CATCHUP_MS`, re-inject every tick → Task 3 `stepAccumulator` + tests; wired in Task 4 `WorkerCore` + `sim.worker.ts`. ✅
- §3.5 snapshot decimation (`nSnapshot`, stride) → Task 4 `WorkerCore.frame` + test "strided snapshot". ✅
- §4 renderer (guarded), brain Points + shader, core edges, procedural fly, world from scene.config, follow camera, palette → Tasks 10–11 (+ `buildWorld` in Task 10 Step 4, used in Task 12). ✅
- §5.1 body: wrench mapping (hover/asymmetry/thrust/yaw), escape rising-edge + lockout + hysteresis, semi-implicit Euler + exp drag + quaternion, soft bounds, sphere-AABB collision, seeded noise → Tasks 8–9 with a test per behavior. ✅
- §5.2 sensing: `proximity` (rays), `looming` (dθ/dt in a forward cone), one-pole smoothing, `light_*`/`wind_*` slots zero → Task 7 + tests. ✅
- §6 `app/config.ts` sections + `scene.config.ts` shape + a scene with an object on the cruise path → Task 1 (`CONFIG`) + Task 12 (`SCENE`). ✅
- §7.1 pure-logic suites → every one enumerated in the spec maps to a `*.test.ts` in Tasks 2–12. ✅
- §7.2 node-wasm integration test + `pkg-node` build + skip-if-absent → Task 6. ✅
- §7.3 `examples/smoke.mjs` + `rs:wasm:node` / `rs:smoke` scripts, not in `yarn ci` → Task 1 (scripts) + Task 6 (file). ✅
- §7.4 CI adds `rs:wasm:node` before `test`; `three` pinned; `predev`/`prebuild` run `rs:wasm` → Task 1. ✅
- §7.5 carry-ins: `@types/node` added, `node-env.d.ts` deleted, `.gitignore` entries → Task 1. ✅
- §7.6 docs (`manual-checklist`, `architecture`, `README`) → Task 13. ✅
- §9 risk 1 (`three` under node) → Task 10 Step 1 probe with both branches. Risk 2 (SAB in dev) → PM built first (Task 4), SAB second (Task 5), `createSimBridge` test both ways. Risk 3 (escape tuning) → Task 13 Step 1 + the numeric bound in Task 6's integration test. Risk 4 (hover neutrality) → `LIFT_K*(s-HOVER_S)` form kept, `HOVER_S=0`, tested in Task 8/9. Risk 5 (frame-rate coupling) → `MAX_FRAME_DT` clamp in Task 12 + test "cannot tunnel". ✅

No gaps.

**2. Placeholder scan:** No "TBD"/"TODO"/"handle edge cases"/"similar to Task N". Every code step has literal code or an explicit, bounded instruction with exact identifiers. Task 10's `builders.ts` details and Task 11's `renderer.ts`/`brain-material.ts` are described as prose (GLSL + `three` setup) rather than full listings — acceptable: they are untested glue whose exact shape depends on the installed `three` version, and every symbol they expose is named in the Interfaces block. Task 3 Step 3 flags a deliberately-wrong line and states the exact replacement — the final file content is unambiguous. Task 13 Step 1 is a tuning instruction, not a placeholder (no new logic, exact dials named).

**3. Type consistency:**
- `SimLike` — identical structural shape in "Shared types", Task 3 (`stepAccumulator` param), Task 4 (`WorkerCore`, fakes), Task 6 (integration). `activity_snapshot()` (snake_case, matches the wasm-bindgen export). ✅
- `RoleTable` — `{ input, readout, inputOrder, readoutOrder }` in "Shared types", Task 2 def, consumed with those exact fields in Tasks 4/5/6/7/12. ✅
- `AccState` — `{ acc, tick, hzEma }` in Task 3, reused in Task 4/6. ✅
- `stepAccumulator(state, elapsedMs, latched, sim, inputRoleIds, cfg)` — same arg order in Task 3 def, Task 4 `WorkerCore`, Task 6 integration test. ✅
- `Pose` = `{ position, orientation, forward, up }` — "Shared types", produced by `poseOf` (Task 8), consumed by `sensing.sample` (Task 7), `mapReadouts` (Task 8), `updateFollowCamera` (Task 11), `Loop` (Task 12). ✅
- `Wrench` = `{ force, torque }` — Task 8 `wrench.ts` def, consumed by `integrate` (Task 8) and `Body` (Task 9). ✅
- `mapReadouts(readouts, pose, esc, dt, noise, tSeconds)` — same signature Task 8 def + Task 9 caller. Returns `{ wrench, esc, firedImpulse }`; `Body` uses all three. ✅
- `resolveSphere(pos, vel, radius, world) -> { position, vel, contact }` — Task 9 def + caller. ✅
- `worldQuery(scene) -> WorldQuery` — Task 12 def; `WorldQuery = { aabbs, bounds }` matches "Shared types" and every `sensing`/`body`/`collision` consumer. ✅
- `SceneConfig` / `SceneObject` / `SceneLight` — Task 12 `scene.config.ts` def; referenced by `buildWorld` (Task 10, via `import("../scene.config")`) and `worldQuery` (Task 12). ✅
- `createSimBridge(workerFactory)` — Task 4 stub (PM only) → Task 5 real (SAB/PM); both take `() => Worker`. ✅
- `RingLayout(nInput, nReadout, snapMax)` + `.views(sab)` + `writeOutput`/`readOutput`/`writeInput`/`readInput` — Task 3 def, consumed unchanged in Task 5 (`SabBridge`) and Task 4/5 worker path. ✅
- `activityColour(t)` appears in `viz/geometry.ts` (Task 10, JS, tested) and as its GLSL twin in `brain-material.ts` (Task 11) — same cold→amber→white ramp; the spec calls for the fragment shader to `mix(cold, hot, aActivity)`, and Task 11 uses a 2-stop mix while `geometry.ts` uses 3 stops. Note for the implementer: keep the GLSL simple (2-stop `mix`) — the JS `activityColour` is for any future CPU-side colouring and is not required to be pixel-identical. Flagged, not a blocker.

One inconsistency fixed inline: earlier draft had `CONFIG.aesthetic` without `FLAP_MIN`/`FLAP_MAX`/`FLAP_AMP`; Task 11 Steps 2–3 add them explicitly to `CONFIG.aesthetic` before first use.

---

## Execution Handoff

Plan complete. 13 tasks, each ending in a green test run + commit. Tasks 1→6 build the bridge bottom-up (pure primitives → PM transport → SAB transport → real-wasm integration test); 7→9 the framework-free sim-facing logic (sensing, body); 10→11 the renderer; 12 wires the loop and boots the app; 13 tunes + documents.
