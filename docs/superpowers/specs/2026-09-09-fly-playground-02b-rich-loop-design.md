# fly-playground — Plan 02b design / spec: rich loop + controls

**Date:** 2026-09-09
**Status:** approved in brainstorming (all sections) — proceed to written-spec review, then writing-plans
**Parent design:** [`docs/2026-09-09-design.md`](../../2026-09-09-design.md) ·
companions [`architecture.md`](../../architecture.md) · [`neuron-model.md`](../../neuron-model.md)
**Aesthetic direction:** [`docs/2026-09-09-visual-direction.md`](../../2026-09-09-visual-direction.md)
("Deep Field") — the source of truth for the **dark theme**; its §7 status table (A1–A13) is
updated in the same commit as the code that lands each row. **Note:** the brain-viz rework (below)
invalidates Deep Field §0 / §5 (connectome-idle, brain-camera rows) / §6.3–§6.4 ("the fly flies
through the cloud"); **Plan 2c** owns revising those.
**Sibling plan:** **Plan 2c — docked brain panel** (own branch / own PR, owned by another
session). Plan 02b does **not** implement brain visualization; see §6.
**Plan 02 (app shell / minimal loop):** [`../plans/2026-09-09-fly-playground-02-app-shell.md`](../plans/2026-09-09-fly-playground-02-app-shell.md) ·
its spec [`2026-09-09-fly-playground-02-app-shell-design.md`](./2026-09-09-fly-playground-02-app-shell-design.md) §8
is the authoritative deferred-scope cut.
**Handoff notes:** [`docs/handoff-plan-02b-03.md`](../../handoff-plan-02b-03.md)

---

## 0. Where things stand (context on `main`)

Plan 02 shipped the minimal brain→fly loop in the browser on the synthetic fixture. On `main` now
(through `9c6ea39`), plus two follow-ups: `ffc7f93` (brain point cloud visibility fix — the cloud
is a `THREE.Group` at `CONFIG.aesthetic.brainCenter` × `brainScale`, opaque `NormalBlending`
"dark ink on light ground", `POINT_MAX` clamp) and `bec03d0` (softened points — `BASE_SIZE 1.5`,
`CORE_SIZE 3.0`, `POINT_MAX 14`, warm-ink `pointCold` `0x2b2724`, depth-fade dials
`POINT_DEPTH_NEAR/FAR/FADE`, `SRGBColorSpace` output). `9c6ea39` added
`docs/2026-09-09-visual-direction.md` ("Deep Field") and breadcrumb comments (no value changes)
in `palette.ts` / `config.ts`.

**Brain-viz rework (decided in this brainstorm):** the big fly-through point cloud is being
**removed** and replaced by a **small docked panel** with live per-neuron firing feeds. That work
is **Plan 2c**, a separate plan / branch / PR owned by another session. Plan 02b's only obligations
to it are the frozen per-frame data seam (§6) and leaving its screen region clear in the HUD.

Available now (unchanged by Plan 02b except where noted):

- **`SimBridge`** (`src/bridge/`): SAB ring-buffer transport (`sab-bridge.ts` + `ring.ts`) with a
  `postMessage` fallback (`pm-bridge.ts` + `protocol.ts`) behind one interface; `createSimBridge`
  picks by `crossOriginIsolated`. The worker (`sim.worker.ts` + `worker-core.ts` +
  `step-accumulator.ts`) owns the Plan-01 WASM `Sim`, runs a self-scheduled 200 Hz accumulator
  (`TICK_MS = 5`, re-injects the latched stimulus **every tick** — `Sim::step` swaps-and-clears
  the input buffer each tick), and publishes `{ readouts, activity, simHz, tick }`. `SimBridge`
  surface: `init`, `setStimulus(Float32Array)`, `readState() -> SimState`, `setActiveCount(n)`,
  `setParams(Partial<LifParams>)`, `pause`, `resume`, `reset`, `dispose`.
- **`sim/roles.ts`** — `groups.json` → `RoleTable` (`input`/`readout` name→index, `inputOrder`/
  `readoutOrder` = role names sorted ascending; the worker defines roles on the `Sim` in that
  order so the Rust role id equals the vector index).
- **`sensing/sensing.ts`** — pure `sample(pose, world, dt, prev, roleTable) -> { stimulus, state }`.
  Only `proximity` and `looming` are non-zero; each channel one-pole smoothed
  (`y += (x - y)(1 - exp(-dt/τ))`). `light_l/light_r/wind_l/wind_r` slots exist but are held zero.
- **`body/`** — `Body.step(dt, readouts, world) -> { contact }`. `wrench.ts`: `s = (wl+wr)/2` →
  lift (`GRAVITY*MASS + LIFT_K*(s - HOVER_S)`) + `CRUISE_THRUST`; `a = wl-wr` → `ROLL_K*a` roll +
  `YAW_A_K*a` yaw; `thrust`/`yaw_torque` trims; `escape` rising edge → one `ESCAPE_IMPULSE` along
  `norm(up+forward)` + `ESCAPE_LOCKOUT_S` lockout with hysteresis. `noise.ts` `ValueNoise` (seeded,
  cosine-interpolated, `NOISE_HZ`/`NOISE_AMP`). Correlated wing noise (`2cef944`): both wings share
  one sample so it perturbs `s` but cancels in `a`.
- **`viz/`** — `renderer.ts` (guarded `createRenderer`, one `WebGLRenderer`, `SRGBColorSpace`,
  `Fog`, no `EffectComposer`), `brain-material.ts` + `builders.ts buildBrainPoints/buildCoreEdges`
  + the brain `THREE.Group` in `main.ts` (**all removed by Plan 2c**), `geometry.ts` (pure;
  `activityColour` currently used **only by its own test**), `builders.ts buildWorld` (object
  meshes + `PointLight`s + markers + warm `DirectionalLight` "sun" + `HemisphereLight`, **no
  ground plane**), `fly.ts`, `follow-camera.ts` (critically-damped chase cam), `palette.ts` (cream
  placeholder + `material(key)`).
- **`app/`** — `config.ts` (`CONFIG`, `as const`; `aesthetic` has `grid: true`, `grain: false`),
  `loop.ts` (`Loop` — RAF orchestrator, `FrameView = { pose, readouts, activity, simHz }`, `world`
  captured at construction), `world-query.ts` (`worldQuery(scene) -> { aabbs, bounds }`).
- **`scene.config.ts`** — static `SCENE`: `bounds`, `objects[]` (one on the cruise path at
  `(9,4,0)`), `lights[]` (2 `PointLight`s), `fly: { start:(0,4,0), heading:0 }`. `SceneObject` has
  no id.
- **`main.ts`** — boot glue; tiny `#hud` text `sim NN Hz · NN fps`. Not unit-tested.
- **WASM `Sim`** (`crates/fly-sim/src/lib.rs`): `set_params(dt_ms, tau_m_ms, v_threshold, v_reset,
  refrac_ms, noise_sigma)` — `LifParams` default `from_ms(5.0, 20.0, 1.0, 0.0, 2.0, 0.02)`.
  `set_active_count(n)` clamps `[core_count, neuron_count]`, O(1). `activity_snapshot()` length =
  `active_count`.
- **Fixture** (`pipeline/out/fixture/`): 500 neurons, `core_count = 48`, `w_norm = 0.01`,
  `scale_factor = 1.0`. `NeuronsFile` carries `groupId: Uint16Array` (8 groups `g0..g7`), `pos`,
  `flags`. Input roles `looming` (0..7), `light_l` (8..11), `light_r` (12..15), `proximity`
  (16..19), `wind_l` (20..21), `wind_r` (22..23). Readout roles `escape` (24..31), `wing_l`
  (32..35), `wing_r` (36..39), `thrust` (40..43), `yaw_torque` (44..47). Wired: strong
  `looming → escape`; **weak `light_l → wing_r` / `light_r → wing_l`** (contralateral); sparse
  random background. No wired `thrust`/`yaw_torque` or strong `wind_* → motor` path.
- **Tooling**: `yarn ci` (full). Per-change gate (handoff): `npx vitest run && npx tsc --noEmit &&
  npx eslint src && npx prettier --check "src/**/*.{ts,js}" && yarn build`. vitest env `node`.
  Runtime dep: `three` 0.186.0 (pinned). Dev: `@types/three` 0.185.4, `@types/node`.
  `three/examples/jsm/postprocessing/{EffectComposer, RenderPass, ShaderPass, UnrealBloomPass}.js`
  (+ `shaders/FXAAShader.js`) ship inside the installed `three` with matching `@types/three`
  `.d.ts` stubs. **Branch off `main`; the maintainer merges + pushes — do not push.**

## 1. Goal of Plan 02b

Turn the minimal loop into the **rich loop + controls** (brain visualization excepted — that is
Plan 2c):

- **Sensing + steering** — per-eye `light_l/light_r` sensing that closes a sustained phototaxis
  turn through the existing fixture wiring; a bilateral `wind_l/wind_r` antennal channel from a
  slow vector field; and a fix for the resting-heading wander (~50°/15 s) by folding the
  yaw-torque noise into the mean-zero treatment `2cef944` gave the wings.
- **HUD** (`src/ui/`, new) — a faint edge-instrument overlay per `visual-direction.md` §3–§4:
  a vertical log-scale "depth" (neuron-count) control showing live `sim_hz`; readout meters
  (thrust / yaw / escape) + sensory meters (proximity / looming / light L·R / wind L·R); a live
  six-param LIF-tuning panel (and the fix for `sim.worker.ts` silently dropping `setParams`);
  region/class filter callbacks; theme + audio + pause controls. IBM Plex Mono for changing
  numbers, IBM Plex Sans for labels, self-hosted. The HUD leaves the docked brain panel's screen
  region (Plan 2c; rect TBD) clear.
- **Audio** (`src/audio/`, new) — a procedural ambient bed + reactive one-shots (escape blip,
  wingbeat hum), master mute/volume in the HUD, silent until the first user gesture.
- **Runtime world editing** — a UI to place an object / move a light at runtime, persisted to
  `localStorage`; the scene builder and collision world accept mutations, not just a one-time
  build.
- **Aesthetic pass** (`frontend-design`), **world + fly + HUD + post-FX only** — the dark theme is
  "Deep Field" (`visual-direction.md`: palette + token→code map §6.1, type §3, HUD layout §4,
  motion §5 minus the connectome rows, ordered post-FX stack §6.2). Plan 02b **also** ships a
  **light theme** — a cool light-lab variant that keeps Deep Field's *semantic* colour roles
  (region hues reserved, resting → spiking, pathway, event, one warm fly) — and a **runtime
  light/dark toggle** in the HUD. `theme` defaults to `dark`. Brain-cloud rows (A4, A7, A13, and
  the connectome parts of A2/A10/A11) belong to Plan 2c — §9 has the ownership table.
- Two carried-over Plan 02 review nits: the resting-heading wander (above) and the
  `activityColour` blue-channel dip (fix the 2-line ramp; the helper may be consumed by Plan 2c's
  panel).

### Non-goals for Plan 02b

- **Brain visualization of any kind** — the point cloud, its shader, core edges, per-segment edge
  glow, group show/hide *rendering*, a second/orbit camera, a docked inset or panel, and the
  "connectome breath" / "points converge on load" motion are **Plan 2c**. Plan 02b keeps only the
  data seam (§6) and the `HudControls.setGroupVisible` *type*.
- No real connectome data pipeline, no neuPrint mapping, no `W_NORM` tuning, no **remote** asset
  hosting or IndexedDB cache, no deploy target, no production COOP/COEP decision. (→ Plan 03)
- No bundle code-splitting / `manualChunks`. (→ Plan 03)
- No tonic brain drive — hover/cruise stay `body/` constants; keep the `LIFT_K*(s - HOVER_S)`
  form. (→ Plan 03)
- No glTF / external model assets, no audio-sample assets — fly, world, and ambient bed stay
  procedural. **Exception:** IBM Plex Mono + Sans are self-hosted as bundled `woff2` under
  `src/ui/fonts/` with an `@font-face` block — no npm font package, no remote font CDN.
- No `FlyControls` free-fly camera, no 3D transform gizmos in the scene editor.
- No jsdom / DOM test environment — vitest stays `environment: node`; HUD/audio DOM code is
  untested glue covered by typecheck + `vite build` + the manual checklist.
- No new runtime dependency. `three/examples/jsm/*` is part of the pinned `three`. `@types/three`
  may be bumped to a `0.186.x` (dev-only, types) if the `examples/jsm` sub-path types don't
  resolve — the sole allowed `package.json` change.

## 2. Module map

```
src/
  ui/                      NEW  — DOM HUD per visual-direction.md §3–§4; no framework, no runtime dep
    hud.ts                 Hud class: builds the edge-instrument DOM; update(HudFrame) per RAF; key H to collapse, Space to pause
    controls.ts            HudControls interface (callbacks main.ts implements) + HudModel/HudFrame/Theme types
    scale.ts               PURE + tested: log depth-slider map, meter normalise (+ looming warn-lerp), LIF ranges, volume curve
    hud.css                edge-reticle frame, hairlines over the void, no solid panels; theme via a [data-theme] attr
    fonts/                 IBM Plex Mono + Sans woff2 (self-hosted) + an @font-face partial imported by hud.css
  audio/                   NEW
    audio.ts               AudioEngine: lazy AudioContext, ambient bed, escape blip, wing hum, master gain/mute
    mapping.ts             PURE + tested: wingToneFreq/Gain, detectEscapeOnset, sliderToGain
  world/                   NEW
    scene-store.ts         PURE + tested: SceneStore — add/remove/update object, move/update light, snapshot(), subscribe()
    scene-persist.ts       PURE + tested: serializeScene / deserializeScene (versioned), loadScene/saveScene (localStorage-guarded)
  viz/
    post.ts                NEW  — buildComposer(renderer, scene, camera): EffectComposer + Render/Bloom/Vignette/Grain(/FXAA) passes; resize; setTheme
    motion.ts              NEW  — PURE + tested: bob(t), idleSway(t), escapeKick(elapsed), loadEnvelope(t) [banner/ignite/hud phases]
    geometry.ts            CHG  — activityColour blue-channel monotone fix (2 lines; keep the helper — Plan 2c may consume it)
    builders.ts            CHG  — buildWorld: buoy mats + Fresnel rims, cool key light (drop the warm "sun"), radial ground disc (no grid), dim bounds hairline
    renderer.ts            CHG  — toneMapping (ACES/AgX) + exposure; optional composer path via post.ts; setTheme(theme)
    palette.ts             CHG  — PALETTE_DARK (Deep Field §2 tokens) + PALETTE_LIGHT (cool light-lab, same roles), activePalette(theme), applyTheme(objects, theme)
    fly.ts                 CHG  — emissive `ember` + parented warm PointLight + bloom layer; refined procedural body; wing `ember-core` tint
    follow-camera.ts       CHG  — optional sub-degree idle sway + escape camera-kick hook (motion.ts)
    (brain-material.ts, builders.buildBrainPoints/buildCoreEdges)      UNCHANGED here — removed by Plan 2c
  sensing/
    sensing.ts             CHG  — light_l/light_r (per-eye), wind_l/wind_r (bilateral antennal); SensingState grows 4 accumulators + windPhase
  body/
    wrench.ts              CHG  — yaw jitter → finite-difference (mean-zero) noise; resting heading bounded
  bridge/
    sim.worker.ts          CHG  — handle "setParams"; single pause mechanism (worker `running` flag); publish while paused
    worker-core.ts         CHG  — setParams merges Partial<LifParams> → full vector, calls sim.set_params; drop pause/resume/paused
    sim-bridge.ts          CHG  — SimLike gains set_params(...); SimState gains `paused: boolean`
    ring.ts                CHG  — writeOutput writes PAUSED honestly; readOutput returns `paused`
    protocol.ts            CHG  — StatePayload / state message / decodeState carry `paused`
    pm-bridge.ts / sab-bridge.ts  CHG  — surface `paused` on readState()
  app/
    config.ts              CHG  — lif{defaults,ranges}; sensing light/wind; physics.YAW_JITTER_DT; audio; camera idle-sway;
                                  aesthetic: theme (default "dark"), motion + post-FX dials (§10, no BREATH_*), per-theme bloom, drop `grid`
    loop.ts                CHG  — FrameView gains `sensory` + `paused`; LoopDeps.getWorld() + Loop.setWorld(w)
    world-query.ts         CHG  — WorldQuery gains `lights: { pos: Vec3; intensity: number }[]`
  scene.config.ts          CHG  — SceneObject gains `id: string`; stays the default scene the store loads from
  main.ts                  CHG (co-edited with Plan 2c) — construct HUD / AudioEngine / SceneStore / composer; implement HudControls;
                                  rebuild world on edit; theme apply; load banner/ignite/HUD phases + reduced-motion (my parts)
index.html                 CHG  — retire the mono-everything stub; minimal shell + boot-banner container per visual-direction.md §3.1/§5
```

`main.ts` is a **shared touch-point**: Plan 2c owns the ~10 lines that delete the old brain
`THREE.Group` and construct/update the docked panel; Plan 02b owns HUD / audio / scene-store /
theme / load-banner wiring. Whoever merges first lays down the shared `loadEnvelope` clock;
the other hooks into it. Rebase around the first merge.

**Seam invariants (unchanged from Plan 02):**

- `src/bridge/`, `src/sensing/`, `src/body/`, `src/sim/`, `src/world/` never import `three`.
  `Vec3`/`Quat` stay plain structs; `THREE.*` conversion only in `src/viz/` and `main.ts`.
- `src/ui/` and `src/audio/` touch the DOM / Web Audio but never import `three` and never import
  `body/`/`bridge/` internals — they talk through `HudControls` / `AudioEngine` and `FrameView`.
- `src/viz/motion.ts` is pure math (no `three`) — the motion curves are unit-tested; `viz/`
  renderer/composer paths, `ui/hud.ts`, `audio/audio.ts`, `main.ts` stay untested glue.
- Determinism where it is cheap: no `Math.random` in `body/`, `sensing/`, `world/`,
  `viz/motion.ts`, or the step path. Yaw jitter stays seeded value-noise; `scene-store` ids are a
  counter. Wall-clock only in `loop.ts`, the worker scheduler, `audio.ts`, and the `viz/` render
  path.
- The Pilot seam: `body/` reads motor readouts for every role and never learns where the stimulus
  came from. Light/wind are just more non-zero slots in the same `StimulusVector`.

### 2.1 Shared types (additions / changes)

```ts
// src/app/world-query.ts  (WorldQuery gains lights; body/ ignores the new field)
export interface WorldQuery {
  aabbs: Aabb[];
  bounds: Aabb;
  lights: { pos: Vec3; intensity: number }[];   // NEW — for per-eye light sensing
}

// src/bridge/sim-bridge.ts
export interface SimLike {
  inject(roleId: number, value: number): void;
  step(ticks: number): void;
  readout(roleId: number): number;
  activity_snapshot(): Float32Array;
  set_params(                                    // NEW — matches the wasm Sim export
    dtMs: number, tauMMs: number, vThreshold: number,
    vReset: number, refracMs: number, noiseSigma: number,
  ): void;
}
export interface SimState {
  readouts: Float32Array;
  activity: Float32Array;
  simHz: number;
  tick: number;
  paused: boolean;                              // NEW — from the ring PAUSED int / PM payload
}

// src/app/loop.ts  — FrameView is FROZEN for Plan 2c's panel; do not reshape it
export interface FrameView {
  pose: Pose;
  readouts: Readouts;                           // name → value, from readoutOrder
  sensory: Readouts;                            // NEW — name → value, from inputOrder (the injected stimulus)
  activity: Float32Array;                       // per-neuron ~0..1, length = activeCount (existing)
  simHz: number;
  paused: boolean;                              // NEW
}
export interface LoopDeps {
  bridge: SimBridge; body: Body;
  sensing: { sample: typeof sample };
  roleTable: RoleTable;
  getWorld(): WorldQuery;                       // CHANGED from `world: WorldQuery` — re-read each frame for live edits
  onFrame(view: FrameView): void;
}
// Loop also exposes setWorld(w: WorldQuery) which updates what getWorld() returns.

// src/ui/controls.ts
export type Theme = "dark" | "light";           // default "dark" (Deep Field)
export interface HudControls {
  setActiveCount(n: number): void;
  setParams(p: Partial<LifParams>): void;
  setPaused(paused: boolean): void;
  setTheme(theme: Theme): void;
  setGroupVisible(groupId: number, visible: boolean): void;   // type owned here; the checkbox UI may live in Plan 2c's panel
  setMuted(muted: boolean): void;
  setVolume(v01: number): void;
  addObject(spec: { kind: SceneObject["kind"]; material: string }): void;   // placed at the fly's current position
  updateObject(id: string, patch: Partial<Pick<SceneObject, "position" | "scale">>): void;
  removeObject(id: string): void;
  updateLight(index: number, patch: Partial<SceneLight>): void;
  resetScene(): void;
}
export interface HudModel {          // one-time construction data
  coreCount: number; nNeurons: number;
  groups: number[];                  // sorted unique groupIds present in the fixture
  lif: { defaults: LifParams; ranges: Record<keyof LifParams, [number, number]> };
  scene: SceneConfig;                // initial objects/lights for the editor lists
  theme: Theme;
  reservedRect: { x: number; y: number; w: number; h: number };    // fractional — Plan 2c docked card to avoid; firm { 0.0125, 0.022, 0.156, 0.322 } (keep-clear ≈ 336×384 px)
}
export interface HudFrame {          // per-RAF refresh data
  readouts: Readouts; sensory: Readouts;
  simHz: number; activeCount: number; paused: boolean;
}

// src/world/scene-store.ts
export interface SceneStore {
  snapshot(): SceneConfig;                              // deep copy
  addObject(o: Omit<SceneObject, "id">): string;        // returns the new id
  updateObject(id: string, patch: Partial<Omit<SceneObject, "id">>): void;
  removeObject(id: string): void;
  updateLight(index: number, patch: Partial<SceneLight>): void;
  reset(): void;                                        // back to the default SCENE
  subscribe(cb: (s: SceneConfig) => void): () => void;  // unsubscribe fn; fires after every mutation
}

// src/world/scene-persist.ts
export interface PersistedScene { v: 1; scene: SceneConfig; }
export function serializeScene(s: SceneConfig): string;
export function deserializeScene(json: string): SceneConfig | null;   // null on bad version / parse / shape
export function loadScene(): SceneConfig | null;                      // localStorage-guarded (try/catch)
export function saveScene(s: SceneConfig): void;                      // localStorage-guarded; caller debounces

// src/viz/motion.ts  (pure; t is seconds)
export function bob(t: number, hz: number, amp: number): number;            // → world-Y offset in units, ≈ ±amp
export function idleSway(t: number, hz: number, amp: number): Vec3;         // sub-degree positional camera sway
export function escapeKick(elapsed: number, cfg: EscapeKickCfg): { posShove: Vec3; roll: number }; // decays ~0.3 s
export function loadEnvelope(t: number, cfg: LoadCfg): { banner: number; ignite: number; hud: number }; // 0..1 phases
// NOTE: the connectome-breath curve and the "points converge" load phase are Plan 2c's, not here.
```

## 3. Sensing — per-eye light + bilateral wind (`sensing/sensing.ts`)

### 3.1 `WorldQuery.lights`

`worldQuery(scene)` adds `lights: scene.lights.map(l => ({ pos: l.position, intensity:
l.intensity }))`. `body/` and `collision.ts` ignore it (structural extra field).

### 3.2 Per-eye axes

`right = norm(cross(pose.forward, pose.up))` (already computed for the proximity rays):

```
leftAxis  = norm(pose.forward - right * EYE_SPLAY)
rightAxis = norm(pose.forward + right * EYE_SPLAY)
```

`EYE_SPLAY` (`CONFIG.sensing`, first pass `0.6`).

### 3.3 Light channels

For each `world.lights[i]`: `toLight = light.pos - pose.position`; `d2 = max(dot(toLight,
toLight), EPS2)` (`EPS2 = EPS*EPS`); `u = norm(toLight)`;
`lRaw += intensity * max(0, dot(leftAxis, u)) / d2`; `rRaw` symmetric with `rightAxis`. Clamp each
to `[0, LIGHT_MAX]`, one-pole smooth with `TAU_LIGHT` (`prev.lightL` / `prev.lightR`). Write
`stimulus[rt.input.light_l]` / `[rt.input.light_r]`. First pass: `LIGHT_MAX = 4`,
`TAU_LIGHT = 0.12`. Final values are tuned in task 11 against the manual checklist.

### 3.4 Wind channels

A slow world-space field from config: `WIND` (first pass `{ x: 1, y: 0, z: 0.35 }`), yawing about
world `+Y` at `WIND_TURN_HZ` (first pass `0.03`) via `prev.windPhase` advanced by `dt`. Wind
*from* direction `w = norm(rotY(WIND, windPhase))`; `wlRaw = max(0, dot(leftAxis, w)) *
WIND_SPEED`, `wrRaw` symmetric. One-pole smooth with `TAU_WIND` (first pass `0.2`), `WIND_SPEED`
first pass `0.5` — tuned in task 11. Write `wind_l` / `wind_r`. The fixture has no strong
`wind → motor` path, so wind shows up mainly in the HUD meters — acceptable; the channel is here
for completeness.

### 3.5 Phototaxis behaviour (no `wrench.ts` change)

Light on the fly's right → `light_r > light_l` → fixture `light_r → wing_l` (contralateral) lifts
`wing_l` → `a = wing_l - wing_r > 0` → the existing `ROLL_K*a` roll + `YAW_A_K*a` yaw term turns
the fly. **Direction is whatever the frozen fixture wiring + the Plan-02 sign convention
produce.** If it reads as photophobic and "toward the light" is wanted, the tuning step swaps the
eye→slot assignment in `sensing.ts` (feed `rightAxis` response into `light_l`, `leftAxis` into
`light_r`) with a comment. The acceptance test asserts a **sustained yaw of consistent sign**
under a fixed off-axis light — not the sign.

### 3.6 `SensingState`

```ts
export interface SensingState {
  loomTheta: number; prox: number; loom: number;   // existing
  lightL: number; lightR: number;                  // NEW
  windL: number; windR: number; windPhase: number; // NEW
}
```

`initSensingState()` zeroes all of them.

### 3.7 Tests (`sensing/sensing.test.ts`, extended)

- Light dead ahead → `lightL ≈ lightR`; off to one side → `lightR > lightL` (or vice versa) by a
  hand-checked `dot`/`d2` margin; `LIGHT_MAX` clamp holds for a very close light; one-pole
  convergence to the analytic steady value over many constant-geometry steps.
- Wind off-axis → `windL ≠ windR`; symmetric wind → `windL ≈ windR`.
- Correct slot indices: `light_l/light_r/wind_l/wind_r` land where `rt.input` says; `proximity`
  and `looming` still populated; no other slot written.

## 4. Bridge — `setParams` end to end + one pause mechanism

### 4.1 `setParams`

- `SimLike` gains `set_params(dtMs, tauMMs, vThreshold, vReset, refracMs, noiseSigma)`.
- `WorkerCore` tracks a full `LifParams` object, initialised from `SimInitConfig.lif` merged over
  `CONFIG.lif.defaults`; on construction it calls `sim.set_params(...)` once with the resolved
  vector (so an init-time `lif` override takes effect — Plan 02 dropped it).
- `WorkerCore.setParams(p: Partial<LifParams>)` merges `p` into the tracked object and calls
  `sim.set_params(...)` with all six values.
- `sim.worker.ts` `onmessage`: add `else if (m.t === "setParams") core?.setParams(m.p)`.
- `PmBridge` / `SabBridge` already post `{ t: "setParams", p }` — unchanged.

### 4.2 One pause mechanism — the worker `running` flag

- Delete `WorkerCore.pause()`, `resume()`, the `paused` field, and the `if (!this.paused)` guard.
- `WorkerCore.frame(elapsedMs)` steps the accumulator only when `elapsedMs > 0`; it always builds
  and returns the current `readouts` + `activity` snapshot (a paused sim still renders its frozen
  state and meters).
- `sim.worker.ts` `loop()`: always publish every iteration; pass `core.frame(running ? elapsed :
  0)`. SAB path writes `paused: running ? 0 : 1` **unconditionally** (Plan 02's `running ? 0 : 1`
  was inside `if (running)` → always 0). PM path includes `paused` in the state payload.
- `ring.ts`: `writeOutput` stores `PAUSED` from `d.paused`; `readOutput` returns
  `paused: Atomics.load(control, PAUSED) !== 0`.
- `protocol.ts`: `StatePayload` + the `state` message + `decodeState` carry `paused: boolean`.
- `PmBridge.onMessage` / `SabBridge.readState` set `SimState.paused`.
- `pause()` / `resume()` on both bridges keep posting `{ t: "pause" }` / `{ t: "resume" }`; the
  worker sets `running` and re-seeds `lastTs` on resume.

### 4.3 Tests

- `bridge/worker-core.test.ts`: `setParams({ noiseSigma: 0.1 })` → fake records a `set_params`
  call `[5, 20, 1, 0, 2, 0.1]`; a follow-up `setParams({ vThreshold: 0.8 })` → `[5, 20, 0.8, 0,
  2, 0.1]` (merge, not reset); construction with `lif: { tauMMs: 30 }` → one `set_params` `[5, 30,
  1, 0, 2, 0.02]` before the first `frame`; `frame(0)` records zero `step` calls but still returns
  `readouts.length === readoutRoleIds.length` and a snapshot; old pause/resume asserts removed.
- `bridge/ring.test.ts`: `writeOutput({ paused: 1, ... })` → `readOutput().paused === true`;
  `paused: 0` → `false`; torn-read retry still returns last-good.
- `bridge/protocol.test.ts`: `encodeState`/`decodeState` round-trip includes `paused`.
- `bridge/sim-bridge.test.ts` (+ pm/sab): `setParams` forwards the partial verbatim;
  `readState().paused` reflects the last `pause()` / `resume()`.
- `bridge/integration.test.ts` (real wasm): after the escape ramp, `setParams({ noiseSigma: 0.15
  })` then a fixed step budget → mean `activity_snapshot()` rises measurably vs. the same budget
  at `noiseSigma: 0`; a sustained one-sided `light_r` inject drives `readout("wing_l") >
  readout("wing_r")` within a bounded tick count.

## 5. HUD (`src/ui/`) — per `visual-direction.md` §3–§4

### 5.1 Structure & test policy

`Hud` is a class: `new Hud(root, controls: HudControls, model: HudModel)` builds the DOM once;
`hud.update(frame: HudFrame)` runs every RAF from `main.ts`'s `onFrame` to refresh meter fills,
the `sim_hz` / active-count readout, and the pause indicator. `hud.syncScene(s)` refreshes the
editor lists after a scene mutation. `hud.setTheme(theme)` flips a `[data-theme]` attribute the
CSS keys off. `hud.dispose()` removes listeners.

**All computation lives in `scale.ts` (pure, unit-tested); `hud.ts` is declarative glue** — it
reads `scale.ts` outputs and sets `.style.*` / `.textContent` / `.checked` / `[data-theme]`. No
business logic in `hud.ts`. vitest stays `environment: node`; `hud.ts` + `hud.css` are covered by
`typecheck` + `vite build` + the manual checklist, same policy as `renderer.ts` / `main.ts`.

`scale.ts` exports (all pure):

```ts
sliderToCount(t01: number, coreCount: number, nNeurons: number): number   // log scale, rounded, clamped
countToSlider(n: number, coreCount: number, nNeurons: number): number     // inverse
meterFraction(value: number, kind: MeterKind): number                     // → [0,1] bar fill
loomingWarnColour(fraction: number): string                               // neuron → ember → escape-warm lerp (§2.3)
lifSlider(param: keyof LifParams, t01: number, ranges): number
lifSliderPos(param: keyof LifParams, value: number, ranges): number
volumeGain(t01: number): number                                          // perceptual curve, [0,1] → [0,1]
```

`MeterKind`: `escape` (0..1), `thrust`/`yaw` (signed → centre-out bar), sensory
`proximity`/`looming`/`light`/`wind` (each normalised against a `CONFIG`-declared display max).

### 5.2 Layout (`visual-direction.md` §4)

Faint capture-overlay instrumentation pushed to the **edges**; centre stays clear; no solid
panels — 1px `hud-line` hairlines and low-opacity text over the `void`, everything lifting to
`hud-bright` on hover/focus. Type: IBM Plex Mono for changing numbers
(`font-variant-numeric: tabular-nums`), IBM Plex Sans 400/500 sentence-case for labels — no
all-caps, no tracked eyebrows, no `→` on buttons.

- **Frame** — inset rectangle, corners open (ticks, not a closed box) — reads as a reticle.
- **Top strip, right-aligned** — project name (Plex Mono, dim) then live `sim_hz` (FPS behind a
  debug flag). *(Deviation from `visual-direction.md` §4, which puts the project name top-left:
  the Plan 2c docked card now owns the top-left corner — see §6 / `reservedRect`. Both header
  readouts move to the top-right group; flag this in the §7 A8 note.)*
- **Left edge** — the neuron-count control as a **vertical "depth" slider** (`core_count` bottom,
  full `N` top, log scale via `sliderToCount`/`countToSlider`); current value + live `sim_hz` sit
  by the thumb → `controls.setActiveCount(n)`.
- **Region/class filter checkboxes** — **not in the HUD.** They render in the Plan 2c docked
  panel; that panel imports `HudControls["setGroupVisible"]` (type owned here) and calls it.
- **Bottom row** — slim horizontal bars in one baseline row: `looming`, `escape`, `thrust`,
  `yaw`, then `proximity`, `light L`, `light R`, `wind L`, `wind R`. Track `hud-line`, fill
  `neuron`, **except `looming`** → `loomingWarnColour` as it climbs toward `ESCAPE_TH`. Labels
  Plex Sans, values Plex Mono.
- **Bottom-right** — theme toggle (`dark` ⇄ `light`) + master audio (mute checkbox — **starts
  muted** — + a short volume slider). Simple glyphs, not a UI kit.
- **Scene editor** — see §7.3; a collapsed group on the left edge or bottom-left cluster.
- **LIF tuning panel** — a collapsed group: six sliders (`dtMs`, `tauMMs`, `vThreshold`,
  `vReset`, `refracMs`, `noiseSigma`), ranges from `model.lif.ranges` via `lifSlider`, `oninput`
  debounced ~50 ms → `controls.setParams({ [param]: value })`, plus a **Reset** button →
  `controls.setParams(model.lif.defaults)`.
- **Reserved region** — the HUD places no interactive elements inside `model.reservedRect` (the
  Plan 2c docked card — a floating card hovering over the void, **top-left**, anchored 24px in
  from the frame-inset corner; card 300×348px, keep-clear region **x ≤ 336 px, y ≤ 384 px**; frac
  `{ x: 0.0125, y: 0.022, w: 0.156, h: 0.322 }` at a 1080p ref). The top-left is otherwise unused
  by the HUD (the header readouts sit top-right, the depth slider runs down the left edge *below*
  the card envelope).
- **Collapse** — key `H` (or a header tick) hides the whole overlay; `Space` pause mirrors its
  control. (No `C`/`B` keys — there is no second camera and no inset.)

### 5.3 `main.ts` wiring

`main.ts` builds `HudModel` (from `bridge.init` results + `parseNeurons` groupIds + `CONFIG.lif` +
the initial scene + `CONFIG.aesthetic.theme` + `CONFIG.hud.reservedRect`), constructs `Hud`, and
implements `HudControls` by delegating: `setActiveCount`→`bridge.setActiveCount`;
`setParams`→`bridge.setParams`; `setPaused`→`bridge.pause()/resume()` + local flag;
`setTheme`→`renderer.setTheme` + `applyTheme` + `hud.setTheme` + `post.setTheme`;
`setGroupVisible`→forwarded to the Plan 2c panel handle (or a no-op stub until 2c lands);
`setMuted`/`setVolume`→`AudioEngine` (first `setMuted(false)` → `engine.resume()`); scene mutators
→ `SceneStore`. `onFrame` calls `hud.update({ readouts, sensory, simHz, activeCount, paused })`.

### 5.4 Tests (`ui/scale.test.ts`)

- `sliderToCount(0, 48, 500) === 48`; `sliderToCount(1, 48, 500) === 500`; monotone;
  `countToSlider` inverts it within rounding; out-of-range `t` clamps.
- `meterFraction` → `[0,1]`, endpoints correct, signed kinds centre at `0.5`.
- `loomingWarnColour(0)` ≈ `neuron`, `loomingWarnColour(1)` ≈ `escape-warm`, monotone hue shift.
- `lifSlider` clamps to the range at `t=0`/`t=1`; `lifSliderPos` inverts it; `noiseSigma` range
  min `>= 0`.
- `volumeGain(0) === 0`, `volumeGain(1) === 1`, monotone, convex.

## 6. Brain visualization — deferred to Plan 2c (data seam only)

Plan 02b does **not** render the brain. **Plan 2c** (separate plan / branch / PR, owned by
another session) builds a small docked panel with live per-neuron firing feeds, and removes the
current fly-through `THREE.Group` point cloud (`buildBrainPoints` / `buildCoreEdges` /
`brain-material.ts` / the `CONFIG.aesthetic.brainCenter` + `brainScale` placement) plus the
per-segment core-edge glow (now inside the panel).

Plan 02b's obligations to Plan 2c:

1. **Frozen per-frame seam.** `FrameView` carries `{ pose, readouts, sensory, activity:
   Float32Array (per-neuron ~0..1, length = activeCount), simHz, paused }` — delivered by the
   loop/`FrameView` task (§13 task 4). The panel is rate-coded off `activity` (threshold/rank per
   neuron), so **no new worker or `protocol.ts` fields**. If Plan 2c later needs true spike events
   or membrane V, that is a worker+protocol change Plan 2c owns — `FrameView` stays as specified.
2. **Static inputs.** The panel reads the fixture `NeuronsFile` (`groupId` / `pos` / `flags`) and
   `RoleTable` (role name → neuron-index lists) — both already available at boot.
3. **Screen region.** `HudModel.reservedRect` (fractional) marks the card's area; the HUD keeps it
   clear. Plan 2c locked a **floating card, top-left, over the void**, 24px in from the frame
   inset, card 300×348px, keep-clear **x ≤ 336 px / y ≤ 384 px**, frac
   `{ x: 0.0125, y: 0.022, w: 0.156, h: 0.322 }` (1080p ref). Plan 2c's own config holds
   `CONFIG.brainPanel.rect`; Plan 02b's `CONFIG.hud.reservedRect` mirrors the frac. The HUD's
   project-name banner moves to the top-right group to yield the corner (§5.2).
4. **`setGroupVisible`.** The callback type stays in `HudControls` (Plan 02b owns it); the
   region/class filter **checkbox UI renders in the Plan 2c panel**, which imports the type and
   calls it. The HUD has no filter checkboxes.
5. **`main.ts` co-edit.** Plan 2c owns the ~10 lines that delete the brain `Group` and
   construct/update the panel; the shared `loadEnvelope` clock (§9.4) is laid down by whichever
   plan merges first.

`viz/geometry.ts activityColour` — the blue-channel dip is fixed here as a 2-line carried-over
nit; the helper (a CPU colour ramp) is kept in case Plan 2c's panel consumes it.

## 7. Runtime world editing (`src/world/`)

### 7.1 `SceneObject.id` + `SceneStore`

`SceneObject` gains `id: string`. The default `SCENE` objects get literal ids (`"obj-0"`,
`"obj-1"`, `"obj-2"`). `createSceneStore(initial: SceneConfig): SceneStore` holds a deep-cloned
working `SceneConfig`; every mutator clones-then-replaces the affected sub-array and notifies
subscribers with a fresh `snapshot()`. `addObject` generates `"obj-" + (counter++)` —
deterministic, no `Math.random`. `reset()` restores a deep clone of the module default `SCENE`.

### 7.2 Persistence (`scene-persist.ts`)

`serializeScene` → `JSON.stringify({ v: 1, scene })`. `deserializeScene` parses, checks `v === 1`
and a minimal shape (has `bounds`/`objects`/`lights`/`fly`; each object has `id`+`kind`), returns
`null` otherwise. `loadScene()` / `saveScene()` wrap `localStorage['fly-playground.scene.v1']` in
`try/catch` (private mode / disabled / quota → absent / no-op). `main.ts`: `const initial =
loadScene() ?? SCENE`; subscribe and `saveScene(snapshot)` debounced ~300 ms. **A corrupt or
absent blob must never block boot** — always fall through to `SCENE`.

### 7.3 HUD editor UI

Part of the `Hud` overlay (§5.2):

- **Add** — a `kind` `<select>` (`box`/`sphere`/`torus`), a `material` `<select>` (the buoy
  surface set — see §9.3), an **"Add at fly"** button → `controls.addObject({ kind, material })`.
  `main.ts` places it at the fly's current `pose.position`, `rotation 0`, `scale (1,1,1)`.
- **Objects** — a `<select>` of ids; selecting one reveals `x`/`y`/`z` position sliders (range =
  `bounds` ± margin) + a uniform-scale slider + a **Delete** button. Debounced `oninput` →
  `controls.updateObject(id, { position } | { scale })`.
- **Lights** — a `<select>` of light indices; `x`/`y`/`z` + `intensity` sliders + an
  `<input type="color">` → `controls.updateLight(index, patch)`.
- **Reset scene** → `controls.resetScene()` (store `reset()` + clear `localStorage`).

### 7.4 Live rebuild in `main.ts`

`SceneStore.subscribe` handler:

1. `const s = store.snapshot()`.
2. Dispose the current world `Group` (`traverse` → `geometry.dispose()`, `material.dispose()`),
   remove it from `renderer.scene`.
3. `world3d = buildWorld(s)`; add it back; re-apply the current theme to its materials.
4. `loop.setWorld(worldQuery(s))` so `body/` + `sensing/` see the new AABBs + lights next frame.
5. `hud.syncScene(s)`.

`Loop`: `LoopDeps.getWorld()` replaces `world`; `Loop.setWorld(w)` swaps the ref; `frameOnce`
calls `getWorld()` once per frame and passes it to both `sensing.sample` and `body.step`.

### 7.5 Tests

- `world/scene-store.test.ts`: `addObject` appends with a fresh unique id and fires the subscriber
  with a snapshot containing it; `updateObject` patches only the named fields of only that id;
  `removeObject` drops it; `updateLight` patches by index; `reset()` returns the default counts;
  `snapshot()` is a deep copy; `subscribe` returns a working unsubscribe.
- `world/scene-persist.test.ts`: `deserializeScene(serializeScene(s))` deep-equals `s`;
  `'{"v":2,...}'` / malformed JSON / `'{}'` → `null`; `loadScene` with a throwing `localStorage`
  stub → `null` (no throw); `saveScene` with a throwing stub → no throw.
- `app/world-query.test.ts`: `lights` mirrors `scene.lights` position + intensity.
- `app/loop.test.ts`: `setWorld` takes effect on the next `frameOnce` (spy `body.step` receives
  the new `WorldQuery`); `FrameView.sensory` is the injected stimulus keyed by `inputOrder`;
  `FrameView.paused` mirrors `bridge.readState().paused`.

## 8. Audio (`src/audio/`)

### 8.1 `AudioEngine`

`new AudioEngine(config = CONFIG.audio)` constructs **no** `AudioContext` until `resume()` is
first called (from the first HUD gesture — the mute checkbox starts checked, so unchecking it is
the gesture). Graph on first `resume()`:

- **Ambient bed**: `config.ambientFreqs` (first pass `[55, 82.5, 110]` Hz, detuned) → per-osc
  `GainNode` → summed → `BiquadFilterNode` lowpass (`config.lowpassHz` first pass `380`), cutoff
  modulated by a slow LFO (`config.lfoHz` first pass `0.05`) → **master `GainNode`** → destination.
- **Wing hum**: one `OscillatorNode` → `GainNode` → master. `engine.update(frame, dt)` sets
  `osc.frequency` to `wingToneFreq(frame.readouts)` and the gain to `wingToneGain(...)`, ramped
  via `setTargetAtTime` (no zipper).
- **Escape blip**: `engine.update` runs `detectEscapeOnset` on `frame.readouts.escape`; on a
  rising edge it schedules a short enveloped `OscillatorNode` (`config.blip.freq`,
  `config.blip.dur`, fast decay) → master.

`setMuted(b)` / `setVolume(v01)` ramp the master gain (`0` when muted, else `volumeGain(v01)`).
`dispose()` stops oscillators and closes the context.

### 8.2 `mapping.ts` (pure, tested)

```ts
wingToneFreq(r: { wing_l: number; wing_r: number }): number   // mean → [WING_HZ_MIN, WING_HZ_MAX]
wingToneGain(r: { wing_l: number; wing_r: number }): number   // mean amplitude → [0, WING_GAIN_MAX]
detectEscapeOnset(prev: number, cur: number, th: number, hyst: number): { onset: boolean; armed: boolean }
```

`volumeGain` is imported from `ui/scale.ts` (single implementation, one test). Tests:
`wingToneFreq`/`wingToneGain` land in range and are monotone in the mean; at rest readouts the
hum gain is ~0. `detectEscapeOnset` fires `onset` exactly once on a rising crossing of `th`,
re-arms only after dropping below `th - hyst`, never fires while held high.

### 8.3 `main.ts` wiring

Construct `AudioEngine`; `onFrame` → `engine.update(view, dt)`; HUD mute/volume →
`engine.setMuted` / `engine.setVolume` (first `setMuted(false)` triggers `engine.resume()`). No
audio in tests (env `node`) — `audio.ts` is untested glue.

## 9. Aesthetic pass (`frontend-design`) — world + fly + HUD + post-FX

Runs as **two tasks** (§13): (9a) palette + post-FX + world/fly materials, (9b) motion (my parts)
+ load banner + reduced-motion + escape burst. Invokes `frontend-design` for the light-variant
direction; the dark theme follows `docs/2026-09-09-visual-direction.md` for everything **except**
the brain cloud.

**Status-table discipline:** each Deep Field row Plan 02b owns (see the table) is flipped to
`done` / `partial` / `deferred` **with the commit short-hash appended, in the same commit as the
code**, in `visual-direction.md` §7. `docs/manual-checklist.md` already carries the matching
by-eye rows (added in `9c6ea39`); Plan 02b adds the light-theme rows (§12.4).

### 9.1 A-row ownership

| row | item | owner |
|---|---|---|
| A1 | `palette.ts` retokenised to §2 (all tokens, incl. the ones Plan 2c consumes) | **Plan 02b** |
| A2 | motion + post-FX dials in `CONFIG.aesthetic` | **split** — 02b: `BOB_*`, `IDLE_SWAY_*`, `ESCAPE_KICK`, `BLOOM_*`, `VIGNETTE`, `GRAIN`, `EXPOSURE`, `LOAD`; 2c: `BREATH_*` |
| A3 | `EffectComposer` post-FX stack in the render path | **Plan 02b** |
| A4 | point-cloud `AdditiveBlending` + radial falloff | **Plan 2c** |
| A5 | fly: `emissive` + parented warm `PointLight` + bloom layer | **Plan 02b** |
| A6 | world: cool key light, `buoy` mats + Fresnel rims, radial ground disc (no grid), dim bounds | **Plan 02b** |
| A7 | core edges `pathway` colour + escape pulse | **Plan 2c** |
| A8 | `src/ui/` to §3 type split + §4 layout; `index.html` stub retired | **Plan 02b** |
| A9 | `prefers-reduced-motion` branch | **split** — 02b: fly bob, camera sway/kick, load banner; 2c: connectome breath, panel converge |
| A10 | load sequence | **split** — 02b: banner types in → fly ignites → HUD last; 2c: points converge |
| A11 | escape burst | **split** — 02b: white bloom at the fly + camera kick; 2c: pathway pulse |
| A12 | HUD contrast re-checked against real `void` | **Plan 02b** |
| A13 | region tints on resting points | **deferred → Plan 03** |

### 9.2 Palette & theming (`palette.ts`, `renderer.ts`)

- `PALETTE_DARK` = every `visual-direction.md` §2 token: `void #070B14`, `abyss #0F1A2E`,
  `neuron #4A8FA8`, `spark #EAF7FF`, `ember #FFB25A`, `ember-core #FFE7BE`, `pathway #7C6BE8`,
  `escape-hot #FFFFFF`, `escape-warm #FFF1DA`, `buoy #101A28`, `buoy-rim-a/b/c`, `ground #0A1220`,
  `bounds #22344d`, HUD `rgba` set. Region tints (§2.2) declared but unused (A13). Existing key
  names kept where they map (`bg→void`, `edge→pathway`, fly pair → `ember`/`ember-core`, `ground`,
  `bounds`). `neuron`/`spark`/`pathway` exist for Plan 2c's panel to import.
- `PALETTE_LIGHT` = a cool light-lab set with the **same roles**: near-white cool ground
  (`~#EEF2F6`), a mid teal `neuron` that reads on white, a deep ink-teal `spark` (so "hot" is
  *darker*, additive off), the same violet `pathway` at higher opacity, `ember`/`ember-core`
  unchanged (the one warm thing survives the flip), light matte `buoy` surfaces with the same rim
  hues, a faint cool `bounds` hairline. No cream, no terracotta, no `#000`.
- `activePalette(theme)` returns one; `applyTheme(objects, theme)` mutates cached material
  `.color`/`.emissive`, `scene.background`, `scene.fog` colour + near/far, and the bloom preset.
  Every `viz/` colour read goes through `activePalette`.
- `renderer.ts`: `toneMapping` = `ACESFilmicToneMapping` (or `AgXToneMapping` if the pinned
  `three` exposes it — check in 9a), `toneMappingExposure` = `CONFIG.aesthetic.EXPOSURE`;
  `setTheme(theme)` swaps palette + background + fog + bloom preset; `resize` forwards to the
  composer.

### 9.3 Post-FX stack (`post.ts`)

`buildComposer(renderer, scene, camera)` → `EffectComposer` with, **in order**
(`visual-direction.md` §6.2):

1. `RenderPass` (linear).
2. `UnrealBloomPass` — selective via a bloom **layer** (the fly ember + its light, light markers)
   *or* a high luminance threshold; matte `buoy` + ground never bloom. Dials
   `CONFIG.aesthetic.BLOOM.dark = { STRENGTH: 0.7, RADIUS: 0.4, THRESHOLD: 0.6 }`;
   `BLOOM.light = null` (off) or a very low strength. (The point cloud is Plan 2c's panel — it
   does its own glow there.)
3. Vignette — a small `ShaderPass`, `CONFIG.aesthetic.VIGNETTE` per theme (~0.2 dark / ~0.12
   light).
4. Film grain — a small animated `ShaderPass`, `CONFIG.aesthetic.GRAIN` per theme (~0.035 dark /
   ~0.015 light; **on** — replaces the boolean `grain: false`).
5. Output: `SRGBColorSpace` (tone map set on the renderer, §9.2).

MSAA on the composer render target if available, else an `FXAAShader` pass last. **No** chromatic
aberration, lens-dirt, or scanline passes. `renderer.render()` uses `composer.render()` when a
composer exists, else the plain path.

### 9.4 World, fly, motion, load, reduced-motion, escape burst

- **World** (`builders.ts buildWorld`) — drop the warm `DirectionalLight` "sun" for **one cool**
  directional key (low intensity); `HemisphereLight(void, ground, ~0.4)`; each obstacle → a
  `buoy` base material + a Fresnel-rim shader in its rim hue; a **radial ground disc** (`ground`
  at centre, alpha → 0 at the rim, in fog) instead of a grid — `CONFIG.aesthetic.grid` is
  removed; `bounds` hairline at ~0.05 opacity, with a local brighten where `distance(fly, wall)`
  is small.
- **Fly** (`fly.ts`) — `emissive: ember` at low intensity (never a black silhouette); a small
  warm `PointLight` parented to the fly so obstacles catch a one-sided amber wash; fly + light on
  the bloom layer; wings translucent `ember-core` ~0.18; a refined procedural body (tapered
  thorax/abdomen, leg hints, proportions).
- **Motion** (`motion.ts` + `main.ts` + `follow-camera.ts`) — `bob(t, BOB_HZ, BOB_AMP)` (~0.15 u,
  ~0.5 Hz) on the fly's render-only Y; a sub-degree positional idle sway on the follow camera
  (`idleSway`, ~0.1 Hz). (The connectome breath is Plan 2c.)
- **Load banner** (`main.ts` + `index.html`, A10 — 02b part) — `loadEnvelope(t)` drives: boot
  banner types in (Plex Mono, `index.html` container) → the fly *ignites* (an `ember` bloom at
  the start position) → sim starts → HUD fades in last. Plan 2c hooks its "points converge" phase
  onto the same clock.
- **Escape burst** (A11 — 02b part) — on the `escape` onset: a sub-frame white bloom at the fly
  (spike `emissiveIntensity` / a brief `escape-hot` flash) + `escapeKick(elapsed, ESCAPE_KICK)` →
  a positional camera shove + ~1.5° roll decaying in ~0.3 s. (The pathway pulse is Plan 2c.)
- **Collision startle** — a tiny camera shudder (a smaller `escapeKick`). (The point ripple is
  Plan 2c.)
- **`prefers-reduced-motion: reduce`** (A9 — 02b part) — `main.ts` checks the media query; when
  set: no fly bob, no idle sway, no escape/startle camera kick, the load banner appears without
  the type-in. **Keep** wing flap, physics, meter fills, and the escape *bloom* (brightness only).

### 9.5 Fonts & `index.html` (A8)

IBM Plex Mono + Sans as self-hosted `woff2` under `src/ui/fonts/`, declared in an `@font-face`
partial imported by `hud.css`; real fallback stacks (`ui-monospace,…` / `system-ui,…`),
`font-display: swap`. `index.html` retires the mono-everything inline stub: a minimal shell + a
boot-banner container + the module script; all HUD styling moves to `hud.css`.

### 9.6 Quick self-check before marking the aesthetic pass done (`visual-direction.md` §7.1)

Screenshot the running app (with the Plan 2c panel present) in the **dark** theme: exactly **one**
warm thing in the frame (the fly); cover the fly → the rest reads cool/quiet/deep; an escape is
the sharpest motion; none of the §2 "not this" list crept back (cream, tinted-black, grid,
nebula). Then flip to **light** and confirm the same semantic reading holds.

## 10. `app/config.ts` additions

`CONFIG` stays `as const`. New / changed leaves:

```ts
lif: {
  defaults: { dtMs: 5, tauMMs: 20, vThreshold: 1, vReset: 0, refracMs: 2, noiseSigma: 0.02 },
  ranges: {
    dtMs:       [1, 10],   tauMMs:     [2, 80],   vThreshold: [0.3, 3],
    vReset:     [-1, 0.5], refracMs:   [0, 10],   noiseSigma: [0, 0.3],
  },
},
sensing: {                       // existing keys kept; add:
  EPS2: /* = sensing.EPS ** 2 */,
  LIGHT_MAX: 4, TAU_LIGHT: 0.12, EYE_SPLAY: 0.6,
  WIND: { x: 1, y: 0, z: 0.35 }, WIND_SPEED: 0.5, WIND_TURN_HZ: 0.03, TAU_WIND: 0.2,
},
physics: { /* existing */  YAW_JITTER_DT: 0.05 },
audio: {
  ambientFreqs: [55, 82.5, 110], lowpassHz: 380, lfoHz: 0.05,
  WING_HZ_MIN: 120, WING_HZ_MAX: 900, WING_GAIN_MAX: 0.15,
  blip: { freq: 660, dur: 0.12, gain: 0.25 },
  masterDefault: 0.6, startMuted: true,
  // escape onset reuses physics.ESCAPE_TH / physics.ESCAPE_HYST
},
camera: {                       // existing OFFSET/LOOKAHEAD/omega kept; add:
  IDLE_SWAY_HZ: 0.1, IDLE_SWAY_AMP: 0.02,
},
hud: {
  // Plan 2c docked card region the HUD keeps clear (viewport fracs, 1080p ref).
  // Firm value from Plan 2c; mirrors CONFIG.brainPanel.rect in that plan's config.
  reservedRect: { x: 0.0125, y: 0.022, w: 0.156, h: 0.322 },
},
aesthetic: {
  // existing point dials (BASE_SIZE, CORE_SIZE, ACT_SWELL, POINT_SCALE, POINT_MAX,
  // POINT_DEPTH_*, brainCenter, brainScale) are Plan 2c's to remove/relocate — 02b does not touch them
  theme: "dark",                 // default; "light" is the toggle's other state
  // grid: REMOVED (radial ground disc replaces it)
  BOB_HZ: 0.5, BOB_AMP: 0.15,
  ESCAPE_KICK: { posShove: 0.6, rollDeg: 1.5, decayS: 0.3 },
  LOAD: { bannerS: 1.0, igniteS: 0.6, hudS: 0.8 },
  EXPOSURE: 1.0,
  BLOOM: { dark: { STRENGTH: 0.7, RADIUS: 0.4, THRESHOLD: 0.6 }, light: null },
  VIGNETTE: { dark: 0.2, light: 0.12 },
  GRAIN: { dark: 0.035, light: 0.015 },
  // BREATH_* is added by Plan 2c
},
```

`config.test.ts` extends: assert the *shape* (`BLOOM.light` / a `null` preset is legal — do not
assert "no null anywhere"); every numeric leaf finite; each `lif.ranges` pair `[min, max]` with
`min < max` and `defaults[k]` inside it; `noiseSigma` range min `>= 0`; `BLOOM.dark.THRESHOLD` in
`[0, 1]`; `theme` is `"dark"` or `"light"`; `aesthetic.grid` absent.

## 11. Body — resting-heading fix (`body/wrench.ts`)

`ValueNoise.at` is not zero-mean over a short window, so `yaw = yaw_torque + noise.at(3, t) *
NOISE_AMP` feeds a slow DC torque bias → the resting fly's heading wanders ~50°/15 s. Replace the
raw sample with a finite difference of the same channel:

```ts
const yawJitter =
  (noise.at(3, tSeconds) - noise.at(3, tSeconds - P.YAW_JITTER_DT)) * P.NOISE_AMP;
const yaw = (readouts.yaw_torque ?? 0) + yawJitter;
```

The increment of a stationary process is mean-zero, so its integral (heading) stays bounded and
trend-free while still wobbling for life. `wing` and `thrust` noise unchanged. Deterministic given
the seed.

Test (`body/wrench.test.ts` + a small `body/body.test.ts` integration): rest readouts for a 15 s
sim at fixed `dt`; assert `|heading(t) - heading(0)| < 8°` for all sampled `t`, **and**
`|heading(15) - heading(7.5)| < 3°` (no monotonic drift). The pre-fix code fails the second
assertion.

## 12. Testing, CI, docs

### 12.1 New / changed suites (TDD, vitest env `node`)

`body/wrench.test.ts` · `sensing/sensing.test.ts` · `app/world-query.test.ts` ·
`app/loop.test.ts` · `bridge/worker-core.test.ts` · `bridge/ring.test.ts` ·
`bridge/protocol.test.ts` · `bridge/sim-bridge.test.ts` (+ pm/sab) · `bridge/integration.test.ts`
(real wasm) · `ui/scale.test.ts` (new) · `audio/mapping.test.ts` (new) ·
`world/scene-store.test.ts` (new) · `world/scene-persist.test.ts` (new) ·
`viz/geometry.test.ts` (`activityColour` endpoints + per-channel monotone, blue non-decreasing) ·
`viz/motion.test.ts` (new — `bob`/`idleSway` amplitude+period; `escapeKick` peaks then decays to
~0 by `decayS`; `loadEnvelope` phases monotone-in and ordered banner→ignite→hud) ·
`viz/builders.test.ts` (`buildWorld` child count: buoy meshes + rims + radial ground disc + cool
key + hemi, no grid/no warm sun; construct-only, no `WebGLRenderer`) · `app/config.test.ts`.

### 12.2 Untested glue (typecheck + `vite build` + manual checklist)

`ui/hud.ts` + `ui/hud.css` · `audio/audio.ts` · `viz/post.ts` · `renderer.ts` composer/tonemap
path · `palette.ts` theme mutation · `main.ts` (incl. load banner + reduced-motion wiring) ·
`index.html`.

### 12.3 CI / deps

No new CI job, no new **runtime** dependency. `three/examples/jsm/*` is part of the pinned
`three`. Self-hosted `woff2` fonts are committed assets, not a dependency. If `@types/three` needs
bumping to a `0.186.x` for the `examples/jsm` postprocessing sub-path types, that is the only
`package.json` change (dev, types). Per-change gate: `npx vitest run && npx tsc --noEmit &&
npx eslint src && npx prettier --check "src/**/*.{ts,js}" && yarn build`. Full gate: `yarn ci`
(+ `yarn rs:smoke` before plan-close, not in CI).

### 12.4 Manual checklist (`docs/manual-checklist.md`)

The **Deep Field by-eye rows** already exist (added in `9c6ea39`) — some are Plan 2c's; Plan 02b
ticks the world/fly/HUD/post-FX ones. Fill the remaining "Plan 02b" rows:

1. Neuron-count "depth" slider visibly changes the reported `sim_hz`.
2. A one-sided light induces a **sustained** turn (record the direction).
3. Wind meters respond to the configured field; L and R differ when the fly faces across it.
4. LIF panel: raising `noiseSigma` visibly increases activity (in the Plan 2c panel + the meters);
   lowering `vThreshold` raises firing; **Reset** restores baseline.
5. Readout + sensory meters track the demo (escape spikes on the burst, looming ramps on
   approach, proximity spikes on contact); the looming meter warms toward the escape colour.
6. `setGroupVisible` wiring is live: toggling a group (from the Plan 2c panel) reaches
   `HudControls` and the panel re-renders — the HUD itself shows no filter checkboxes.
7. Audio: unmuting starts the ambient bed; escape fires a blip; wing hum pitch tracks flapping;
   volume + mute work; silent until the first gesture.
8. Place an object at the fly's position — it appears and the fly senses / collides with it. Move
   a light — shading and the light meters change. Reload — the edited scene persists. **Reset
   scene** — back to default.
9. **Theme toggle** — `dark` (Deep Field) ⇄ `light` (cool lab): both legible; exactly one warm
   thing (the fly) in each; bloom only in dark; no cream in either.
10. Escape burst (02b part): white bloom at the fly + a brief camera kick that decays in ~0.3 s;
    nothing else in the scene moves sharply.
11. `prefers-reduced-motion`: fly bob + camera sway/kick + banner type-in drop; wing flap,
    physics, meters, escape bloom stay.
12. Still runs under SAB (`crossOriginIsolated`) and under `postMessage` (headers commented out).

### 12.5 Docs

- `docs/2026-09-09-visual-direction.md` **§7 table** — every aesthetic-touching Plan 02b commit
  flips the A-rows it owns (§9.1) + appends the short-hash, in that same commit. **Plan 2c** owns
  revising the brain-cloud prose (§0, §5 connectome/brain-camera rows, §6.3–§6.4) and its A4/A7
  rows.
- `docs/architecture.md` — mark `src/ui/*`, `src/audio/*`, `src/world/*`, `viz/post.ts`,
  `viz/motion.ts`, light/wind sensing, and the theme toggle as implemented in Plan 02b; note the
  docked brain panel is Plan 2c; move the remaining "Deferred to Plan 02b" items to "Deferred to
  Plan 03".
- `README.md` — Status → "Plan 02b (rich loop + controls) complete; brain viz → Plan 2c"; next is
  Plan 03.
- `docs/handoff-plan-02b-03.md` — tick the Plan 02b section; note the brain-viz split to Plan 2c;
  leave Plan 03 intact.

## 13. Task decomposition (≈11, bottom-up, each green + commit)

1. Yaw-noise fix + `activityColour` blue-channel nit.
2. `CONFIG` extensions (§10) + `SimState.paused` + single pause mechanism + `setParams` wired
   worker→`sim.set_params`.
3. Light + wind sensing (`WorldQuery.lights`, `sensing.ts`, `SensingState`, config) + integration
   test phototaxis.
4. `FrameView` sensory/paused + `LoopDeps.getWorld`/`setWorld` + loop/main wiring. **(This is the
   frozen seam Plan 2c consumes — prioritise; land it early.)**
5. `viz/motion.ts` pure curves (`bob`, `idleSway`, `escapeKick`, `loadEnvelope`) + tests.
6. HUD core: `src/ui/` scaffold, `scale.ts` (+ tests), the edge-instrument frame, vertical depth
   slider, readout + sensory meters, pause, `sim_hz`, self-hosted fonts, `index.html` retire.
7. HUD: LIF tuning panel + `setGroupVisible` wiring + theme toggle + audio controls.
8. Audio: `mapping.ts` (+ tests) + `AudioEngine` + `main`/HUD wiring.
9. Runtime world editing: `scene-store.ts` + `scene-persist.ts` (+ tests) + `SceneObject.id` +
   rebuild-on-edit + HUD add/move/delete.
10. Aesthetic 9a — `palette.ts` dual palette + `applyTheme`; `renderer.ts` tonemap + `setTheme`;
    `post.ts` bloom/vignette/grain stack; `fly.ts` emissive + parented light + bloom layer;
    `buildWorld` buoys + Fresnel rims + cool key + radial ground + dim bounds. Flip A1, A3, A5,
    A6, A2 (02b dials), A12.
11. Aesthetic 9b + plan-close — motion (fly bob + camera idle sway) + load banner/ignite/HUD +
    reduced-motion (02b parts) + escape burst (fly bloom + camera kick) + collision shudder;
    light/wind + phototaxis-sign tune; fill `docs/manual-checklist.md`; sync `architecture.md` /
    `README.md` / handoff; flip A8 (done in 6–7), A9 / A10 / A11 (02b parts, `partial`);
    `yarn ci` + `yarn rs:smoke` green.

Per the handoff + task instruction: a **diff review + fix loop after each task**, and an **opus
whole-branch review** at the end (superpowers:subagent-driven-development +
requesting-code-review). Branch off `main` (e.g. `plan-02b-rich-loop`); **do not push** — the
maintainer merges. Coordinate the `main.ts` merge with Plan 2c (§2).

## 14. Risks / watch-items

1. **Deep Field assumes the fly-through connectome; Plan 2c changes the composition.** The
   docked panel alters the frame the aesthetic pass is tuned against — do the §9.6 self-check
   *with the Plan 2c panel present* (coordinate timing), and treat the `visual-direction.md`
   prose revision as Plan 2c's, not a Plan 02b blocker.
2. **The light theme has no doc.** Designed in §9.2, not in `visual-direction.md`; must not
   resurrect the cream diorama. `frontend-design` input; the §9.6 self-check runs in both themes;
   A-rows track the dark theme only.
3. **`@types/three` 0.185.4 vs `three` 0.186.0 skew** on `examples/jsm/postprocessing/*` — task 10
   verifies `import` + types for `EffectComposer`, `RenderPass`, `ShaderPass`, `UnrealBloomPass`,
   `FXAAShader`; bump `@types/three` to a matching `0.186.x` (dev, types) if needed.
4. **Tone-mapping constant availability** — `AgXToneMapping` may not exist in `three` 0.186; fall
   back to `ACESFilmicToneMapping`. Decide in task 10.
5. **Selective bloom** — layer vs threshold; matte buoys / ground must never bloom. Budget a
   tuning sub-step in task 10; per-theme presets in `CONFIG`.
6. **Bloom × fog × `SRGBColorSpace` × tone map** interact — washed-out or crushed; the §9.6
   screenshot self-check + manual-checklist rows gate it.
7. **Phototaxis sign** — fixed by the frozen fixture wiring; may read photophobic. Eye→slot swap
   escape hatch in `sensing.ts`; sign-agnostic acceptance test.
8. **Live scene rebuild GPU leak** — every edit disposes the old world `Group`'s geometries +
   materials; the store debounces rapid slider input; the rebuild is a handful of meshes.
9. **`localStorage` unavailable / corrupt** — every access `try/catch`-guarded; a bad blob falls
   through to `SCENE`; a persisted scene must never block boot.
10. **HUD untested** — every decision lives in `ui/scale.ts` (pure, tested); `hud.ts` only reads
    those and sets DOM properties. Motion curves live in `viz/motion.ts` (pure, tested).
11. **Paused-sim publishing** — the worker must keep publishing state while `running === false`
    (`elapsedMs = 0`) or the meters + Plan 2c panel freeze *and* go stale; covered by a
    `worker-core` test.
12. **`Loop` world staleness** — `getWorld()` re-read every frame; `setWorld` must land before
    the next `sensing.sample` / `body.step`; tested in `app/loop.test.ts`.
13. **`main.ts` co-edit with Plan 2c** — shared file; agree merge order, keep each side's edits in
    distinct regions, whichever merges first lays down the `loadEnvelope` clock. Re-confirm
    `git log` before the first task; the working tree is shared with other sessions.
14. **Load sequence blocking input** — the load hero must not swallow the first user gesture the
    audio engine needs; the mute toggle stays live throughout.
15. **Font FOUT / self-host** — `@font-face` with `font-display: swap` + real fallback stacks so
    the boot banner is never invisible; `woff2` only.
16. **`reservedRect` is firm** — Plan 2c locked "floating card, top-left", keep-clear
    x ≤ 336 / y ≤ 384 px (`CONFIG.hud.reservedRect`). The HUD banner sits in the top-right group;
    the depth slider starts below the card envelope. Any later card resize is a one-line config
    change.
