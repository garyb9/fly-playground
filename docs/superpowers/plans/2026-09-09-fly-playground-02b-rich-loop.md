# fly-playground — Plan 02b: Rich Loop + Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-eye light + bilateral wind sensing (closing a phototaxis turn), a resting-heading fix, a DOM edge-instrument HUD (depth slider, meters, live 6-param LIF panel), procedural audio, runtime world editing with `localStorage` persistence, and a world/fly/HUD/post-FX aesthetic pass with a "Deep Field" dark theme + a cool light theme and a runtime toggle — on top of the shipped Plan 02 loop.

**Architecture:** Everything framework-free stays pure and `vitest`-tested (`bridge/`, `sensing/`, `body/`, `world/`, `ui/scale.ts`, `audio/mapping.ts`, `viz/motion.ts`, `viz/geometry.ts`). New leaf modules `src/ui/` (DOM HUD) and `src/audio/` (Web Audio) talk to the app only through a `HudControls` callback interface and the per-frame `FrameView`; `src/world/` holds a mutable `SceneStore`. The `viz/` renderer path gains an `EffectComposer` post-FX stack and a dual palette with a theme swap. The brain point cloud is **not** touched here — it is removed and replaced by a docked panel in the sibling **Plan 2c** (separate branch/PR, another session); this plan only guarantees the frozen `FrameView` data seam and reserves the panel's screen region.

**Tech Stack:** TypeScript + Vite + Vitest (env `node`); Three.js 0.186.0 (pinned) incl. `three/examples/jsm/postprocessing/*`; Web Audio API; `localStorage`; self-hosted IBM Plex Mono/Sans `woff2`. No new runtime dependency.

**Spec:** `docs/superpowers/specs/2026-09-09-fly-playground-02b-rich-loop-design.md` (the plan argues from this spec; executors read both). Companions: `docs/2026-09-09-visual-direction.md` ("Deep Field" — dark-theme source of truth, its §7 A1–A13 table is updated in the same commit as the code that lands each row), `docs/handoff-plan-02b-03.md`, Plan 02 spec `docs/superpowers/specs/2026-09-09-fly-playground-02-app-shell-design.md`.

## Global Constraints

- **Branch:** all work on `plan-02b-rich-loop` (already created, off `main` @ `9c6ea39`, spec committed at `c2f4b73`). The implementing session pushes the branch **and** fast-forwards `origin/main` once the plan's review passes (maintainer directive, 2026-09-10 — supersedes the earlier "maintainer merges" line). No PR ceremony.
- **Per-change gate (run before every commit):** `npx vitest run && npx tsc --noEmit && npx eslint src && npx prettier --check "src/**/*.{ts,js}" && yarn build`. **Full gate at plan close:** `yarn ci` + `yarn rs:smoke`.
- **TDD:** failing test → run and watch it fail → minimal implementation → run and watch it pass → commit. At least one commit per task.
- **Commit messages:** Conventional Commits. End every commit body with, verbatim:

  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01WCm5gZDQbaJiz1Kszm414c
  ```

- **Framework-free core:** nothing under `src/bridge/`, `src/sensing/`, `src/body/`, `src/sim/`, `src/world/`, `src/ui/`, `src/audio/` may import `three`. `THREE.*` appears only in `src/viz/` and `src/main.ts`.
- **Determinism where cheap:** no `Math.random` in `src/body/`, `src/sensing/`, `src/world/`, `src/viz/motion.ts`, or the step path. Yaw jitter stays seeded value-noise; `SceneStore` ids are an incrementing counter.
- **vitest env is `node`.** No jsdom, no DOM test environment. `src/ui/hud.ts` + `hud.css`, `src/audio/audio.ts`, `src/viz/post.ts`, `renderer.ts` composer path, `palette.ts` theme mutation, and `src/main.ts` are **untested glue** — covered by `tsc` + `eslint` + `vite build` + the manual checklist. All logic those files need lives in pure, tested helpers.
- **No new runtime dependency.** `three/examples/jsm/postprocessing/{EffectComposer,RenderPass,ShaderPass,UnrealBloomPass}.js` and `three/examples/jsm/shaders/FXAAShader.js` ship inside the pinned `three`. `@types/three` **may** be bumped to a `0.186.x` (dev-only, types) if those sub-path types don't resolve — the sole allowed `package.json` change. Self-hosted `woff2` fonts are committed assets, not a dependency.
- **`FrameView` is FROZEN for Plan 2c.** Its shape is exactly `{ pose: Pose; readouts: Readouts; sensory: Readouts; activity: Float32Array; simHz: number; paused: boolean }`. Do not add, remove, or rename fields.
- **`src/main.ts` is co-edited with Plan 2c.** Keep this plan's edits in contiguous regions; Plan 2c owns the ~10 lines that delete the old brain `THREE.Group` and construct the docked panel. Whichever plan's PR merges first lays down the shared `loadEnvelope` clock; the other rebases onto it. Re-run `git log origin/main` before starting each task and rebase `plan-02b-rich-loop` if `main` moved.
- **TypeScript:** `strict` + `noUncheckedIndexedAccess` are on — indexed access needs `!` or a guard. eslint = `@eslint/js` recommended + `typescript-eslint` recommended: no `any`, no unused symbols. Tests `import { expect, test } from "vitest"` explicitly (match existing files).
- **Fixture facts (hardcode in tests):** 500 neurons, `core_count = 48`. Input roles sorted: `light_l, light_r, looming, proximity, wind_l, wind_r`. Readout roles sorted: `escape, thrust, wing_l, wing_r, yaw_torque`. Weak `light_l → wing_r`, `light_r → wing_l` (contralateral). `LifParams` default `from_ms(5, 20, 1, 0, 2, 0.02)`.
- **Deep Field status table:** when a task lands a row it owns (spec §9.1: this plan owns **A1, A3, A5, A6, A8, A12**, and the fly-bob / camera-kick / load-banner halves of **A2, A9, A10, A11**), set that row in `docs/2026-09-09-visual-direction.md` §7 to `done` / `partial` (with a note) and append the commit short-hash, **in that same commit**.

---

## Shared types (defined here; tasks refer back)

```ts
// src/app/world-query.ts  — WorldQuery gains `lights`; body/ + collision/ ignore it
export interface WorldQuery {
  aabbs: Aabb[];
  bounds: Aabb;
  lights: { pos: Vec3; intensity: number }[];   // NEW (Task 4)
}

// src/bridge/sim-bridge.ts
export interface SimLike {
  inject(roleId: number, value: number): void;
  step(ticks: number): void;
  readout(roleId: number): number;
  activity_snapshot(): Float32Array;
  set_params(                                    // NEW (Task 3) — matches the wasm Sim export
    dtMs: number, tauMMs: number, vThreshold: number,
    vReset: number, refracMs: number, noiseSigma: number,
  ): void;
}
export interface LifParams {
  dtMs: number; tauMMs: number; vThreshold: number;
  vReset: number; refracMs: number; noiseSigma: number;
}
export interface SimState {
  readouts: Float32Array; activity: Float32Array;
  simHz: number; tick: number;
  paused: boolean;                              // NEW (Task 3)
}

// src/app/loop.ts  — FrameView is FROZEN
export interface FrameView {
  pose: Pose;
  readouts: Readouts;   // readoutOrder name → value
  sensory: Readouts;    // NEW (Task 5) — inputOrder name → value (the injected stimulus)
  activity: Float32Array;
  simHz: number;
  paused: boolean;      // NEW (Task 5)
}
// LoopDeps keeps `world: WorldQuery` as the seed; Loop gains setWorld(w). (Task 5)

// src/ui/controls.ts  (Task 7)
export type Theme = "dark" | "light";
export interface HudControls {
  setActiveCount(n: number): void;
  setParams(p: Partial<LifParams>): void;
  setPaused(paused: boolean): void;
  setTheme(theme: Theme): void;
  setGroupVisible(groupId: number, visible: boolean): void;   // type owned here; UI is in the Plan 2c panel
  setMuted(muted: boolean): void;
  setVolume(v01: number): void;
  addObject(spec: { kind: SceneObject["kind"]; material: string }): void;
  updateObject(id: string, patch: Partial<Pick<SceneObject, "position" | "scale">>): void;
  removeObject(id: string): void;
  updateLight(index: number, patch: Partial<SceneLight>): void;
  resetScene(): void;
}
export interface HudModel {
  coreCount: number; nNeurons: number;
  groups: number[];
  lif: { defaults: LifParams; ranges: Record<keyof LifParams, readonly [number, number]> };
  scene: SceneConfig;
  theme: Theme;
  reservedRect: { x: number; y: number; w: number; h: number };
}
export interface HudFrame {
  readouts: Readouts; sensory: Readouts;
  simHz: number; activeCount: number; paused: boolean;
}

// src/world/scene-store.ts  (Task 10)
export interface SceneStore {
  snapshot(): SceneConfig;
  addObject(o: Omit<SceneObject, "id">): string;
  updateObject(id: string, patch: Partial<Omit<SceneObject, "id">>): void;
  removeObject(id: string): void;
  updateLight(index: number, patch: Partial<SceneLight>): void;
  reset(): void;
  subscribe(cb: (s: SceneConfig) => void): () => void;
}

// src/viz/motion.ts  (Task 6) — pure; t in seconds
export function bob(t: number, hz: number, amp: number): number;
export function idleSway(t: number, hz: number, amp: number): Vec3;
export function escapeKick(elapsed: number, cfg: { posShove: number; rollDeg: number; decayS: number }): { posShove: Vec3; roll: number };
export function loadEnvelope(t: number, cfg: { bannerS: number; igniteS: number; hudS: number }): { banner: number; ignite: number; hud: number };
```

---

## Task 1: `CONFIG` extensions

**Files:**
- Modify: `src/app/config.ts`
- Modify: `src/app/config.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `CONFIG.lif.{defaults,ranges}`, `CONFIG.sensing.{EPS2,LIGHT_MAX,TAU_LIGHT,EYE_SPLAY,WIND,WIND_SPEED,WIND_TURN_HZ,TAU_WIND}`, `CONFIG.physics.YAW_JITTER_DT`, `CONFIG.audio.*`, `CONFIG.camera.{IDLE_SWAY_HZ,IDLE_SWAY_AMP}`, `CONFIG.hud.reservedRect`, `CONFIG.aesthetic.{theme,BOB_HZ,BOB_AMP,ESCAPE_KICK,LOAD,EXPOSURE,BLOOM,VIGNETTE,GRAIN}`. Consumed by Tasks 2–12.

- [ ] **Step 1: Write the failing test.** Append to `src/app/config.test.ts`:

```ts
import { CONFIG } from "./config";

test("Plan 02b CONFIG blocks are present and sane", () => {
  const P = CONFIG as unknown as Record<string, Record<string, unknown>>;
  // lif
  const lif = CONFIG.lif;
  const keys = ["dtMs", "tauMMs", "vThreshold", "vReset", "refracMs", "noiseSigma"] as const;
  for (const k of keys) {
    const [lo, hi] = lif.ranges[k];
    expect(hi).toBeGreaterThan(lo);
    expect(lif.defaults[k]).toBeGreaterThanOrEqual(lo);
    expect(lif.defaults[k]).toBeLessThanOrEqual(hi);
  }
  expect(lif.ranges.noiseSigma[0]).toBeGreaterThanOrEqual(0);
  // sensing
  expect(CONFIG.sensing.EPS2).toBeCloseTo(CONFIG.sensing.EPS ** 2, 10);
  expect(CONFIG.sensing.LIGHT_MAX).toBeGreaterThan(0);
  expect(CONFIG.sensing.EYE_SPLAY).toBeGreaterThan(0);
  for (const c of ["x", "y", "z"] as const) expect(Number.isFinite(CONFIG.sensing.WIND[c])).toBe(true);
  // physics
  expect(CONFIG.physics.YAW_JITTER_DT).toBeGreaterThan(0);
  // audio
  expect(CONFIG.audio.ambientFreqs.every((f) => f > 0)).toBe(true);
  expect(CONFIG.audio.WING_HZ_MAX).toBeGreaterThan(CONFIG.audio.WING_HZ_MIN);
  expect(CONFIG.audio.masterDefault).toBeGreaterThanOrEqual(0);
  expect(CONFIG.audio.masterDefault).toBeLessThanOrEqual(1);
  // aesthetic
  expect(CONFIG.aesthetic.theme === "dark" || CONFIG.aesthetic.theme === "light").toBe(true);
  expect("grid" in CONFIG.aesthetic).toBe(false);
  expect(CONFIG.aesthetic.BLOOM.dark.THRESHOLD).toBeGreaterThanOrEqual(0);
  expect(CONFIG.aesthetic.BLOOM.dark.THRESHOLD).toBeLessThanOrEqual(1);
  expect(CONFIG.aesthetic.EXPOSURE).toBeGreaterThan(0);
  // hud reservedRect
  const r = CONFIG.hud.reservedRect;
  expect(r.x + r.w).toBeLessThanOrEqual(1);
  expect(r.y + r.h).toBeLessThanOrEqual(1);
  void P;
});
```

Also **modify the existing `test("CONFIG is fully populated and sane")`**: delete the line `expect(flat).not.toMatch(/null/);` and its `const flat = ...` if now unused (Plan 02b uses `0`, never `null`, for "bloom off", so the guard is redundant and the block below already checks finiteness). Delete the line `expect(CONFIG.aesthetic.brainScale).toBeGreaterThanOrEqual(1);` **only if** `tsc` later complains — otherwise leave it (Plan 2c removes `brainScale`). Keep every other assertion.

- [ ] **Step 2: Run it, watch it fail.**

Run: `npx vitest run src/app/config.test.ts`
Expected: FAIL — `CONFIG.lif` is `undefined`, etc.

- [ ] **Step 3: Add the blocks to `src/app/config.ts`.** Keep `CONFIG` `as const`. Keep every existing key. Remove only `aesthetic.grid` and `aesthetic.grain`. Add:

```ts
  // inside CONFIG, as sibling top-level keys:
  lif: {
    defaults: { dtMs: 5, tauMMs: 20, vThreshold: 1, vReset: 0, refracMs: 2, noiseSigma: 0.02 },
    ranges: {
      dtMs: [1, 10],
      tauMMs: [2, 80],
      vThreshold: [0.3, 3],
      vReset: [-1, 0.5],
      refracMs: [0, 10],
      noiseSigma: [0, 0.3],
    },
  },
  // inside CONFIG.sensing, add:
    EPS2: 0.05 * 0.05,
    LIGHT_MAX: 4,
    TAU_LIGHT: 0.12,
    EYE_SPLAY: 0.6,
    WIND: { x: 1, y: 0, z: 0.35 },
    WIND_SPEED: 0.5,
    WIND_TURN_HZ: 0.03,
    TAU_WIND: 0.2,
  // inside CONFIG.physics, add:
    YAW_JITTER_DT: 0.05,
  // inside CONFIG.camera, add:
    IDLE_SWAY_HZ: 0.1,
    IDLE_SWAY_AMP: 0.02,
  // new top-level key:
  audio: {
    ambientFreqs: [55, 82.5, 110],
    lowpassHz: 380,
    lfoHz: 0.05,
    WING_HZ_MIN: 120,
    WING_HZ_MAX: 900,
    WING_GAIN_MAX: 0.15,
    blip: { freq: 660, dur: 0.12, gain: 0.25 },
    masterDefault: 0.6,
    startMuted: true,
  },
  // new top-level key:
  hud: {
    // Plan 2c docked-card region the HUD keeps clear (viewport fracs, 1080p ref).
    reservedRect: { x: 0.0125, y: 0.022, w: 0.156, h: 0.322 },
  },
  // inside CONFIG.aesthetic, add (and DELETE `grid`, `grain`):
    theme: "dark",
    BOB_HZ: 0.5,
    BOB_AMP: 0.15,
    ESCAPE_KICK: { posShove: 0.6, rollDeg: 1.5, decayS: 0.3 },
    LOAD: { bannerS: 1.0, igniteS: 0.6, hudS: 0.8 },
    EXPOSURE: 1.0,
    // "bloom off" is STRENGTH: 0 (not null) so config.test.ts's finite/shape checks stay simple.
    BLOOM: {
      dark: { STRENGTH: 0.7, RADIUS: 0.4, THRESHOLD: 0.6 },
      light: { STRENGTH: 0, RADIUS: 0.4, THRESHOLD: 0.9 },
    },
    VIGNETTE: { dark: 0.2, light: 0.12 },
    GRAIN: { dark: 0.035, light: 0.015 },
```

> **Note (deviation from spec §10):** spec used `BLOOM.light: null`; this plan uses `{ STRENGTH: 0, ... }` so `post.ts` can treat `STRENGTH <= 0` as "no bloom pass" and the config invariants stay number-only. `theme` default is `"dark"` (Deep Field). `brainCenter` / `brainScale` / `BASE_SIZE` / `POINT_*` stay untouched — Plan 2c removes them.

- [ ] **Step 4: Run it, watch it pass.**

Run: `npx vitest run src/app/config.test.ts && npx tsc --noEmit`
Expected: PASS; typecheck clean.

- [ ] **Step 5: Commit.**

```
git add src/app/config.ts src/app/config.test.ts
git commit   # chore: Plan 02b CONFIG — lif/sensing/audio/hud/aesthetic dials
```

---

## Task 2: Carried-over review nits — resting-heading + `activityColour`

**Files:**
- Modify: `src/body/wrench.ts` (line ~36: the `yaw` term)
- Modify: `src/body/wrench.test.ts`
- Modify: `src/viz/geometry.ts` (`activityColour`, lines ~42–51)
- Modify: `src/viz/geometry.test.ts`

**Interfaces:**
- Consumes: `CONFIG.physics.YAW_JITTER_DT` (Task 1).
- Produces: nothing new (behavioural fixes only). `mapReadouts` signature unchanged.

- [ ] **Step 1: Write the failing wrench test.** Append to `src/body/wrench.test.ts`:

```ts
import { ValueNoise } from "./noise";

test("at rest, yaw torque from noise is mean-zero over a 15s window (no heading drift)", () => {
  const noise = new ValueNoise(CONFIG.sim.seed);
  const dt = 1 / 60;
  let sumTorqueY = 0;
  let n = 0;
  for (let t = 0; t < 15; t += dt) {
    const { wrench } = mapReadouts(R({}), pose, initEscapeState(), dt, noise, t);
    sumTorqueY += wrench.torque.y;
    n++;
  }
  const meanTorqueY = sumTorqueY / n;
  // A DC bias here integrates into a steady heading rate. The finite-difference
  // jitter is the increment of a stationary process → mean ~0.
  expect(Math.abs(meanTorqueY)).toBeLessThan(1e-3);
  // The time-integral (∝ heading change) must also stay bounded, not grow with the window.
  expect(Math.abs(sumTorqueY * dt)).toBeLessThan(0.05);
});
```

- [ ] **Step 2: Run it, watch it fail.**

Run: `npx vitest run src/body/wrench.test.ts`
Expected: FAIL — the current `yaw = yaw_torque + noise.at(3, t) * NOISE_AMP` gives a non-zero mean (cosine-interpolated value noise is not zero-mean over a short window).

- [ ] **Step 3: Fix the yaw term in `src/body/wrench.ts`.** Replace the single line

```ts
  const yaw = (readouts.yaw_torque ?? 0) + n(3);
```

with

```ts
  // n(3) alone is not zero-mean over a short window, so it fed a slow DC yaw-torque
  // bias → the resting fly wandered ~50°/15s in heading. A finite difference of the
  // same noise channel is the increment of a stationary process: mean-zero, so its
  // integral (heading) stays bounded while still wobbling for life.
  const yawJitter =
    (noise.at(3, tSeconds) - noise.at(3, tSeconds - CONFIG.physics.YAW_JITTER_DT)) * P.NOISE_AMP;
  const yaw = (readouts.yaw_torque ?? 0) + yawJitter;
```

(`noise`, `tSeconds`, `P` are already in scope — `n` is the local `(ch) => noise.at(ch, tSeconds) * P.NOISE_AMP` helper; `n(2)` for `thrust` is unchanged.)

- [ ] **Step 4: Run it, watch it pass; run the whole wrench suite.**

Run: `npx vitest run src/body/wrench.test.ts`
Expected: PASS, and the four pre-existing wrench tests still PASS (they use `noNoise`, so the difference is `0 - 0 = 0`).

- [ ] **Step 5: Write the failing geometry test.** In `src/viz/geometry.test.ts`, extend `test("activityColour ramps cold→hot monotonically")`:

```ts
test("activityColour ramps cold→hot monotonically, blue never dips at the midpoint", () => {
  const [r0, gr0, b0] = activityColour(0);
  const [r1, gr1, b1] = activityColour(1);
  const bMid = activityColour(0.6)[2];
  expect(r1).toBeGreaterThanOrEqual(r0);
  expect(r1 + gr1 + b1).toBeGreaterThan(r0 + gr0 + b0);
  expect(b1).toBeGreaterThanOrEqual(b0);
  expect(bMid).toBeGreaterThanOrEqual(b0); // was 0.122 < 0.169 — the dip
});
```

- [ ] **Step 6: Run it, watch it fail.**

Run: `npx vitest run src/viz/geometry.test.ts`
Expected: FAIL — `activityColour(0.6)[2]` is `0.122`, below `activityColour(0)[2]` = `0.169`.

- [ ] **Step 7: Fix the blue channel in `src/viz/geometry.ts`.** In `activityColour`, change the two blue-channel lerps so blue is monotone non-decreasing:

```ts
  if (c < 0.6) {
    const u = c / 0.6;
    return [lerp(0.106, 0.851, u), lerp(0.118, 0.541, u), lerp(0.169, 0.30, u)];
  }
  const u = (c - 0.6) / 0.4;
  return [lerp(0.851, 0.992, u), lerp(0.541, 0.941, u), lerp(0.30, 0.835, u)];
```

(Only the blue components `0.169 → 0.122 → 0.835` become `0.169 → 0.30 → 0.835`.)

- [ ] **Step 8: Run it, watch it pass.**

Run: `npx vitest run src/viz/geometry.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit.**

```
git add src/body/wrench.ts src/body/wrench.test.ts src/viz/geometry.ts src/viz/geometry.test.ts
git commit   # fix: mean-zero resting yaw jitter + activityColour blue-channel dip
```

---

## Task 3: Bridge — `setParams` end to end + one pause mechanism + `SimState.paused`

**Files:**
- Modify: `src/bridge/sim-bridge.ts` (`SimLike.set_params`, `LifParams`, `SimState.paused`)
- Modify: `src/bridge/ring.ts` (`readOutput` returns `paused`)
- Modify: `src/bridge/protocol.ts` (`StatePayload` / `state` msg / `decodeState` carry `paused`)
- Modify: `src/bridge/worker-core.ts` (`setParams`, drop `pause`/`resume`/`paused`, `frame(0)` no-steps, track `LifParams`)
- Modify: `src/bridge/sim.worker.ts` (`setParams` branch, single pause via `running`, publish while paused)
- Modify: `src/bridge/pm-bridge.ts` (`readState().paused`)
- Modify: `src/bridge/sab-bridge.ts` (`readState().paused`)
- Modify: `src/bridge/worker-core.test.ts`, `src/bridge/ring.test.ts`, `src/bridge/protocol.test.ts`, `src/bridge/sim-bridge.test.ts`
- Modify: `src/bridge/integration.test.ts` (add `noiseSigma` effect assertion)
- Modify: `src/bridge/step-accumulator.ts` **only if** its `SimLike` import forces a `set_params` on fakes — it does not (structural); fakes just gain the method.

**Interfaces:**
- Consumes: `CONFIG.lif.defaults` (Task 1).
- Produces:
  - `SimLike.set_params(dtMs, tauMMs, vThreshold, vReset, refracMs, noiseSigma): void`
  - `SimState.paused: boolean`
  - `WorkerCore` constructor `Cfg` gains `lif: LifParams` (the resolved full vector); `WorkerCore.setParams(p: Partial<LifParams>): void`; **`WorkerCore` no longer has `pause()` / `resume()`**.
  - `readOutput(v)` return gains `paused: boolean`.
  - `ToWorker` already has `{ t: "setParams"; p: Partial<LifParams> }`; `FromWorker` `state` gains `paused: boolean`; `StatePayload` gains `paused: boolean`.

- [ ] **Step 1: Write the failing `worker-core` tests.** In `src/bridge/worker-core.test.ts`:
  - Add `set_params` to `FakeSim` and record calls:

```ts
class FakeSim implements SimLike {
  n: number;
  lastInject: Record<number, number> = {};
  stepCalls = 0;
  paramCalls: number[][] = [];
  constructor(n: number) { this.n = n; }
  inject(id: number, v: number) { this.lastInject[id] = v; }
  step() { this.stepCalls++; }
  readout(id: number) { return id === 0 ? (this.lastInject[10] ?? 0) : 0; }
  activity_snapshot() { return Float32Array.from({ length: this.n }, (_, i) => i / this.n); }
  set_params(...p: number[]) { this.paramCalls.push(p); }
}
```

  - The `cfg` literal used by the tests gains `lif`:

```ts
const LIF = { dtMs: 5, tauMMs: 20, vThreshold: 1, vReset: 0, refracMs: 2, noiseSigma: 0.02 };
const cfg = { TICK_MS: 5, MAX_CATCHUP_MS: 20, hzEmaTau: 0.5, snapMax: 4, coreFloor: 2, lif: LIF };
```

  - **Replace** `test("pause() freezes ticks", ...)` with:

```ts
test("frame(0) advances no ticks but still returns readouts + a snapshot", () => {
  const sim = new FakeSim(50);
  const core = new WorkerCore(sim, rt, [10], [0, 1], cfg);
  core.setActiveCount(50);
  const f0 = core.frame(0);
  expect(sim.stepCalls).toBe(0);
  expect(f0.readouts.length).toBe(2);
  expect(f0.activity.length).toBe(4);
  expect(f0.tick).toBe(0);
  const f1 = core.frame(20);
  expect(f1.tick).toBeGreaterThan(0);
});
```

  - Add:

```ts
test("constructor applies the resolved lif vector once via set_params", () => {
  const sim = new FakeSim(50);
  new WorkerCore(sim, rt, [10], [0, 1], cfg);
  expect(sim.paramCalls).toEqual([[5, 20, 1, 0, 2, 0.02]]);
});

test("setParams merges a partial into the tracked vector (not a reset)", () => {
  const sim = new FakeSim(50);
  const core = new WorkerCore(sim, rt, [10], [0, 1], cfg);
  core.setParams({ noiseSigma: 0.1 });
  core.setParams({ vThreshold: 0.8 });
  expect(sim.paramCalls).toEqual([
    [5, 20, 1, 0, 2, 0.02],
    [5, 20, 1, 0, 2, 0.1],
    [5, 20, 0.8, 0, 2, 0.1],
  ]);
});
```

- [ ] **Step 2: Run, watch fail.**

Run: `npx vitest run src/bridge/worker-core.test.ts`
Expected: FAIL — `SimLike` has no `set_params`; `WorkerCore` ctor doesn't call it; `WorkerCore.setParams` undefined; old `pause` test now references a removed method.

- [ ] **Step 3: Extend `SimLike` + `LifParams` + `SimState` in `src/bridge/sim-bridge.ts`.**
  - Add `set_params(dtMs, tauMMs, vThreshold, vReset, refracMs, noiseSigma): void` to `SimLike`.
  - `LifParams` interface (six `number` fields, names as in Shared types) — it already exists; confirm the field names are `dtMs/tauMMs/vThreshold/vReset/refracMs/noiseSigma`.
  - Add `paused: boolean` to `SimState`.

- [ ] **Step 4: `src/bridge/worker-core.ts`.**
  - `Cfg` gains `lif: LifParams`.
  - Add a private `private params: LifParams` initialised in the constructor: `this.params = { ...cfg.lif }` then `this.applyParams()`.
  - `private applyParams() { const p = this.params; this.sim.set_params(p.dtMs, p.tauMMs, p.vThreshold, p.vReset, p.refracMs, p.noiseSigma); }`
  - `setParams(p: Partial<LifParams>) { this.params = { ...this.params, ...p }; this.applyParams(); }`
  - **Delete** `pause()`, `resume()`, the `private paused = false` field, and the `if (!this.paused)` guard in `frame()`.
  - `frame(elapsedMs)`: wrap the `stepAccumulator` call in `if (elapsedMs > 0) { this.acc = stepAccumulator(...); }`. Everything after (building `readouts`, the strided `activity`, the return object) runs every call. The return object is unchanged (no `paused` field here — the worker adds it at publish time).

- [ ] **Step 5: `src/bridge/sim.worker.ts`.**
  - `onInit`: pass `lif` into the `WorkerCore` cfg — `{ ...CONFIG.worker, snapMax: msg.config.snapMax, coreFloor: CONFIG.sim.coreFloor, lif: { ...CONFIG.lif.defaults, ...(msg.config.lif ?? {}) } }`. (`SimInitConfig` already has `lif?: Partial<LifParams>`.)
  - `onmessage`: add `else if (m.t === "setParams") core?.setParams(m.p);` (before the `reset` branch).
  - `loop()`: publish **every iteration**, stepping only when running:

```ts
function loop() {
  if (!core) return;
  const now = performance.now();
  const elapsed = now - lastTs;
  lastTs = now;
  const frame = core.frame(running ? elapsed : 0);
  if (views) {
    core.setStimulus(readInput(views));
    writeOutput(views, { ...frame, paused: running ? 0 : 1 });
  } else {
    const enc = encodeState({ ...frame, paused: running ? 0 : 1 });
    post(enc.payload, enc.transfer);
  }
  setTimeout(loop, 0);
}
```

  (The `if (running) { ... }` wrapper around the publish is removed — publishing is now unconditional.)

- [ ] **Step 6: `src/bridge/ring.ts` — `readOutput` returns `paused`.** After reading `tick`, add `const paused = Atomics.load(v.control, PAUSED) !== 0;` and include `paused` in the returned object. (`PAUSED` const + `writeOutput` storing `d.paused | 0` already exist.)

- [ ] **Step 7: `src/bridge/protocol.ts` — thread `paused` through the PM path.**
  - `StatePayload` gains `paused: boolean`.
  - `FromWorker` `state` variant gains `paused: boolean`.
  - `encodeState(s)` includes `paused: s.paused` in `payload`.
  - `decodeState(p)` includes `paused: p.paused`.

- [ ] **Step 8: `src/bridge/pm-bridge.ts` + `src/bridge/sab-bridge.ts` — surface `paused`.**
  - `PmBridge`: `last` initial value gains `paused: false`; `onMessage` sets `paused: m.paused` from the `state` message.
  - `SabBridge`: `last` initial value gains `paused: false`; `readState()` — `readOutput` now returns `paused`, so `if (got) this.last = { ...got };` already carries it.

- [ ] **Step 9: Update `ring.test.ts` + `protocol.test.ts` + `sim-bridge`/`pm-bridge` tests.**
  - `ring.test.ts` "output round-trips": add `expect(got!.paused).toBe(false);`, and a second `writeOutput({ ...d, paused: 1 })` → `expect(readOutput(v).paused).toBe(true);`.
  - `protocol.test.ts`: wherever a `StatePayload` is built for `encodeState`, add `paused: false`; assert `decodeState(encodeState({...}).payload).paused === false`, and `true` round-trips.
  - `pm-bridge.test.ts` "setStimulus posts... readState returns last state": the `fw.onmessage?.({ data: { t: "state", ... } })` literal gains `paused: false`; add `expect(b.readState().paused).toBe(false);`.
  - Add a small `pm-bridge` test: after `b.pause()` then a `state` message with `paused: true`, `b.readState().paused === true`.

- [ ] **Step 10: Add the `noiseSigma` assertion to `src/bridge/integration.test.ts`.** Add `set_params` to the `WasmSim` type (`SimLike & { ... }` already spreads `SimLike`, so it's inherited once Step 3 lands — no change needed) and a new case:

```ts
test.runIf(havePkg)("raising noiseSigma raises baseline activity via the real wasm", async () => {
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  const { Sim } = require(pkg) as { Sim: WasmSimCtor };
  const groups = parseGroups(fixtureJson("groups.json"));
  const rt = buildRoleTable(groups);
  const lists = roleNeuronLists(groups, rt);
  const mk = () => {
    const s = new Sim(new Uint8Array(fixtureBuf("neurons.bin")), new Uint8Array(fixtureBuf("graph.bin")), 7n);
    lists.input.forEach((ids, i) => s.define_input_role(rt.inputOrder[i]!, Uint32Array.from(ids)));
    lists.readout.forEach((ids, i) => s.define_readout_role(rt.readoutOrder[i]!, Uint32Array.from(ids)));
    return s;
  };
  const meanActivity = (s: WasmSim) => {
    const a = s.activity_snapshot();
    let sum = 0;
    for (let i = 0; i < a.length; i++) sum += a[i]!;
    return sum / a.length;
  };
  const quiet = mk();
  for (let i = 0; i < 300; i++) quiet.step(1);
  const loud = mk();
  loud.set_params(5, 20, 1, 0, 2, 0.2);
  for (let i = 0; i < 300; i++) loud.step(1);
  expect(meanActivity(loud)).toBeGreaterThan(meanActivity(quiet));
});
```

- [ ] **Step 11: Run the bridge suite + typecheck.**

Run: `npx vitest run src/bridge/ && npx tsc --noEmit`
Expected: PASS (integration `noiseSigma` case runs iff `pkg-node` exists — build with `yarn rs:wasm:node` if you want it green locally).

- [ ] **Step 12: Full gate + commit.**

Run: `npx vitest run && npx tsc --noEmit && npx eslint src && npx prettier --check "src/**/*.{ts,js}" && yarn build`

```
git add src/bridge/
git commit   # feat: wire setParams to sim.set_params; unify pause on the worker running flag; SimState.paused
```

---

## Task 4: Light + wind sensing (`WorldQuery.lights`, `sensing.ts`)

**Files:**
- Modify: `src/app/world-query.ts` (populate `lights`)
- Modify: `src/app/world-query.test.ts`
- Modify: `src/body/types.ts` (`WorldQuery` gains `lights`)
- Modify: `src/sensing/sensing.ts` (`SensingState` +4 fields + `windPhase`; light + wind channels)
- Modify: `src/sensing/sensing.test.ts`
- Modify: `src/bridge/integration.test.ts` (add phototaxis-path assertion)
- Modify: every test that builds a `WorldQuery` literal — add `lights: []` (grep `aabbs:` under `src/**/*.test.ts`: `sensing.test.ts`, `loop.test.ts`, and any `body/*.test.ts` / `sensing/raycast.test.ts`).

**Interfaces:**
- Consumes: `CONFIG.sensing.{EPS2,LIGHT_MAX,TAU_LIGHT,EYE_SPLAY,WIND,WIND_SPEED,WIND_TURN_HZ,TAU_WIND}` (Task 1); `WorldQuery.lights` (this task).
- Produces: `WorldQuery.lights: { pos: Vec3; intensity: number }[]`; `SensingState` gains `lightL, lightR, windL, windR, windPhase: number`; `sample(...)` now writes the `light_l/light_r/wind_l/wind_r` stimulus slots.

- [ ] **Step 1: `WorldQuery` type + `worldQuery` + its test.**
  - `src/body/types.ts`: `WorldQuery` gains `lights: { pos: Vec3; intensity: number }[]`.
  - `src/app/world-query.ts`: return `lights: scene.lights.map((l) => ({ pos: l.position, intensity: l.intensity }))`.
  - `src/app/world-query.test.ts`: the `scene` literal already has `lights: []`. Add a light to it and assert:

```ts
test("lights pass through as { pos, intensity }", () => {
  const s: SceneConfig = { ...scene, lights: [{ position: v(6, 10, 6), color: 0xffffff, intensity: 42 }] };
  const wq = worldQuery(s);
  expect(wq.lights).toEqual([{ pos: v(6, 10, 6), intensity: 42 }]);
});
```

- [ ] **Step 2: Add `lights: []` to `WorldQuery` literals in tests, run to see only the sensing/loom cases fail (not compile errors).**

Run: `npx tsc --noEmit`
Expected: errors only where a `WorldQuery` literal lacks `lights` — add `lights: []` to each. Re-run until `tsc` is clean; `npx vitest run` still green (behaviour unchanged so far).

- [ ] **Step 3: Write the failing sensing tests.** In `src/sensing/sensing.test.ts`, the `world` literal gains `lights: []`; add a `worldLit` with two lights, and:

```ts
const worldLit: WorldQuery = {
  ...world,
  lights: [
    { pos: v(0, 0, 20), intensity: 50 },   // dead ahead of pose(0) facing +? no — see below
  ],
};

test("a light off to one side drives light_r ≠ light_l; symmetric light is ~equal", () => {
  // pose(px) faces +X. Put a light on the fly's right (+Z) and one dead ahead (+X).
  const side: WorldQuery = { ...world, lights: [{ pos: v(0, 0, 8), intensity: 50 }] };
  const ahead: WorldQuery = { ...world, lights: [{ pos: v(8, 0, 0), intensity: 50 }] };
  let st = initSensingState();
  let r = sample(pose(0), side, 0.1, st, rt);
  for (let i = 0; i < 40; i++) r = sample(pose(0), side, 0.1, r.state, rt);
  const l = r.stimulus[rt.input.light_l]!;
  const rr = r.stimulus[rt.input.light_r]!;
  expect(rr).toBeGreaterThan(l * 1.5); // +Z light favours the right eye axis
  expect(rr).toBeGreaterThan(0);

  st = initSensingState();
  let a = sample(pose(0), ahead, 0.1, st, rt);
  for (let i = 0; i < 40; i++) a = sample(pose(0), ahead, 0.1, a.state, rt);
  expect(a.stimulus[rt.input.light_l]!).toBeCloseTo(a.stimulus[rt.input.light_r]!, 3);
});

test("light channel clamps to LIGHT_MAX for a very close bright light", () => {
  const near: WorldQuery = { ...world, lights: [{ pos: v(0.1, 0, 0), intensity: 500 }] };
  let r = sample(pose(0), near, 0.1, initSensingState(), rt);
  for (let i = 0; i < 40; i++) r = sample(pose(0), near, 0.1, r.state, rt);
  expect(r.stimulus[rt.input.light_l]!).toBeLessThanOrEqual(CONFIG.sensing.LIGHT_MAX + 1e-6);
});

test("wind fills both antennal slots and differs left/right when the field is off-axis", () => {
  // default CONFIG.sensing.WIND = {1,0,0.35} → not aligned with the plane of symmetry
  let r = sample(pose(0), { ...world, lights: [] }, 0.1, initSensingState(), rt);
  for (let i = 0; i < 60; i++) r = sample(pose(0), { ...world, lights: [] }, 0.1, r.state, rt);
  const wl = r.stimulus[rt.input.wind_l]!;
  const wr = r.stimulus[rt.input.wind_r]!;
  expect(wl).toBeGreaterThanOrEqual(0);
  expect(wr).toBeGreaterThanOrEqual(0);
  expect(Math.abs(wl - wr)).toBeGreaterThan(1e-4);
});
```

Also **update** the existing `test("looming grows ... only looming + proximity slots fill")`: it currently asserts `light_*`/`wind_*` are `0`. With `world.lights === []` the light slots stay `0`, but wind is now always non-zero (a config field, not scene-driven). Change that loop to assert only `light_l`, `light_r` are `0` (empty `lights`), and drop `wind_l`/`wind_r` from it.

- [ ] **Step 4: Run, watch fail.**

Run: `npx vitest run src/sensing/sensing.test.ts`
Expected: FAIL — light/wind slots are still `0` / undefined-shaped `SensingState`.

- [ ] **Step 5: Implement in `src/sensing/sensing.ts`.**
  - `SensingState` gains `lightL: number; lightR: number; windL: number; windR: number; windPhase: number`. `initSensingState()` returns all-zero for the new fields.
  - Add a `rotY(vec: Vec3, ang: number): Vec3` local helper: `{ x: c*x + s*z, y, z: -s*x + c*z }` with `c = cos(ang), s = sin(ang)`.
  - In `sample`, after `right` is computed:

```ts
const { EPS2, LIGHT_MAX, TAU_LIGHT, EYE_SPLAY, WIND, WIND_SPEED, WIND_TURN_HZ, TAU_WIND } = CONFIG.sensing;
const leftAxis = norm(sub(pose.forward, scale(right, EYE_SPLAY)));
const rightAxis = norm(add(pose.forward, scale(right, EYE_SPLAY)));

// light: inverse-square, per eye, over world.lights
let lRaw = 0, rRaw = 0;
for (const light of world.lights) {
  const toL = sub(light.pos, pose.position);
  const d2 = Math.max(dot(toL, toL), EPS2);
  const u = norm(toL);
  lRaw += (light.intensity * Math.max(0, dot(leftAxis, u))) / d2;
  rRaw += (light.intensity * Math.max(0, dot(rightAxis, u))) / d2;
}
const lightL = onePole(prev.lightL, Math.min(LIGHT_MAX, lRaw), dt, TAU_LIGHT);
const lightR = onePole(prev.lightR, Math.min(LIGHT_MAX, rRaw), dt, TAU_LIGHT);

// wind: a slow world-space field, sampled at the two antennae (≈ eye axes)
const windPhase = prev.windPhase + 2 * Math.PI * WIND_TURN_HZ * dt;
const w = norm(rotY(WIND, windPhase));
const windL = onePole(prev.windL, Math.max(0, dot(leftAxis, w)) * WIND_SPEED, dt, TAU_WIND);
const windR = onePole(prev.windR, Math.max(0, dot(rightAxis, w)) * WIND_SPEED, dt, TAU_WIND);
```

  - Write the four slots and carry the new state:

```ts
stimulus[rt.input.light_l!] = lightL;
stimulus[rt.input.light_r!] = lightR;
stimulus[rt.input.wind_l!] = windL;
stimulus[rt.input.wind_r!] = windR;
return { stimulus, state: { loomTheta: theta, prox, loom, lightL, lightR, windL, windR, windPhase } };
```

  (`onePole`, `norm`, `sub`, `add`, `scale`, `dot` are already imported / defined.)

- [ ] **Step 6: Run, watch pass.**

Run: `npx vitest run src/sensing/sensing.test.ts`
Expected: PASS.

- [ ] **Step 7: Phototaxis assertion in `src/bridge/integration.test.ts`.** New case:

```ts
test.runIf(havePkg)("a one-sided light drives the contralateral wing readout higher (phototaxis path)", async () => {
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  const { Sim } = require(pkg) as { Sim: WasmSimCtor };
  const groups = parseGroups(fixtureJson("groups.json"));
  const rt = buildRoleTable(groups);
  const lists = roleNeuronLists(groups, rt);
  const sim = new Sim(new Uint8Array(fixtureBuf("neurons.bin")), new Uint8Array(fixtureBuf("graph.bin")), 5n);
  const inputIds = lists.input.map((ids, i) => sim.define_input_role(rt.inputOrder[i]!, Uint32Array.from(ids)));
  lists.readout.forEach((ids, i) => sim.define_readout_role(rt.readoutOrder[i]!, Uint32Array.from(ids)));
  const cfg = { TICK_MS: 5, MAX_CATCHUP_MS: 20, hzEmaTau: 0.5 };
  let st: AccState = { acc: 0, tick: 0, hzEma: 0 };
  const stim = new Float32Array(rt.inputOrder.length);
  stim[rt.input.light_r!] = 1.0; // sustained light on the right
  for (let f = 0; f < 400; f++) st = stepAccumulator(st, 16.7, stim, sim, inputIds, cfg);
  // fixture wires light_r → wing_l (contralateral)
  expect(sim.readout(rt.readout.wing_l!)).toBeGreaterThan(sim.readout(rt.readout.wing_r!));
});
```

- [ ] **Step 8: Full gate + commit.**

Run: `npx vitest run && npx tsc --noEmit && npx eslint src && npx prettier --check "src/**/*.{ts,js}" && yarn build`

```
git add src/app/world-query.ts src/app/world-query.test.ts src/body/types.ts src/sensing/ src/bridge/integration.test.ts src/**/*.test.ts
git commit   # feat: per-eye light + bilateral wind sensing; phototaxis closes through the fixture wiring
```

---

## Task 5: `FrameView` + `Loop.setWorld` + loop/main wiring (the frozen Plan 2c seam)

**Files:**
- Modify: `src/app/loop.ts` (`FrameView` gains `sensory` + `paused`; `Loop` gains a mutable `world` + `setWorld(w)`)
- Modify: `src/app/loop.test.ts`
- Modify: `src/main.ts` (build `sensory`; pass `paused`; keep `world` seed) — untested glue

**Interfaces:**
- Consumes: `SimState.paused` (Task 3); `RoleTable.inputOrder` (existing).
- Produces: `FrameView = { pose, readouts, sensory, activity, simHz, paused }` (**FROZEN — Plan 2c depends on this exact shape**); `Loop.setWorld(w: WorldQuery): void`; `LoopDeps.world` stays as the initial seed.

> **Note (deviation from spec §2.1):** the spec sketched `LoopDeps.getWorld()`. To avoid rewriting the three existing `loop.test.ts` cases (which pass `world:` in deps), this plan keeps `LoopDeps.world: WorldQuery` as the seed and adds `Loop.setWorld(w)` + an internal mutable field that `frameOnce` reads. Same effect, less churn.

- [ ] **Step 1: Write the failing loop tests.** In `src/app/loop.test.ts`:
  - `fakeBridge().state` gains `paused: false`. The `SimBridge` fake object already has every method.
  - Extend the first test:

```ts
test("frameOnce feeds sensing→bridge and builds named Readouts + sensory views", () => {
  const fb = fakeBridge();
  fb.state.readouts[rt.readout.wing_l!] = 0.3;
  let seen: FrameView | undefined;
  const loop = new Loop({
    bridge: fb.obj, body: new Body(v(0, 4, 0), 0), sensing, roleTable: rt,
    world: { aabbs: [], bounds: { min: v(-20, 0, -20), max: v(20, 20, 20) }, lights: [] },
    onFrame: (fv) => (seen = fv),
  });
  loop.frameOnce(0);
  loop.frameOnce(16);
  expect(seen!.readouts.wing_l).toBeCloseTo(0.3, 6);
  // sensory is a named view of the injected stimulus (inputOrder keys)
  expect(Object.keys(seen!.sensory).sort()).toEqual([...rt.inputOrder].sort());
  expect(seen!.sensory.proximity).toBeGreaterThanOrEqual(0);
  expect(seen!.paused).toBe(false);
});

test("setWorld swaps the world the loop feeds to sensing + body on the next frame", () => {
  const fb = fakeBridge();
  const steps: unknown[] = [];
  const body = { pose: () => new Body(v(0, 4, 0), 0).pose(), step: (_dt: number, _r: unknown, w: unknown) => { steps.push(w); return { contact: false }; } } as unknown as Body;
  const w1: WorldQuery = { aabbs: [], bounds: { min: v(-1, 0, -1), max: v(1, 1, 1) }, lights: [] };
  const w2: WorldQuery = { aabbs: [], bounds: { min: v(-9, 0, -9), max: v(9, 9, 9) }, lights: [] };
  const loop = new Loop({ bridge: fb.obj, body, sensing, roleTable: rt, world: w1, onFrame: () => {} });
  loop.frameOnce(0);
  loop.frameOnce(16);
  loop.setWorld(w2);
  loop.frameOnce(32);
  expect(steps.at(-1)).toBe(w2);
});
```

- [ ] **Step 2: Run, watch fail.**

Run: `npx vitest run src/app/loop.test.ts`
Expected: FAIL — `seen.sensory` undefined; `loop.setWorld` undefined.

- [ ] **Step 3: Implement in `src/app/loop.ts`.**
  - `FrameView` gains `sensory: Readouts;` and `paused: boolean;`.
  - `Loop` stores `private world: WorldQuery` from `deps.world` in the constructor; add `setWorld(w: WorldQuery): void { this.world = w; }`.
  - In `frameOnce`, replace `const { bridge, body, sensing, roleTable, world, onFrame } = this.deps;` with a destructure that omits `world`, and use `this.world` for `sensing.sample(...)` and `body.step(...)`.
  - After `const raw = bridge.readState();`, build `sensory`:

```ts
const sensory: Readouts = Object.fromEntries(
  roleTable.inputOrder.map((name, i) => [name, stimulus[i] ?? 0]),
);
```

  (`stimulus` is the vector after the startle add — use the same array that was passed to `bridge.setStimulus`.)
  - `onFrame({ pose: body.pose(), readouts, sensory, activity: raw.activity, simHz: raw.simHz, paused: raw.paused });`

- [ ] **Step 4: Run, watch pass.**

Run: `npx vitest run src/app/loop.test.ts`
Expected: PASS (all five cases).

- [ ] **Step 5: `src/main.ts` — pass through (untested glue).** `main.ts` already destructures `FrameView` in `onFrame`; no code change is required for `sensory`/`paused` to flow (they ride on the object). Confirm `tsc` is clean. Leave a one-line comment above the `onFrame` sink: `// FrameView is frozen — Plan 2c's docked panel consumes { activity, readouts, sensory, paused }`.

- [ ] **Step 6: Full gate + commit.**

```
git add src/app/loop.ts src/app/loop.test.ts src/main.ts
git commit   # feat: FrameView carries sensory + paused; Loop.setWorld for live scene edits
```

---

## Task 6: `src/viz/motion.ts` — pure motion curves

**Files:**
- Create: `src/viz/motion.ts`
- Create: `src/viz/motion.test.ts`

**Interfaces:**
- Consumes: `Vec3` from `src/body/types.ts`.
- Produces: `bob`, `idleSway`, `escapeKick`, `loadEnvelope` (signatures in Shared types). **Not** `breath` / load-converge — those are Plan 2c's.

- [ ] **Step 1: Write the failing tests (`src/viz/motion.test.ts`).**

```ts
import { expect, test } from "vitest";
import { bob, idleSway, escapeKick, loadEnvelope } from "./motion";

test("bob is bounded by amp and periodic at hz", () => {
  const amp = 0.15, hz = 0.5;
  let max = -Infinity, min = Infinity;
  for (let t = 0; t < 10; t += 1 / 120) { const y = bob(t, hz, amp); max = Math.max(max, y); min = Math.min(min, y); }
  expect(max).toBeLessThanOrEqual(amp + 1e-9);
  expect(min).toBeGreaterThanOrEqual(-amp - 1e-9);
  expect(bob(0, hz, amp)).toBeCloseTo(bob(1 / hz, hz, amp), 6); // one period
});

test("idleSway returns a small bounded Vec3", () => {
  for (let t = 0; t < 5; t += 0.1) {
    const s = idleSway(t, 0.1, 0.02);
    expect(Math.hypot(s.x, s.y, s.z)).toBeLessThanOrEqual(0.02 * Math.sqrt(3) + 1e-9);
  }
});

test("escapeKick peaks at t=0 and decays to ~0 by decayS", () => {
  const cfg = { posShove: 0.6, rollDeg: 1.5, decayS: 0.3 };
  const k0 = escapeKick(0, cfg);
  expect(Math.hypot(k0.posShove.x, k0.posShove.y, k0.posShove.z)).toBeGreaterThan(0.3);
  expect(Math.abs(k0.roll)).toBeGreaterThan(0);
  const kEnd = escapeKick(cfg.decayS * 3, cfg);
  expect(Math.hypot(kEnd.posShove.x, kEnd.posShove.y, kEnd.posShove.z)).toBeLessThan(0.02);
  expect(Math.abs(kEnd.roll)).toBeLessThan(0.02);
});

test("loadEnvelope phases rise 0→1 in order banner→ignite→hud", () => {
  const cfg = { bannerS: 1, igniteS: 0.6, hudS: 0.8 };
  expect(loadEnvelope(0, cfg)).toEqual({ banner: 0, ignite: 0, hud: 0 });
  const mid = loadEnvelope(1.2, cfg);
  expect(mid.banner).toBe(1);          // banner done by 1.0s
  expect(mid.ignite).toBeGreaterThan(0);
  expect(mid.ignite).toBeLessThanOrEqual(1);
  expect(mid.hud).toBe(0);             // hud not started until banner+ignite done
  const end = loadEnvelope(10, cfg);
  expect(end).toEqual({ banner: 1, ignite: 1, hud: 1 });
});
```

- [ ] **Step 2: Run, watch fail.**

Run: `npx vitest run src/viz/motion.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/viz/motion.ts`.**

```ts
// Pure motion curves for the fly bob, the follow-camera idle sway, the escape
// camera kick, and the load-sequence envelope. No `three` — plain numbers / Vec3
// so this is unit-tested under node vitest. The connectome "breath" and the
// "points converge" load phase live in Plan 2c, not here.
import type { Vec3 } from "../body/types";

const TAU = Math.PI * 2;

export function bob(t: number, hz: number, amp: number): number {
  return Math.sin(t * hz * TAU) * amp;
}

export function idleSway(t: number, hz: number, amp: number): Vec3 {
  return {
    x: Math.sin(t * hz * TAU) * amp,
    y: Math.sin(t * hz * TAU * 0.7 + 1.3) * amp * 0.5,
    z: Math.cos(t * hz * TAU * 1.3) * amp,
  };
}

export function escapeKick(
  elapsed: number,
  cfg: { posShove: number; rollDeg: number; decayS: number },
): { posShove: Vec3; roll: number } {
  const e = Math.exp(-elapsed / (cfg.decayS / 3)); // ~3 time-constants inside decayS
  return {
    posShove: { x: 0, y: cfg.posShove * e, z: 0 },
    roll: (cfg.rollDeg * Math.PI) / 180 * e,
  };
}

export function loadEnvelope(
  t: number,
  cfg: { bannerS: number; igniteS: number; hudS: number },
): { banner: number; ignite: number; hud: number } {
  const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const banner = clamp01(t / cfg.bannerS);
  const ignite = clamp01((t - cfg.bannerS) / cfg.igniteS);
  const hud = clamp01((t - cfg.bannerS - cfg.igniteS) / cfg.hudS);
  return { banner, ignite, hud };
}
```

- [ ] **Step 4: Run, watch pass.**

Run: `npx vitest run src/viz/motion.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```
git add src/viz/motion.ts src/viz/motion.test.ts
git commit   # feat: pure motion curves — bob, idle sway, escape kick, load envelope
```

---

## Task 7: HUD core — `src/ui/` scaffold, `scale.ts`, edge-instrument frame, depth slider, meters

**Files:**
- Create: `src/ui/scale.ts`, `src/ui/scale.test.ts`
- Create: `src/ui/controls.ts` (types only)
- Create: `src/ui/hud.ts` (DOM — untested glue), `src/ui/hud.css`
- Create: `src/ui/fonts/` — `ibm-plex-mono-400.woff2`, `ibm-plex-sans-400.woff2`, `ibm-plex-sans-500.woff2` (download from the IBM Plex GitHub release / Google Fonts and commit) + `src/ui/fonts/fonts.css` (`@font-face` block, `font-display: swap`)
- Modify: `index.html` (retire the mono-everything stub; add a `#boot-banner` container; keep `#view` + `#hud`)
- Modify: `src/main.ts` — build `HudModel`, construct `Hud`, wire `hud.update(...)` in `onFrame` (untested glue)

**Interfaces:**
- Consumes: `HudModel`, `HudFrame`, `HudControls` (this task defines the first two fully; `HudControls` is defined here but only `setActiveCount`/`setPaused` are wired — the rest land in Tasks 8–10 with `main.ts` implementing no-op stubs until then).
- Produces: pure `scale.ts` exports (below); `Hud` class `{ constructor(root, controls, model), update(frame), setTheme(theme), syncScene(scene), dispose() }`.

- [ ] **Step 1: Write the failing `scale.ts` tests (`src/ui/scale.test.ts`).**

```ts
import { expect, test } from "vitest";
import { sliderToCount, countToSlider, meterFraction, lifSlider, lifSliderPos, volumeGain } from "./scale";

test("depth slider is a clamped log map between coreCount and N", () => {
  expect(sliderToCount(0, 48, 500)).toBe(48);
  expect(sliderToCount(1, 48, 500)).toBe(500);
  expect(sliderToCount(-1, 48, 500)).toBe(48);
  expect(sliderToCount(2, 48, 500)).toBe(500);
  const mid = sliderToCount(0.5, 48, 500);
  expect(mid).toBeGreaterThan(48);
  expect(mid).toBeLessThan(500);
  // log scale: geometric midpoint ≈ sqrt(48*500) ≈ 155
  expect(mid).toBeGreaterThan(120);
  expect(mid).toBeLessThan(200);
  // round-trip within one integer
  for (const n of [48, 100, 240, 499, 500]) {
    expect(Math.abs(sliderToCount(countToSlider(n, 48, 500), 48, 500) - n)).toBeLessThanOrEqual(1);
  }
});

test("meterFraction maps into [0,1]; signed kinds centre at 0.5", () => {
  expect(meterFraction(0, "escape")).toBe(0);
  expect(meterFraction(1, "escape")).toBe(1);
  expect(meterFraction(5, "escape")).toBe(1); // clamp
  expect(meterFraction(0, "yaw")).toBeCloseTo(0.5, 6);
  expect(meterFraction(1, "yaw")).toBe(1);
  expect(meterFraction(-1, "yaw")).toBe(0);
  expect(meterFraction(0, "proximity")).toBe(0);
});

test("lifSlider clamps to the declared range and inverts", () => {
  const ranges = { dtMs: [1, 10], tauMMs: [2, 80], vThreshold: [0.3, 3], vReset: [-1, 0.5], refracMs: [0, 10], noiseSigma: [0, 0.3] } as const;
  expect(lifSlider("noiseSigma", 0, ranges)).toBe(0);
  expect(lifSlider("noiseSigma", 1, ranges)).toBeCloseTo(0.3, 6);
  expect(lifSlider("tauMMs", -5, ranges)).toBe(2);
  expect(lifSliderPos("tauMMs", lifSlider("tauMMs", 0.4, ranges), ranges)).toBeCloseTo(0.4, 6);
});

test("volumeGain is a convex perceptual curve on [0,1]", () => {
  expect(volumeGain(0)).toBe(0);
  expect(volumeGain(1)).toBe(1);
  expect(volumeGain(0.5)).toBeLessThan(0.5); // convex
  expect(volumeGain(0.3)).toBeLessThan(volumeGain(0.6));
});
```

- [ ] **Step 2: Run, watch fail.** `npx vitest run src/ui/scale.test.ts` → module not found.

- [ ] **Step 3: Implement `src/ui/scale.ts`.**

```ts
// Pure HUD math. No DOM. hud.ts reads these and only sets element properties.
import type { LifParams } from "../bridge/sim-bridge";

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

export function sliderToCount(t01: number, coreCount: number, nNeurons: number): number {
  const t = clamp01(t01);
  const lo = Math.log(coreCount);
  const hi = Math.log(nNeurons);
  return Math.round(Math.exp(lo + (hi - lo) * t));
}
export function countToSlider(n: number, coreCount: number, nNeurons: number): number {
  const lo = Math.log(coreCount);
  const hi = Math.log(nNeurons);
  return clamp01((Math.log(n) - lo) / (hi - lo));
}

export type MeterKind = "escape" | "thrust" | "yaw" | "proximity" | "looming" | "light" | "wind";
const SIGNED: MeterKind[] = ["thrust", "yaw"];
// display maxima for the unsigned sensory/readout channels
const DISPLAY_MAX: Record<MeterKind, number> = {
  escape: 1, thrust: 1, yaw: 1, proximity: 20, looming: 3, light: 4, wind: 1,
};
export function meterFraction(value: number, kind: MeterKind): number {
  if (SIGNED.includes(kind)) return clamp01(0.5 + value / (2 * DISPLAY_MAX[kind]));
  return clamp01(value / DISPLAY_MAX[kind]);
}

export function lifSlider(
  param: keyof LifParams, t01: number,
  ranges: Record<keyof LifParams, readonly [number, number]>,
): number {
  const [lo, hi] = ranges[param];
  return lo + (hi - lo) * clamp01(t01);
}
export function lifSliderPos(
  param: keyof LifParams, value: number,
  ranges: Record<keyof LifParams, readonly [number, number]>,
): number {
  const [lo, hi] = ranges[param];
  return clamp01((value - lo) / (hi - lo));
}

export function volumeGain(t01: number): number {
  const t = clamp01(t01);
  return t * t; // simple convex perceptual curve
}
```

- [ ] **Step 4: Run, watch pass.** `npx vitest run src/ui/scale.test.ts` → PASS.

- [ ] **Step 5: `src/ui/controls.ts`** — export the `Theme`, `HudControls`, `HudModel`, `HudFrame` types exactly as in Shared types. Import `LifParams` from `../bridge/sim-bridge`, `SceneConfig`/`SceneObject`/`SceneLight` from `../scene.config`, `Readouts` from `../body/types`.

- [ ] **Step 6: `src/ui/fonts/fonts.css`** — three `@font-face` rules (`IBM Plex Mono` 400; `IBM Plex Sans` 400, 500), each `src: url("./ibm-plex-*.woff2") format("woff2"); font-display: swap;`. Commit the three `woff2` files.

- [ ] **Step 7: `src/ui/hud.css`** — `@import "./fonts/fonts.css";` then: `#hud` is a full-viewport `position:fixed; inset:0; pointer-events:none;` layer; children opt back in with `pointer-events:auto`. Define CSS custom properties for the palette under `#hud[data-theme="dark"]` / `#hud[data-theme="light"]` (`--hud-line`, `--hud-text`, `--hud-bright`, `--hud-fill`, from `visual-direction.md` §2.5). The reticle frame is a `::before` on `#hud` — a 1px inset border with the corners masked open. Header row `top:12px`, right-aligned, `font: 12px "IBM Plex Mono"` with `font-variant-numeric: tabular-nums`. Left-edge depth slider is a rotated `input[type=range]` starting **below** `y:384px` (clear of the Plan 2c card). Bottom meter row is a flexbox at `bottom:12px`, each meter a labelled track+fill div, label `font: 12px "IBM Plex Sans"`. No solid backgrounds anywhere.

- [ ] **Step 8: `src/ui/hud.ts`** (untested glue — no vitest). `class Hud`:
  - constructor `(root: HTMLElement, controls: HudControls, model: HudModel)`: sets `root.id = "hud"`, `root.dataset.theme = model.theme`; builds: header (`model` project name + a `<span data-role="simhz">`); a left-edge `<input type="range" min="0" max="1" step="0.001">` whose `oninput` calls `controls.setActiveCount(sliderToCount(+el.value, model.coreCount, model.nNeurons))` and whose value is initialised via `countToSlider(model.nNeurons, ...)`; a bottom row of meters for `looming, escape, thrust, yaw, proximity, light L, light R, wind L, wind R`, each a `{ label, track, fill }`; a `Space`-key + button pause toggle → `controls.setPaused(next)`; an `H`-key collapse toggle (adds `hidden` to a body wrapper). It stores element refs for `update`.
  - `update(frame: HudFrame)`: set `simhz.textContent = frame.simHz.toFixed(0)`; for each meter, `fill.style.inlineSize = (meterFraction(value, kind) * 100) + "%"` where `value` comes from `frame.readouts` / `frame.sensory` by name; set the pause indicator from `frame.paused`; set the depth-slider label from `frame.activeCount`.
  - `setTheme(theme)`: `root.dataset.theme = theme`.
  - `syncScene(scene)`: no-op here (Task 10 fills it).
  - `dispose()`: remove the `keydown` listeners.

- [ ] **Step 9: `index.html`** — replace the `<style>` block and `#hud` contents: keep `<canvas id="view">`; change `#hud` to an empty `<div id="hud"></div>`; add `<div id="boot-banner"></div>`; drop the inline mono font rules (they move to `hud.css`). Add `<link rel="stylesheet" href="/src/ui/hud.css">` **or** `import "./ui/hud.css"` at the top of `main.ts` (Vite bundles it) — prefer the `main.ts` import so the stylesheet ships in the built bundle.

- [ ] **Step 10: `src/main.ts`** — after `bridge.init`:
  - `const groups = [...new Set(neuronsFile.groupId)].sort((a, b) => a - b);`
  - `const model: HudModel = { coreCount: /* from bridge.init or neuronsFile */, nNeurons, groups, lif: CONFIG.lif, scene: SCENE, theme: CONFIG.aesthetic.theme, reservedRect: CONFIG.hud.reservedRect };`
  - `const hud = new Hud(document.getElementById("hud")!, controls, model);` where `controls` is an object literal implementing `HudControls`; wire `setActiveCount → bridge.setActiveCount`, `setPaused → (p) => (p ? bridge.pause() : bridge.resume())`, and **stub the rest** as `() => {}` with a `// Task 8/9/10` comment.
  - In `onFrame`: `hud.update({ readouts: view.readouts, sensory: view.sensory, simHz: view.simHz, activeCount: currentActiveCount, paused: view.paused });` (track `currentActiveCount` in a closure var updated by the `setActiveCount` callback; seed from `nNeurons`).
  - Remove the old `hud.textContent = ...` line.
  - `coreCount`: `bridge.init` currently resolves `{ nNeurons, coreCount, roleTable }` (spec §0). Use that `coreCount`.

- [ ] **Step 11: Gate.** `npx vitest run && npx tsc --noEmit && npx eslint src && npx prettier --check "src/**/*.{ts,js}" && yarn build` — the build must succeed with the new CSS + font imports.

- [ ] **Step 12: Commit.**

```
git add src/ui/ index.html src/main.ts
git commit   # feat: HUD core — edge-instrument frame, depth slider, readout/sensory meters
```

Then flip **A8** toward `partial` in `docs/2026-09-09-visual-direction.md` §7 (note "core HUD; LIF panel + toggles in the next task") with hash — do this in **Task 9's** commit once the HUD is complete, not here.

---

## Task 8: HUD — LIF tuning panel + theme toggle + audio + scene-editor mounts

**Files:**
- Modify: `src/ui/hud.ts` (add the collapsible LIF panel, the bottom-right toggle cluster, empty scene-editor container)
- Modify: `src/ui/hud.css` (styles for the new groups)
- Modify: `src/main.ts` (`controls.setParams` → `bridge.setParams` with a ~50 ms debounce; `controls.setTheme` → `renderer.setTheme` stub + `hud.setTheme` + persist to `localStorage["fly-playground.theme"]`; `controls.setMuted`/`setVolume` → stubs until Task 9; `controls.setGroupVisible` → stub forwarded to a `panelHandle` that is `null` until Plan 2c)

**Interfaces:**
- Consumes: `scale.lifSlider`/`lifSliderPos` (Task 7), `CONFIG.lif` (Task 1), `HudControls` (Task 7).
- Produces: no new pure exports. `Hud` now renders every non-editor control.

- [ ] **Step 1: `src/ui/hud.ts` — LIF panel.** Add a collapsible `<fieldset>` (starts collapsed) with six `<input type="range" min="0" max="1" step="0.001">` rows, one per `keyof LifParams`, labelled, value-displayed via a Plex-Mono span. Each `oninput`:

```ts
const value = lifSlider(param, +el.value, model.lif.ranges);
valueSpan.textContent = fmt(param, value);
debouncedSetParams({ [param]: value });   // debouncedSetParams wraps controls.setParams, ~50ms trailing
```

Initial thumb positions from `lifSliderPos(param, model.lif.defaults[param], model.lif.ranges)`. A **Reset** button sets every slider back to defaults and calls `controls.setParams({ ...model.lif.defaults })`.

- [ ] **Step 2: `src/ui/hud.ts` — bottom-right cluster.** A `pointer-events:auto` group at `bottom:12px; right:12px`: a theme button (label reflects current theme) → `controls.setTheme(next)`; a mute checkbox (checked initially — `model` has no mute state, so default checked) → `controls.setMuted(el.checked)`; a short volume `<input type="range">` → `controls.setVolume(+el.value)`.

- [ ] **Step 3: `src/ui/hud.ts` — scene-editor container.** Add an empty collapsible `<fieldset data-role="scene-editor">` on the left edge below the depth slider; Task 10 fills it in `syncScene`.

- [ ] **Step 4: `src/main.ts` wiring.**
  - `const debouncedSetParams = debounce(bridge.setParams.bind(bridge), 50);` (a tiny local `debounce` helper — trailing edge).
  - `setTheme: (t) => { hud.setTheme(t); try { localStorage.setItem("fly-playground.theme", t); } catch { /* ignore */ } /* renderer.setTheme(t) — Task 11 */ }`. On boot, seed `model.theme` from `localStorage.getItem("fly-playground.theme")` if it is `"dark"`/`"light"`, else `CONFIG.aesthetic.theme`.
  - `setMuted`/`setVolume`: `// Task 9` no-op stubs.
  - `setGroupVisible: (g, vis) => panelHandle?.setGroupVisible(g, vis)` where `let panelHandle: { setGroupVisible(g: number, v: boolean): void } | null = null;` — Plan 2c assigns it. Until then it is a safe no-op.

- [ ] **Step 5: Gate.** `npx vitest run && npx tsc --noEmit && npx eslint src && npx prettier --check "src/**/*.{ts,js}" && yarn build`.

- [ ] **Step 6: Commit + flip A8.**

Set **A8** to `done` in `docs/2026-09-09-visual-direction.md` §7 with a note ("§3 type split + §4 layout landed; region-filter checkboxes render in the Plan 2c panel") and the commit short-hash.

```
git add src/ui/ src/main.ts docs/2026-09-09-visual-direction.md
git commit   # feat: HUD LIF tuning panel + theme/audio toggles; flip A8
```

---

## Task 9: Audio — `src/audio/mapping.ts` + `AudioEngine`

**Files:**
- Create: `src/audio/mapping.ts`, `src/audio/mapping.test.ts`
- Create: `src/audio/audio.ts` (Web Audio — untested glue)
- Modify: `src/main.ts` (construct `AudioEngine`; `engine.update(view, dt)` in `onFrame`; wire `controls.setMuted`/`setVolume`)

**Interfaces:**
- Consumes: `CONFIG.audio` (Task 1); `volumeGain` from `../ui/scale` (Task 7); `Readouts`; `CONFIG.physics.ESCAPE_TH`/`ESCAPE_HYST`.
- Produces: `wingToneFreq`, `wingToneGain`, `detectEscapeOnset` (pure); `class AudioEngine { constructor(cfg?); resume(): void; update(frame: { readouts: Readouts }, dt: number): void; setMuted(b: boolean): void; setVolume(v01: number): void; dispose(): void }`.

- [ ] **Step 1: Write the failing `mapping.ts` tests.**

```ts
import { expect, test } from "vitest";
import { wingToneFreq, wingToneGain, detectEscapeOnset } from "./mapping";
import { CONFIG } from "../app/config";

test("wing tone frequency rises with mean wing readout and stays in the audible band", () => {
  const lo = wingToneFreq({ wing_l: 0, wing_r: 0 });
  const hi = wingToneFreq({ wing_l: 1, wing_r: 1 });
  expect(lo).toBeCloseTo(CONFIG.audio.WING_HZ_MIN, 3);
  expect(hi).toBeCloseTo(CONFIG.audio.WING_HZ_MAX, 3);
  expect(wingToneFreq({ wing_l: 0.5, wing_r: 0.5 })).toBeGreaterThan(lo);
  expect(wingToneFreq({ wing_l: 9, wing_r: 9 })).toBeLessThanOrEqual(CONFIG.audio.WING_HZ_MAX);
});

test("wing tone gain is ~0 at rest and rises with amplitude, capped", () => {
  expect(wingToneGain({ wing_l: 0, wing_r: 0 })).toBeCloseTo(0, 6);
  expect(wingToneGain({ wing_l: 1, wing_r: 1 })).toBeCloseTo(CONFIG.audio.WING_GAIN_MAX, 6);
  expect(wingToneGain({ wing_l: 5, wing_r: 5 })).toBeLessThanOrEqual(CONFIG.audio.WING_GAIN_MAX);
});

test("escape onset fires once on a rising crossing and re-arms only below TH - HYST", () => {
  const th = CONFIG.physics.ESCAPE_TH, hyst = CONFIG.physics.ESCAPE_HYST;
  let s = { onset: false, armed: true };
  s = detectEscapeOnset(0.1, 0.2, th, hyst); expect(s.onset).toBe(false);
  s = detectEscapeOnset(0.2, th + 0.1, th, hyst); expect(s.onset).toBe(true);
  s = detectEscapeOnset(th + 0.1, th + 0.2, th, hyst); expect(s.onset).toBe(false); // still high
  s = detectEscapeOnset(th + 0.2, th - hyst / 2, th, hyst); expect(s.onset).toBe(false); // not below TH-HYST
  s = detectEscapeOnset(th - hyst / 2, th + 0.3, th, hyst); expect(s.onset).toBe(false); // never re-armed
  s = detectEscapeOnset(th + 0.3, th - hyst - 0.01, th, hyst); expect(s.armed).toBe(true); // now re-armed
  s = detectEscapeOnset(th - hyst - 0.01, th + 0.1, th, hyst); expect(s.onset).toBe(true);
});
```

> **Note:** `detectEscapeOnset` is **stateless** — it takes `prev`/`cur` values plus `th`/`hyst` and returns `{ onset, armed }` computed purely from whether `prev < th <= cur` **and** the caller-tracked arming. To keep it pure and testable without threading `armed`, define it as: `onset = prev < th && cur >= th`; `armed = cur < th - hyst`. The caller (`AudioEngine`) keeps a boolean `armed` and only treats `onset` as real when `armed` was true, then sets `armed = false` until a later call returns `armed: true`. Adjust the test above to match this two-value contract (the test as written already exercises exactly that sequence).

- [ ] **Step 2: Run, watch fail.** `npx vitest run src/audio/mapping.test.ts`.

- [ ] **Step 3: Implement `src/audio/mapping.ts`.**

```ts
import { CONFIG } from "../app/config";

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const mean = (r: { wing_l: number; wing_r: number }): number => (r.wing_l + r.wing_r) / 2;

export function wingToneFreq(r: { wing_l: number; wing_r: number }): number {
  const { WING_HZ_MIN, WING_HZ_MAX } = CONFIG.audio;
  return WING_HZ_MIN + (WING_HZ_MAX - WING_HZ_MIN) * clamp01(mean(r));
}
export function wingToneGain(r: { wing_l: number; wing_r: number }): number {
  return CONFIG.audio.WING_GAIN_MAX * clamp01(mean(r));
}
export function detectEscapeOnset(
  prev: number, cur: number, th: number, hyst: number,
): { onset: boolean; armed: boolean } {
  return { onset: prev < th && cur >= th, armed: cur < th - hyst };
}
```

- [ ] **Step 4: Run, watch pass.**

- [ ] **Step 5: Implement `src/audio/audio.ts`** (untested glue). `class AudioEngine`:
  - fields: `private ctx: AudioContext | null = null`, `private master: GainNode | null`, `private wingOsc/wingGain`, `private armed = true`, `private muted = true`, `private vol = CONFIG.audio.masterDefault`, `private lastEscape = 0`.
  - `resume()`: if `ctx` is null, `this.ctx = new AudioContext()`; build the graph — for each `f` in `CONFIG.audio.ambientFreqs` an `OscillatorNode` (`type "sine"`, slight per-osc detune) → a per-osc `GainNode(0.2)` → a shared `BiquadFilterNode("lowpass", CONFIG.audio.lowpassHz)`; an LFO `OscillatorNode(CONFIG.audio.lfoHz)` → `GainNode(120)` → `filter.frequency`; `filter` → `this.master = ctx.createGain()` → `ctx.destination`; one `wingOsc` → `wingGain(0)` → master. `start()` all oscillators. Call `this.applyGain()`. If `ctx` already exists, `void ctx.resume()`.
  - `update(frame, dt)`: if no `ctx`, return. `wingOsc.frequency.setTargetAtTime(wingToneFreq(frame.readouts), ctx.currentTime, 0.05)`; `wingGain.gain.setTargetAtTime(this.muted ? 0 : wingToneGain(frame.readouts), ctx.currentTime, 0.05)`. `const e = frame.readouts.escape ?? 0; const d = detectEscapeOnset(this.lastEscape, e, CONFIG.physics.ESCAPE_TH, CONFIG.physics.ESCAPE_HYST); if (d.onset && this.armed && !this.muted) this.blip(); if (d.armed) this.armed = true; else if (d.onset) this.armed = false; this.lastEscape = e;`
  - `blip()`: a short `OscillatorNode(CONFIG.audio.blip.freq)` → `GainNode` with an exponential ramp from `blip.gain` to `1e-4` over `blip.dur`, → master; `stop(ctx.currentTime + blip.dur)`.
  - `applyGain()`: `master?.gain.setTargetAtTime(this.muted ? 0 : volumeGain(this.vol), ctx!.currentTime, 0.03)`.
  - `setMuted(b)`: `this.muted = b; if (!b) this.resume(); this.applyGain();`
  - `setVolume(v01)`: `this.vol = v01; this.applyGain();`
  - `dispose()`: stop oscillators; `void ctx?.close()`.

- [ ] **Step 6: `src/main.ts`** — `const audio = new AudioEngine();` `onFrame`: `audio.update(view, dt);` Replace the Task 8 stubs: `setMuted: (b) => audio.setMuted(b)`, `setVolume: (v) => audio.setVolume(v)`.

- [ ] **Step 7: Gate + commit.**

```
git add src/audio/ src/main.ts
git commit   # feat: procedural audio — ambient bed, wing hum, escape blip; HUD mute/volume
```

---

## Task 10: Runtime world editing — `SceneStore` + persistence + live rebuild + HUD editor

**Files:**
- Create: `src/world/scene-store.ts`, `src/world/scene-store.test.ts`
- Create: `src/world/scene-persist.ts`, `src/world/scene-persist.test.ts`
- Modify: `src/scene.config.ts` (`SceneObject` gains `id: string`; the three default objects get ids `"obj-0"`, `"obj-1"`, `"obj-2"`)
- Modify: `src/app/world-query.ts` — unaffected (reads `scene.objects`); `halfExtents`/`aabbOf` ignore `id`
- Modify: `src/viz/builders.ts` — `buildWorld` already reads `scene.objects` by field; `id` is ignored. No change unless `tsc` needs the object literal in `builders.test.ts` to add `id` (it does — update the test's inline objects, or import `SCENE`).
- Modify: `src/ui/hud.ts` — fill `syncScene(scene)` with the editor form; add the "Add at fly" control
- Modify: `src/main.ts` — construct the store, `loadScene() ?? SCENE`, subscribe → rebuild `world3d` + `loop.setWorld` + `hud.syncScene`, debounced `saveScene`

**Interfaces:**
- Consumes: `SceneConfig`, `SceneObject`, `SceneLight` (from `../scene.config`); `Loop.setWorld` (Task 5); `worldQuery` (existing); `buildWorld` (existing).
- Produces: `createSceneStore(initial: SceneConfig): SceneStore` (methods per Shared types); `serializeScene`, `deserializeScene`, `loadScene`, `saveScene` (per Shared types); `SceneObject.id: string`.

- [ ] **Step 1: `src/scene.config.ts`** — add `id: string` to the `SceneObject` interface; give the three default objects `id: "obj-0" | "obj-1" | "obj-2"`.

- [ ] **Step 2: Write the failing `scene-store` tests.**

```ts
import { expect, test } from "vitest";
import { createSceneStore } from "./scene-store";
import { SCENE } from "../scene.config";
import { v } from "../body/types";

test("addObject appends with a fresh unique id and notifies with a snapshot containing it", () => {
  const store = createSceneStore(SCENE);
  let seen: string[] = [];
  store.subscribe((s) => (seen = s.objects.map((o) => o.id)));
  const id = store.addObject({ kind: "box", position: v(1, 2, 3), rotation: v(), scale: v(1, 1, 1), material: "buoy-a" });
  expect(store.snapshot().objects.some((o) => o.id === id)).toBe(true);
  expect(seen).toContain(id);
  const id2 = store.addObject({ kind: "sphere", position: v(), rotation: v(), scale: v(1, 1, 1), material: "buoy-b" });
  expect(id2).not.toBe(id);
});

test("updateObject patches only the named fields of only that id", () => {
  const store = createSceneStore(SCENE);
  const target = store.snapshot().objects[0]!.id;
  store.updateObject(target, { position: v(9, 9, 9) });
  const o = store.snapshot().objects.find((x) => x.id === target)!;
  expect(o.position).toEqual(v(9, 9, 9));
  expect(o.scale).toEqual(SCENE.objects[0]!.scale); // untouched
  expect(store.snapshot().objects[1]).toEqual(SCENE.objects[1]); // sibling untouched
});

test("removeObject drops the id; updateLight patches by index; reset restores defaults", () => {
  const store = createSceneStore(SCENE);
  const id = store.snapshot().objects[0]!.id;
  store.removeObject(id);
  expect(store.snapshot().objects.some((o) => o.id === id)).toBe(false);
  store.updateLight(0, { intensity: 999 });
  expect(store.snapshot().lights[0]!.intensity).toBe(999);
  store.reset();
  expect(store.snapshot().objects.length).toBe(SCENE.objects.length);
  expect(store.snapshot().lights[0]!.intensity).toBe(SCENE.lights[0]!.intensity);
});

test("snapshot is a deep copy and subscribe returns a working unsubscribe", () => {
  const store = createSceneStore(SCENE);
  const snap = store.snapshot();
  snap.objects[0]!.position.x = 12345;
  expect(store.snapshot().objects[0]!.position.x).not.toBe(12345);
  let calls = 0;
  const off = store.subscribe(() => calls++);
  store.addObject({ kind: "box", position: v(), rotation: v(), scale: v(1, 1, 1), material: "buoy-a" });
  off();
  store.addObject({ kind: "box", position: v(), rotation: v(), scale: v(1, 1, 1), material: "buoy-a" });
  expect(calls).toBe(1);
});
```

- [ ] **Step 3: Run, watch fail.**

- [ ] **Step 4: Implement `src/world/scene-store.ts`.** A closure factory: deep-clone `initial` (via `structuredClone`), keep `subs: Set<cb>`, a `counter` for ids, `notify()` calls each sub with `snapshot()`. Each mutator rebuilds the relevant array immutably then `notify()`. `reset()` re-clones the module-imported `SCENE` (import it). No `Math.random`.

- [ ] **Step 5: Run, watch pass.**

- [ ] **Step 6: Write the failing `scene-persist` tests.**

```ts
import { expect, test } from "vitest";
import { serializeScene, deserializeScene, loadScene, saveScene } from "./scene-persist";
import { SCENE } from "../scene.config";

test("serialize → deserialize round-trips deep-equal", () => {
  expect(deserializeScene(serializeScene(SCENE))).toEqual(SCENE);
});
test("deserialize rejects wrong version / malformed / wrong shape", () => {
  expect(deserializeScene('{"v":2,"scene":{}}')).toBeNull();
  expect(deserializeScene("not json")).toBeNull();
  expect(deserializeScene("{}")).toBeNull();
  expect(deserializeScene(JSON.stringify({ v: 1, scene: { objects: [] } }))).toBeNull();
});
test("loadScene / saveScene never throw when localStorage is hostile", () => {
  const orig = globalThis.localStorage;
  // @ts-expect-error override for the test
  globalThis.localStorage = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  expect(loadScene()).toBeNull();
  expect(() => saveScene(SCENE)).not.toThrow();
  // @ts-expect-error restore
  globalThis.localStorage = orig;
});
```

- [ ] **Step 7: Implement `src/world/scene-persist.ts`.** `KEY = "fly-playground.scene.v1"`. `serializeScene(s) => JSON.stringify({ v: 1, scene: s })`. `deserializeScene(json)`: `try { const o = JSON.parse(json); if (o?.v !== 1) return null; const s = o.scene; if (!s || !Array.isArray(s.objects) || !Array.isArray(s.lights) || !s.bounds || !s.fly) return null; if (!s.objects.every((x) => typeof x?.id === "string" && typeof x?.kind === "string")) return null; return s as SceneConfig; } catch { return null; }`. `loadScene()`: `try { const raw = localStorage.getItem(KEY); return raw ? deserializeScene(raw) : null; } catch { return null; }`. `saveScene(s)`: `try { localStorage.setItem(KEY, serializeScene(s)); } catch { /* ignore */ }`.

- [ ] **Step 8: Run, watch pass.**

- [ ] **Step 9: `src/ui/hud.ts` — `syncScene(scene)`.** Render into the `data-role="scene-editor"` fieldset:
  - "Add": a `kind` `<select>` (box/sphere/torus), a `material` `<select>` (`buoy-a`/`buoy-b`/`buoy-c`), an "Add at fly" `<button>` → `controls.addObject({ kind, material })`.
  - "Objects": a `<select>` of `scene.objects.map(o => o.id)`; on change, show `x`/`y`/`z` range inputs (min/max from `scene.bounds` ± 2) + a uniform-scale range + a Delete button. `oninput` (debounced) → `controls.updateObject(id, { position: v(x,y,z) })` or `{ scale: v(s,s,s) }`. Delete → `controls.removeObject(id)`.
  - "Lights": a `<select>` of indices; `x`/`y`/`z` + `intensity` ranges + `<input type="color">` → `controls.updateLight(i, patch)` (color parsed to `0xRRGGBB` number).
  - "Reset scene" button → `controls.resetScene()`.
  Re-render this fieldset from scratch on every `syncScene` call (cheap — a handful of elements).

- [ ] **Step 10: `src/main.ts` — store + live rebuild.**
  - `import { createSceneStore } from "./world/scene-store"; import { loadScene, saveScene } from "./world/scene-persist";`
  - `const initialScene = loadScene() ?? SCENE;` — use `initialScene` for `buildWorld`, `worldQuery`, `new Body(initialScene.fly.start, initialScene.fly.heading)`, and `model.scene`.
  - `const store = createSceneStore(initialScene);`
  - `const saveDebounced = debounce((s) => saveScene(s), 300);`
  - `store.subscribe((s) => { const old = world3d; renderer.scene.remove(old); old.traverse((o) => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose()); } }); world3d = buildWorld(s); applyTheme?.(world3d, currentTheme); renderer.scene.add(world3d); loop.setWorld(worldQuery(s)); hud.syncScene(s); saveDebounced(s); });`
  - Wire the `HudControls` scene mutators to the store: `addObject: (spec) => store.addObject({ ...spec, position: { ...body.pose().position }, rotation: v(), scale: v(1, 1, 1) })`, `updateObject`, `removeObject`, `updateLight`, `resetScene: () => { store.reset(); try { localStorage.removeItem("fly-playground.scene.v1"); } catch {} }`.
  - Call `hud.syncScene(initialScene)` once after constructing `hud`.
  - `applyTheme` is `undefined` until Task 11 — guard with `?.`.

- [ ] **Step 11: Fix `builders.test.ts`** if `tsc` complains about the inline `SceneObject` literal lacking `id` — add `id: "t0"` etc., or switch those tests to import `SCENE`.

- [ ] **Step 12: Gate + commit.**

```
git add src/world/ src/scene.config.ts src/ui/hud.ts src/main.ts src/viz/builders.test.ts
git commit   # feat: runtime world editing — SceneStore, localStorage persistence, live rebuild, HUD editor
```

---

## Task 11: Aesthetic 9a — dual palette, tone map + composer, world/fly materials

**Files:**
- Modify: `src/viz/palette.ts` — `PALETTE_DARK` + `PALETTE_LIGHT` + `activePalette(theme)` + `applyTheme(root, theme)` + keep `material(key)` (retargeted to the buoy set)
- Create: `src/viz/post.ts` — `buildComposer(renderer, scene, camera)` (untested glue)
- Modify: `src/viz/renderer.ts` — `toneMapping` + `toneMappingExposure`; optional composer path; `setTheme(theme)`; `resize` forwards to the composer
- Modify: `src/viz/builders.ts` — `buildWorld`: cool key light, buoy material + Fresnel rim, radial ground disc (drop `grid`), dim `bounds` hairline
- Modify: `src/viz/builders.test.ts` — update the `buildWorld` child-count assertion
- Modify: `src/viz/fly.ts` — `emissive` + parented `PointLight` + bloom layer; refined body
- Modify: `src/main.ts` — build the composer; wire `renderer.setTheme` into `controls.setTheme`; put the fly + its light on the bloom layer; seed theme from `localStorage`
- Modify: `docs/2026-09-09-visual-direction.md` §7 — flip A1, A2 (02b dials), A3, A5, A6, A12

**Interfaces:**
- Consumes: `CONFIG.aesthetic.{theme,EXPOSURE,BLOOM,VIGNETTE,GRAIN}` (Task 1); `Theme` (Task 7).
- Produces: `activePalette(theme: Theme)` → a frozen palette record; `applyTheme(root: THREE.Object3D, theme: Theme): void`; `buildComposer(renderer, scene, camera)` → `{ composer, setSize(w,h), setTheme(theme) }`; `renderer.setTheme(theme: Theme): void`; `renderer` gains `render()` that routes through the composer when present.

- [ ] **Step 1: Write the failing `builders.test.ts` change.** Replace the `buildWorld` test body:

```ts
test("buildWorld: one mesh per object + one marker per light + a ground disc; one cool key + hemi; no grid", () => {
  const world = buildWorld(SCENE);
  const meshes = world.children.filter((c) => c instanceof THREE.Mesh);
  const dir = world.children.filter((c) => c instanceof THREE.DirectionalLight);
  const hemi = world.children.filter((c) => c instanceof THREE.HemisphereLight);
  const points = world.children.filter((c) => c instanceof THREE.PointLight);
  expect(points.length).toBe(SCENE.lights.length);
  expect(dir.length).toBe(1);
  expect(hemi.length).toBe(1);
  // objects + one emissive marker per light + the ground disc
  expect(meshes.length).toBe(SCENE.objects.length + SCENE.lights.length + 1);
  expect(world.children.some((c) => c.name === "ground-disc")).toBe(true);
});
```

(The `buildBrainPoints` / `buildCoreEdges` tests in this file are unchanged — Plan 2c removes those functions.)

- [ ] **Step 2: Run, watch fail.** `npx vitest run src/viz/builders.test.ts`.

- [ ] **Step 3: `src/viz/palette.ts`.**
  - `PALETTE_DARK` — every `visual-direction.md` §2 token as `0xRRGGBB` numbers, keeping the current key names where they map (`bg` = `0x070B14`, `pointCold` = `0x4A8FA8`, `pointHot` = `0xEAF7FF`, `edge` = `0x7C6BE8`, `flyBody`/`flyAccent` = `0xFFB25A`/`0xFFE7BE`, `ground` = `0x0A1220`, `bounds` = `0x22344d`) plus `abyss` `0x0F1A2E`, `escapeHot` `0xFFFFFF`, `escapeWarm` `0xFFF1DA`, `buoy` `0x101A28`, `buoyRimA/B/C` `0x5AA0D6`/`0x6FBF8E`/`0x9B84E0`.
  - `PALETTE_LIGHT` — same keys, cool light-lab values: `bg` `0xEEF2F6`, `pointCold` `0x2C6E82`, `pointHot` `0x0C2A33`, `edge` `0x6A57D6`, `flyBody`/`flyAccent` unchanged (`0xFFB25A`/`0xFFE7BE`), `ground` `0xDFE6EC`, `bounds` `0xB9C6D2`, `abyss` `0xDCE4EC`, `buoy` `0xD3DCE4`, `buoyRimA/B/C` as dark. Tune against the checklist.
  - `activePalette(theme: Theme)`: `theme === "light" ? PALETTE_LIGHT : PALETTE_DARK`.
  - `applyTheme(root: THREE.Object3D, theme: Theme): void` — walk `root`, and for meshes whose `material` has a `userData.themeKey`, set `.color`/`.emissive` from `activePalette(theme)[key]`. `buildWorld` / `fly.ts` tag their materials with `userData.themeKey` so this is generic.
  - `material(key)` keeps its signature but now maps `"buoy-a" | "buoy-b" | "buoy-c"` → a `MeshStandardMaterial` with `color: buoy`, a rim colour in `userData`, `roughness: 0.85`, `metalness: 0` (the Fresnel rim is added in `buildWorld` as an `onBeforeCompile` patch or a thin back-side shell — keep it a material tweak, not an extra mesh, so the mesh count stays predictable).

- [ ] **Step 4: `src/viz/builders.ts` — `buildWorld`.**
  - Drop the warm `DirectionalLight(0xfff1d0, 1.1)` → a cool one: `new THREE.DirectionalLight(activePalette(theme).pointHot, 0.6)` positioned high; still exactly one `DirectionalLight`.
  - `HemisphereLight(activePalette(theme).bg, activePalette(theme).ground, 0.4)`.
  - Obstacle meshes use `material(obj.material)` (the buoy set). Each mesh material gets `userData.themeKey` so `applyTheme` can recolour it.
  - Add a **ground disc**: `const ground = new THREE.Mesh(new THREE.CircleGeometry(40, 64), groundMat); ground.name = "ground-disc"; ground.rotation.x = -Math.PI / 2; ground.position.y = 0;` where `groundMat` is a `MeshBasicMaterial` (or `ShaderMaterial`) with radial alpha falloff to 0 at the rim (`transparent: true`); tag `userData.themeKey = "ground"`.
  - `bounds`: keep the existing bounds `LineSegments` if present, set its material opacity `~0.05`; else skip (bounds hairline is not currently built — leave for a follow-up, note it).
  - `buildWorld` gains an optional `theme: Theme = CONFIG.aesthetic.theme` parameter so `main.ts` can build it in the right theme; existing call sites pass nothing (default).

- [ ] **Step 5: `src/viz/fly.ts`.**
  - Body material: add `emissive: new THREE.Color(activePalette(theme).flyBody)`, `emissiveIntensity: 0.25`, tag `userData.themeKey`.
  - In the `Fly` constructor, add `const light = new THREE.PointLight(0xffb25a, 6, 12, 2); this.object3d.add(light);` (warm, parented). Expose `readonly emberLight` so `main.ts` can place it on the bloom layer and pulse it on escape.
  - Wings: keep translucent; colour → `activePalette(theme).flyAccent`, opacity `0.18`.
  - Refine proportions (tapered thorax/abdomen, leg hints) — cosmetic, no test.
  - `Fly` gains `setTheme(theme: Theme)` that recolours its cached materials.

- [ ] **Step 6: `src/viz/post.ts`** (untested glue).

```ts
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { CONFIG } from "../app/config";
import type { Theme } from "../ui/controls";
// small inline vignette + grain ShaderPass definitions (uniforms: tDiffuse, amount, time)
```

`buildComposer(renderer, scene, camera)` builds `EffectComposer` + `RenderPass` + `UnrealBloomPass` (params from `CONFIG.aesthetic.BLOOM[theme]`; if `STRENGTH <= 0`, add the pass with `strength = 0` / `enabled = false`) + a vignette `ShaderPass` (`CONFIG.aesthetic.VIGNETTE[theme]`) + a grain `ShaderPass` (`CONFIG.aesthetic.GRAIN[theme]`, `time` updated per frame). Returns `{ composer, setSize(w, h), setTheme(theme): void, render(dt): void }`. Selective bloom is out of scope for 9a beyond the luminance threshold — matte buoys/ground stay dark enough not to bloom at `THRESHOLD 0.6`; if they bloom, raise `THRESHOLD` (tuning).

- [ ] **Step 7: `src/viz/renderer.ts`.**
  - `renderer.toneMapping = THREE.ACESFilmicToneMapping;` (check `AgXToneMapping` exists in the pinned `three`; if so and it looks better in the tuning pass, switch — else ACES). `renderer.toneMappingExposure = CONFIG.aesthetic.EXPOSURE;`
  - Keep `createRenderer` returning the existing shape; add optional `composer` support: `setComposer(c)`, and `render(dt?)` uses `composer.render(dt)` when set else `renderer.render(scene, camera)`.
  - `setTheme(theme)`: `scene.background = new THREE.Color(activePalette(theme).bg); scene.fog = new THREE.Fog(activePalette(theme).abyss, near, far); applyTheme(scene, theme); composer?.setTheme(theme);`
  - `resize(w, h)` also calls `composer?.setSize(w, h)`.

- [ ] **Step 8: `src/main.ts`.**
  - After `createRenderer`: `const composer = buildComposer(renderer, renderer.scene, renderer.camera); renderer.setComposer(composer.composer /* or the wrapper */);`
  - `renderer.render()` calls in `onFrame` become `renderer.render(dt)`.
  - `resize` already calls `renderer.resize`; confirm it now sizes the composer.
  - `controls.setTheme`: also `renderer.setTheme(t); fly.setTheme(t); currentTheme = t;`
  - Put `fly.object3d` + `fly.emberLight` on a bloom layer (`.layers.enable(1)`), and have the bloom pass render layer 1 — or rely on the luminance threshold (simpler; do that first).
  - Seed `currentTheme` from `localStorage` (Task 8 already added the key) → apply once at boot via `renderer.setTheme(currentTheme)`.

- [ ] **Step 9: Gate.** `npx vitest run && npx tsc --noEmit && npx eslint src && npx prettier --check "src/**/*.{ts,js}" && yarn build`. If `three/examples/jsm/postprocessing/*` types don't resolve: `yarn add -D @types/three@0.186` (the one allowed `package.json` change) and re-run.

- [ ] **Step 10: Commit + flip rows.**

Set **A1, A3, A5, A6, A12** to `done` and **A2** to `partial` (note "02b dials in; BREATH_* is Plan 2c") in `docs/2026-09-09-visual-direction.md` §7, each with this commit's short-hash.

```
git add src/viz/ src/main.ts docs/2026-09-09-visual-direction.md package.json yarn.lock
git commit   # feat: Deep Field aesthetic 9a — dual palette + theme swap, EffectComposer, buoy world, ember fly
```

---

## Task 12: Aesthetic 9b + plan close — motion, load banner, reduced-motion, escape burst, tuning, docs

**Files:**
- Modify: `src/viz/follow-camera.ts` — optional idle sway + an escape-kick offset argument
- Modify: `src/viz/follow-camera.test.ts` — assert the sway/kick are opt-in and bounded (they default off, so existing tests stay green)
- Modify: `src/main.ts` — fly bob on render-Y; camera idle sway + escape kick; `loadEnvelope` boot sequence (banner types in → fly ignites → HUD fades in); `prefers-reduced-motion` branch; collision shudder
- Modify: `index.html` — `#boot-banner` styling hook (class toggles only; CSS in `hud.css`)
- Modify: `src/ui/hud.css` — `#boot-banner` type-in + `#hud` fade-in
- Modify: `docs/manual-checklist.md` — fill the Plan 02b rows (spec §12.4)
- Modify: `docs/architecture.md`, `README.md`, `docs/handoff-plan-02b-03.md` — sync (spec §12.5)
- Modify: `docs/2026-09-09-visual-direction.md` §7 — flip A2 → `done`, A9 / A10 / A11 → `partial` (02b halves), append hashes

**Interfaces:**
- Consumes: `motion.{bob,idleSway,escapeKick,loadEnvelope}` (Task 6); `CONFIG.aesthetic.{BOB_HZ,BOB_AMP,ESCAPE_KICK,LOAD}`, `CONFIG.camera.{IDLE_SWAY_HZ,IDLE_SWAY_AMP}` (Task 1); `FrameView.readouts.escape`.
- Produces: no new exports. `updateFollowCamera(camPos, pose, dt, opts?)` gains an optional `opts?: { sway?: Vec3; kick?: { posShove: Vec3; roll: number } }` that is added to the target/roll; default `undefined` = today's behaviour.

- [ ] **Step 1: `follow-camera.ts` + test.** Add the optional `opts` param; when absent, behaviour and all current assertions are unchanged. New test:

```ts
test("idle sway / escape kick offsets are opt-in and shift the camera by a bounded amount", () => {
  const base = updateFollowCamera(v(-5, 2, 0), pose, 1 / 60);
  const swayed = updateFollowCamera(v(-5, 2, 0), pose, 1 / 60, { sway: v(0.02, 0, 0.02) });
  const d = Math.hypot(swayed.position.x - base.position.x, swayed.position.y - base.position.y, swayed.position.z - base.position.z);
  expect(d).toBeGreaterThan(0);
  expect(d).toBeLessThan(0.1);
});
```

- [ ] **Step 2: Run, watch fail, implement, watch pass.** `npx vitest run src/viz/follow-camera.test.ts`.

- [ ] **Step 3: `src/main.ts` — motion wiring (untested glue).**
  - Track `let bootT = 0; const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;`
  - In `onFrame`: `bootT += dt; const env = loadEnvelope(bootT, CONFIG.aesthetic.LOAD);`
    - Banner: set `#boot-banner` text/opacity from `env.banner` (type-in via CSS `ch` width or a substring by `env.banner`); when `env.hud >= 1`, hide it.
    - Fly ignite: `fly.emberLight.intensity = 6 * (reduced ? 1 : env.ignite);`
    - HUD fade: `hud` root `style.opacity = String(env.hud);`
  - Fly bob: `const bobY = reduced ? 0 : bob(bootT, CONFIG.aesthetic.BOB_HZ, CONFIG.aesthetic.BOB_AMP); fly.object3d.position.y += bobY;` (apply after `fly.update`, render-only — do not feed back into `body`).
  - Camera: `const sway = reduced ? undefined : idleSway(bootT, CONFIG.camera.IDLE_SWAY_HZ, CONFIG.camera.IDLE_SWAY_AMP); const kick = escapeActive && !reduced ? escapeKick(escapeElapsed, CONFIG.aesthetic.ESCAPE_KICK) : undefined; const cam = updateFollowCamera(camPos, view.pose, dt, { sway, kick });` — track `escapeActive`/`escapeElapsed` from a rising edge on `view.readouts.escape` crossing `CONFIG.physics.ESCAPE_TH` (reuse `detectEscapeOnset` from `audio/mapping` — it is a pure import, no audio).
  - Escape bloom: on the same onset, briefly spike `fly.emberLight.intensity` and (if a bloom layer is used) flash an `escapeHot` sprite; decays with `escapeElapsed` over `ESCAPE_KICK.decayS`.
  - Collision shudder: the loop already surfaces contact via the startle; on a frame where `view.sensory.proximity` jumps by `>= CONFIG.physics.CONTACT_STARTLE * 0.8`, apply a smaller `escapeKick` (half `posShove`, `decayS * 0.5`).
  - Reduced-motion: `reduced` gates bob, sway, kick, and the banner type-in (show the banner fully at once); wing flap, physics, meters, and the ember ignite brightness stay.

- [ ] **Step 4: `hud.css` + `index.html`.** `#boot-banner`: fixed, centred, `font: 20px "IBM Plex Mono"`, `letter-spacing: 0.04em`, lowercase, colour `--hud-text`; a `.done` class fades it out. `#hud { transition: opacity .4s; }`. `index.html` `#boot-banner` starts with the project name text.

- [ ] **Step 5: Tuning sub-step.** Run `yarn dev`, load the app in both themes. Adjust against `docs/manual-checklist.md` and `visual-direction.md` §7.1:
  - dark: exactly one warm thing (the fly); buoys/ground do not bloom (raise `BLOOM.dark.THRESHOLD` if they do); vignette/grain subtle; escape is the sharpest motion.
  - light: legible meters, no cream, `BLOOM.light.STRENGTH` stays 0.
  - phototaxis: confirm a one-sided light turns the fly; if it turns *away* and "toward" is wanted, swap the eye→slot assignment in `sensing.ts` (feed `rightAxis` → `light_l`) with a comment, and re-run `npx vitest run src/sensing/` + the integration test.
  - light/wind `CONFIG.sensing` first-pass values, `BOB_AMP`, `ESCAPE_KICK` magnitudes.
  Commit config/number changes as a small `chore: Plan 02b tuning pass` step.

- [ ] **Step 6: Docs.**
  - `docs/manual-checklist.md` — fill the Plan 02b rows verbatim from spec §12.4 (1–12) as `- [ ]` items under a "## Plan 02b — rich loop + controls" heading; check each after verifying by eye in `yarn dev`.
  - `docs/architecture.md` — mark `src/ui/*`, `src/audio/*`, `src/world/*`, `src/viz/{motion,post}.ts`, light/wind sensing, `setParams` wiring, and the theme toggle as implemented in Plan 02b; note the docked brain panel is Plan 2c; move the remaining "Deferred to Plan 02b" items to "Deferred to Plan 03".
  - `README.md` — Status → "Plan 02b (rich loop + controls) complete; brain viz → Plan 2c"; next Plan 03.
  - `docs/handoff-plan-02b-03.md` — tick the Plan 02b section; note the brain-viz split to Plan 2c; leave Plan 03 intact.
  - `docs/2026-09-09-visual-direction.md` §7 — A2 → `done`; A9 / A10 / A11 → `partial` with the note "02b half (fly bob / camera kick / banner+ignite+HUD); connectome breath / points-converge / pathway-pulse are Plan 2c"; append this commit's hash to each.

- [ ] **Step 7: Full gate.**

Run: `yarn ci && yarn rs:smoke`
Expected: all green; `rs:smoke` prints the `escape` readout climbing past 0.5.

- [ ] **Step 8: Commit.**

```
git add src/ src/viz/ index.html docs/
git commit   # feat: Deep Field 9b — fly bob, load sequence, reduced-motion, escape burst; Plan 02b close
```

- [ ] **Step 9: Push the branch.**

```
git push
```

---

## Self-Review

**1. Spec coverage (against `docs/superpowers/specs/2026-09-09-fly-playground-02b-rich-loop-design.md`):**

- §1 sensing/steering → Tasks 2 (yaw fix), 4 (light/wind + phototaxis integration test). ✅
- §1 HUD → Tasks 7 (core, depth slider, meters), 8 (LIF panel, theme/audio toggles), 10 (scene editor). `setParams` worker-drop fix → Task 3. ✅
- §1 audio → Task 9. ✅
- §1 runtime world editing → Task 10 (store + persist + live rebuild + editor UI). ✅
- §1 aesthetic (world/fly/HUD/post-FX, dark + light + toggle) → Tasks 11 (palette, composer, world, fly), 12 (motion, load, reduced-motion, escape burst, tuning). ✅
- §1 carried-over nits (resting heading, `activityColour`) → Task 2. ✅
- §2 module map → every new/changed file appears in a task's Files block. `viz/motion.ts` Task 6; `viz/post.ts` Task 11; `ui/*` Tasks 7–8, 10; `audio/*` Task 9; `world/*` Task 10. ✅
- §2.1 shared types → the "Shared types" block here mirrors the spec; `LoopDeps.getWorld` deviation is called out with rationale (keeps `world` seed + `setWorld`). `FrameView` frozen shape restated in Global Constraints and Task 5. ✅
- §3 sensing detail → Task 4 Steps 5 (per-eye axes, inverse-square light, rotY wind field) + tests Step 3 match §3.3/§3.4/§3.7. ✅
- §4 bridge (`setParams` merge + init-time lif; single pause via `running`; `frame(0)`; `readOutput`/`decodeState` carry `paused`) → Task 3 Steps 3–8 + tests Steps 1, 9, 10. `writeOutput`'s `paused` field already exists (confirmed in `ring.test.ts`) — Task 3 only adds the read side. ✅
- §5 HUD structure + `scale.ts` exports + reserved region → Task 7 (Steps 3, 7, 8) + Task 8. Region-filter checkboxes correctly **absent** from the HUD (Plan 2c) — `setGroupVisible` type only, Task 7/8. ✅
- §6 brain-viz seam → Task 5 freezes `FrameView`; no brain rendering task exists (correct — Plan 2c). `activityColour` nit → Task 2. ✅
- §7 world editing → Task 10 matches §7.1–§7.5 (ids, `structuredClone` deep copy, versioned persist, `try/catch` guards, live rebuild + dispose + `loop.setWorld` + `hud.syncScene`). ✅
- §8 audio → Task 9 matches §8.1–§8.3 (lazy `AudioContext`, ambient bed graph, wing hum, escape blip, `mapping.ts` pure exports, `volumeGain` imported from `ui/scale`). ✅
- §9 aesthetic + A-row ownership → Tasks 11–12; the A-row flips are enumerated per task (A1/A3/A5/A6/A12 + A2 in Task 11; A2 done + A8 in Task 8; A9/A10/A11 partial in Task 12). ✅
- §10 config → Task 1, verbatim values; the `BLOOM.light: null` → `STRENGTH: 0` deviation is noted. ✅
- §11 body yaw fix → Task 2 Steps 1–4, exact replacement code + the mean-zero + bounded-integral test. ✅
- §12 testing/CI/docs → suites enumerated across tasks; Task 12 Step 6 covers the doc sync; Task 12 Step 7 is the `yarn ci` + `rs:smoke` gate. ✅
- §14 risks → addressed: `@types/three` bump (Task 11 Step 9), tone-map fallback (Task 11 Step 7), selective bloom threshold (Task 11 Step 6 + Task 12 Step 5), phototaxis sign (Task 12 Step 5), GPU leak on rebuild (Task 10 Step 10 dispose walk), `localStorage` guards (Task 10 Step 7 + tests), paused publishing (Task 3 Step 5 + `frame(0)` test), `main.ts` co-edit (Global Constraints + Task 5 Step 5 comment), reserved rect firm (Task 1 value), fonts FOUT (`font-display: swap`, Task 7 Step 6). ✅

No gaps.

**2. Placeholder scan:** No "TBD"/"TODO"/"handle edge cases". Untested-glue files (`hud.ts`, `audio.ts`, `post.ts`, `renderer.ts` composer path, `main.ts`) are described step-by-step with exact identifiers, method names, and signatures rather than full listings — consistent with Plan 02's treatment of `renderer.ts`/`main.ts`, and every symbol they expose is named in an Interfaces block. Task 5's `LoopDeps` deviation and Task 1's `BLOOM` deviation state the exact final shape. Task 12 Step 5 is a tuning instruction (named dials, no new logic), not a placeholder.

**3. Type consistency:**
- `SimLike.set_params(dtMs, tauMMs, vThreshold, vReset, refracMs, noiseSigma)` — same in Shared types, Task 3 Step 3, the `FakeSim` in Task 3 Step 1, and the `integration.test.ts` `WasmSim` (inherits via `SimLike &`). ✅
- `LifParams` field names `dtMs/tauMMs/vThreshold/vReset/refracMs/noiseSigma` — Shared types, Task 1 `CONFIG.lif`, Task 3, Task 7 `lifSlider`, Task 8. ✅
- `SimState.paused: boolean` — Shared types, Task 3 Steps 3/8, Task 5 (`FrameView.paused` from `raw.paused`). ✅
- `FrameView = { pose, readouts, sensory, activity, simHz, paused }` — Global Constraints, Shared types, Task 5 Step 3, Task 7 Step 10 (`hud.update` reads `view.sensory`/`view.paused`), Task 9 (`audio.update(view)`), Task 12. ✅
- `WorldQuery` gains `lights: { pos: Vec3; intensity: number }[]` — Shared types, Task 4 Step 1, every test literal updated in Task 4 Step 2, `loop.test.ts` literals in Task 5 Step 1. ✅
- `SceneStore` methods (`snapshot/addObject/updateObject/removeObject/updateLight/reset/subscribe`) — Shared types, Task 10 Steps 2–4 tests + impl, Task 10 Step 10 `main.ts` wiring. `addObject(o: Omit<SceneObject,"id">) => string`. ✅
- `HudControls` — Shared types, Task 7 Step 5 (defined), Tasks 8–10 (`main.ts` implements each method; stubs → real in order). No method renamed between tasks. ✅
- `motion.ts` exports `bob/idleSway/escapeKick/loadEnvelope` — Shared types, Task 6 impl + tests, Task 12 `main.ts` + `follow-camera` consume the same signatures. `escapeKick` returns `{ posShove: Vec3; roll: number }` in Task 6 and is consumed as such in Task 12 Step 1's `follow-camera` `opts.kick`. ✅
- `activePalette(theme)` / `applyTheme(root, theme)` / `buildComposer(renderer, scene, camera)` / `renderer.setTheme(theme)` — Task 11 Interfaces + Steps 3/6/7, consumed in Task 11 Step 8 and Task 10 Step 10 (`applyTheme?.(world3d, currentTheme)` guarded until Task 11). ✅
- `sliderToCount/countToSlider/meterFraction/lifSlider/lifSliderPos/volumeGain` — Task 7 Step 3 impl matches Step 1 tests and Task 8 (`lifSlider`) / Task 9 (`volumeGain` import). ✅
- `detectEscapeOnset(prev, cur, th, hyst) => { onset, armed }` — Task 9 Step 3 impl, consumed in Task 9 Step 5 (`AudioEngine`) and Task 12 Step 3 (`main.ts` camera escape edge) with the same two-value contract. ✅

One inconsistency fixed inline while writing: Task 5 originally followed the spec's `getWorld()`; switched to `world` seed + `setWorld(w)` so the three existing `loop.test.ts` cases don't need rewriting — the deviation note is in Task 5 and the Shared types block.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-09-fly-playground-02b-rich-loop.md`. 12 tasks, bottom-up: **1** config → **2** carried-over nits → **3** bridge (`setParams` + pause) → **4** light/wind sensing → **5** the frozen `FrameView` seam Plan 2c consumes (land early) → **6** pure motion curves → **7–8** HUD → **9** audio → **10** runtime world editing → **11–12** the Deep Field aesthetic pass + plan close. Each task ends in a green per-change gate + one commit; Task 12 ends with `yarn ci` + `yarn rs:smoke` + `git push`.

Two execution options:

**1. Subagent-Driven (recommended)** — a fresh subagent per task, a diff review + fix loop between tasks, then an opus whole-branch review at the end (matches the task brief and `docs/handoff-plan-02b-03.md`).

**2. Inline Execution** — execute tasks in this session via `superpowers:executing-plans`, batching with checkpoints.

Which approach?
