# fly-playground — Plan 02 design / spec: app shell (minimal brain→fly loop)

**Date:** 2026-09-09
**Status:** approved in brainstorming (all sections), user waived the written-spec review gate — proceed to writing-plans
**Parent design:** [`docs/2026-09-09-design.md`](../../2026-09-09-design.md) ·
companions [`architecture.md`](../../architecture.md) · [`neuron-model.md`](../../neuron-model.md)
**Plan 01 (foundations + sim core):** [`../plans/2026-09-09-fly-playground-01-foundations.md`](../plans/2026-09-09-fly-playground-01-foundations.md)

---

## 0. Where Plan 01 left off (context)

Plan 01 shipped the deterministic sim core and the binary formats. Available now:

- **`crates/fly-sim` → WASM `Sim`** (`crates/fly-sim/src/lib.rs`): `new(neurons: &[u8], graph: &[u8], seed: u64)`,
  `define_input_role(name, &[u32]) -> u32`, `define_readout_role(name, &[u32]) -> u32`,
  `inject(role_id, value)`, `step(ticks)`, `readout(role_id) -> f32` (EMA of the fraction of
  the group's neurons spiking, ~0..1), `activity_snapshot() -> Vec<f32>` (length = `active_count`,
  values ~0..1), `set_active_count(n)`, `active_count()`, `set_params(dt_ms, tau_m_ms, v_threshold,
  v_reset, refrac_ms, noise_sigma)`, `dt_ms()`, `neuron_count()`, `core_count()`, `sim_abi_version() -> 1`.
- **Key sim semantics** (`crates/fly-sim/src/core/sim.rs`): `step()` swaps and **clears** the
  input buffer every tick. A held stimulus must be re-injected **before every tick**, not once
  per frame. `inject` accumulates into `input_cur` for the role's neurons; unknown role id is a
  no-op. `set_active_count` clamps to `[core_count, neuron_count]`; edge traversal skips targets
  `>= active`, so the slider is O(1). Default `dt_ms = 5.0` (200 Hz), `activity_tau_ticks = 40`.
- **TS decoders** (`src/formats/`): `parseNeurons(ArrayBuffer) -> NeuronsFile` (`ids`, `pos`
  Float32Array ×3, `groupId`, `flags`, `coreCount`, `count`; `isCore/isInhibitory/isInput/isReadout`
  bit helpers), `parseGraph(ArrayBuffer) -> GraphFile` (CSR `offsets/targets/weights`, `wNorm`,
  `row(g, i)` generator), `parseGroups(json) -> GroupsFile` (`groups`, `inputRoles`, `readoutRoles`,
  `scaleFactor`). `src/formats/fixture.ts` provides `fixtureBuf(name)` / `fixtureJson(name)` for tests.
- **Fixture** (`pipeline/out/fixture/`, committed, byte-reproducible via `pipeline/gen_fixture.py`):
  500 neurons, `core_count = 48`, `w_norm = 0.01`, `scale_factor = 1.0`. Input roles
  `looming` (0..7), `light_l` (8..11), `light_r` (12..15), `proximity` (16..19), `wind_l` (20..21),
  `wind_r` (22..23). Readout roles `escape` (24..31), `wing_l` (32..35), `wing_r` (36..39),
  `thrust` (40..43), `yaw_torque` (44..47). Wired: strong `looming → escape`, weak
  `light_l → wing_r` / `light_r → wing_l`, sparse random background. **No path to `thrust` /
  `yaw_torque`** from any input role.
- **Tooling**: `yarn ci` (format:check, lint, rs:fmt:check, typecheck, rs:lint, rs:test, test,
  build, rs:wasm, py:test, py:fixture-check), `yarn prep` (fixup). `vitest` env is `node`.
  `tsconfig` libs include `DOM`, `DOM.Iterable`, `WebWorker`. `@types/node` is **not** a dep;
  `src/formats/node-env.d.ts` is a hand-rolled shim to be deleted this plan.
- Not started: anything in `src/` beyond `formats/` + `version.ts`; `index.html` is a stub.

## 1. Goal of Plan 02

A thing you fly around in the browser, on the synthetic fixture, where **the brain drives the
fly** through a real (if minimal) sense→act loop. The self-running demo:

> The fly cruises forward on a gentle baseline. A block sits in `scene.config.ts`. As the fly
> nears it, `looming` ramps, the `escape` readout crosses threshold, a giant-fiber impulse fires,
> the fly veers up and away — and the looming→escape pathway lights up in the point cloud and
> the core edges.

Split from the larger "Plan 02" in the parent doc: this is the **minimal loop**. The **rich loop
+ controls** (light/wind sensing, phototaxis, neuron-count slider HUD, meters, brain camera mode,
audio, runtime object-placement UI, aesthetic pass) is **Plan 02b**. Real data + deploy is Plan 03.
See §8 for the exact cut.

### Non-goals for Plan 02

- No `light_*` / `wind_*` sensing, no phototaxis, no wind channel.
- No HUD beyond a tiny sim-Hz / FPS instrument label. No slider, no meters, no filter checkboxes.
- No brain / orbit camera mode, no docked brain panel — one follow camera only.
- No audio.
- No runtime UI for adding objects or moving lights — the world is `scene.config.ts`, static.
- No post-processing (bloom/grain). Glow is faked with additive point sprites.
- No real data pipeline, no asset hosting, no IndexedDB cache, no deploy.
- No tonic brain drive — hover/cruise come from a `body/` constant this plan (brain-side bias is
  Plan 03 tuning).

## 2. Module map

```
src/
  main.ts                boot: fetch fixture → SimBridge.init → build scene → start loop
  app/
    loop.ts              RAF orchestrator: sensing → bridge IO → body.step → viz updates → renderer.frame
    config.ts            one typed object: physics constants, sim params, aesthetic dials
  bridge/
    sim-bridge.ts        SimBridge interface + boot-time transport pick
    sab-bridge.ts        SharedArrayBuffer ring-buffer transport (main-thread side)
    pm-bridge.ts         postMessage + transferable fallback (main-thread side)
    protocol.ts          control-message types + codec (per-frame IO is buffers, not messages)
    ring.ts              lock-free seq-counter ring region reader/writer (pure)
    step-accumulator.ts  pure 200 Hz catch-up + stimulus-latch logic (shared by worker + tests)
    sim.worker.ts        worker entry: owns Sim, runs step-accumulator, publishes state
  sim/
    roles.ts             groups.json → role-id table; defines real roles on the Sim
  sensing/
    sensing.ts           pure sample(pose, world, dt, prev) → { stimulus, state }
    raycast.ts           ray vs AABB helpers
  viz/
    renderer.ts          THREE.WebGLRenderer, scene, resize, frame() — guarded (no WebGL in CI)
    brain.ts             THREE.Points cloud + per-vertex activity colour; core LineSegments
    fly.ts               procedural low-poly fly; wing flap from wing readout
    world.ts             ground, bounds, objects, lights — from scene.config
    follow-camera.ts     critically-damped chase cam
    palette.ts           named colours + material factory (the tunable aesthetic layer)
  scene.config.ts        bounds, objects[], lights[]
examples/
  smoke.mjs              node-wasm escape-readout demo (committed; manual check)
```

**The Pilot seam** (structural invariant): `body/` never learns where readouts come from — it
reads the motor readouts for every role. `sensing/` produces a `StimulusVector` the loop injects.
Plan 02b adds alternative stimulus sources (light/wind, a debug driver) that produce the *same*
`StimulusVector`; nothing in `body/` or `bridge/` changes.

### 2.1 Shared types & conventions

- **Axes** (body frame, right-handed): `+X` body-forward, `+Y` body-up, `+Z` body-right.
  World `+Y` is up. `scale_factor` from the fixture maps neuron positions into world units.
- **`Vec3` / `Quat`** — plain `{ x, y, z }` / `{ x, y, z, w }` structs in `body/` and `sensing/`
  (framework-free, unit-testable); converted to `THREE.Vector3` / `THREE.Quaternion` only at the
  `viz/` boundary.
- **`Pose`** = `{ position: Vec3; orientation: Quat; forward: Vec3; up: Vec3 }` — `forward`/`up`
  are the body axes rotated into world space, precomputed by `body/` each `step` so consumers
  don't redo quaternion math.
- **`Readouts`** = `Record<string, number>` — a named view the **loop** builds each frame from
  `bridge.readState().readouts` (a `Float32Array`) + `roleTable.readoutOrder`, then passes to
  `body/` and `fly/`. The bridge stays index-based; names live in exactly one place (`roleTable`).
- **`WorldQuery`** = `{ aabbs: Aabb[]; bounds: Aabb }` where `Aabb = { min: Vec3; max: Vec3 }` —
  derived once from `scene.config` at boot, passed to `body.step` and `sensing.sample`.

## 3. SimBridge (worker transport + tick loop)

### 3.1 Interface (`sim-bridge.ts`)

```ts
interface SimBridge {
  init(assets: { neurons: ArrayBuffer; graph: ArrayBuffer; groups: unknown }, config: SimInitConfig)
    : Promise<{ nNeurons: number; coreCount: number; roleTable: RoleTable }>;
  setStimulus(v: Float32Array): void;                 // per-frame; length = nInputRoles; latched by worker
  readState(): { readouts: Float32Array; activity: Float32Array; simHz: number; tick: number };
  setActiveCount(n: number): void;
  setParams(p: Partial<LifParams>): void;
  pause(): void; resume(): void; reset(): void;
  dispose(): void;
}
```

`RoleTable`: `{ input: Record<string, number>; readout: Record<string, number>; inputOrder: string[]; readoutOrder: string[] }`
— maps role name ↔ stimulus/readout vector index. Built from `groups.json` in `sim/roles.ts`
(`inputOrder`/`readoutOrder` = sorted role names for determinism). The worker calls
`sim.define_input_role` / `sim.define_readout_role` **in that same order**, so the Rust-side role
id equals the vector index (`Roles` assigns ids by insertion order — see Plan 01
`crates/fly-sim/src/core/roles.rs`). Main and worker both derive the table from the same
`groups.json` bytes.

Boot pick (`sim-bridge.ts`): `crossOriginIsolated === true` → `SabBridge`, else `PmBridge`.
`vite.config.ts` gains `server.headers` `Cross-Origin-Opener-Policy: same-origin` +
`Cross-Origin-Embedder-Policy: require-corp` so SAB is the dev default; production is
host-dependent and documented (Plan 03 concern).

### 3.2 SAB layout

One `SharedArrayBuffer`, three regions as typed-array views over disjoint byte ranges:

| region  | view           | contents |
|---------|----------------|----------|
| control | `Int32Array`   | `[0] seqOut`, `[1] activeCount`, `[2] simHzMilli` (Hz×1000), `[3] paused`, `[4] tickLo`, `[5] tickHi`, `[6] nSnapshot` |
| input   | `Float32Array` | `[nInputRoles]` — current stimulus vector |
| output  | `Float32Array` | `[nReadoutRoles + SNAP_MAX]` — readouts, then strided activity (`nSnapshot` valid) |

Single-producer / single-consumer per region. Output writer (worker): `Atomics.store(control, 0, seq|1)`
(odd) → write output floats + control ints → `Atomics.store(control, 0, seq+1)` (even). Reader
(main): read `seqOut`; if odd, spin briefly / return last good; read; re-read `seqOut`; retry if
changed. Input needs no seq — a one-frame-stale stimulus is harmless; main just overwrites in place.
`tick` is 53-bit split across `tickLo/tickHi`.

### 3.3 PM fallback

`PmBridge.setStimulus` posts `{ type: 'stimulus', buf }` with `buf` transferred (a reused
double-buffer pair to avoid per-frame allocation — post one, fill the other). Worker posts back
`{ type: 'state', readouts, activity, simHz, tick }` with the arrays transferred each publish.
`readState()` returns the last received message's arrays. Same `SimBridge` surface; the app never
branches on transport after boot.

### 3.4 Worker loop (`sim.worker.ts` + `step-accumulator.ts`)

`step-accumulator.ts` is a pure function so vitest exercises it with no real `Worker`:

```ts
// TICK_MS = 5 (200 Hz). state carries { acc, tick, hzEma }.
function stepAccumulator(
  state: AccState,
  elapsedMs: number,
  latchedStimulus: Float32Array,
  sim: SimLike,               // { inject(id,v), step(1), readout(id), activitySnapshot() }
  roleIds: number[],          // input role ids, index-aligned to latchedStimulus
): AccState
```

Body: `acc = min(acc + elapsedMs, MAX_CATCHUP_MS)` (`MAX_CATCHUP_MS = 4 * TICK_MS`, no spiral of
death); `while (acc >= TICK_MS) { for k: sim.inject(roleIds[k], latchedStimulus[k]); sim.step(1);
acc -= TICK_MS; tick++; ticksThisCall++ }`; update `hzEma` from `ticksThisCall / (elapsedMs/1000)`.
Re-injecting every tick is mandatory (§0: `step` clears input per tick).

`sim.worker.ts`: on `init`, constructs `Sim`, calls `roles.ts` to `define_input_role` /
`define_readout_role` for every fixture role, allocates the SAB (or PM buffers), then a
self-scheduling loop (`setTimeout(0)` chained, measuring real elapsed) calls `stepAccumulator`,
then publishes readouts (`sim.readout(id)` per readout role) + a strided
`activity_snapshot()` slice.

### 3.5 Snapshot decimation

`nSnapshot = min(activeCount, SNAP_MAX)` (`SNAP_MAX` e.g. 8192); `stride = ceil(activeCount /
nSnapshot)`; worker writes `activity[i*stride]` for `i in [0, nSnapshot)`. Fixture (500) → stride 1,
whole cloud. Per-group-means at high N is Plan 03.

## 4. Rendering (`viz/`)

- **`renderer.ts`** — one `THREE.WebGLRenderer` (`outputColorSpace = SRGB`), one `Scene`, resize
  observer, `frame({ activity, readouts, pose, dt })`. **Construction is lazy and guarded**: a
  `createRenderer()` factory that touches `THREE.WebGLRenderer` / `document` — never imported at
  module top level in a way that runs under vitest. No `EffectComposer`.
- **`brain.ts`** — `THREE.Points`, one vertex per loaded neuron. `BufferGeometry` attributes:
  `position` (from `neurons.bin` `pos`, × `scaleFactor`), `aCore` (`Float32` 0/1 from `isCore`),
  `aActivity` (`Float32`, rewritten each frame). `ShaderMaterial` (minimal, inline GLSL):
  vertex — `gl_PointSize = (aCore > 0.5 ? CORE_SIZE : BASE_SIZE) * (1 + ACT_SWELL*aActivity) *
  (SCALE / -mvPosition.z)`; fragment — soft round mask (`discard` outside radius), `color =
  mix(COLD, HOT, aActivity)`, `blending = AdditiveBlending`, `depthWrite = false`.
  `updateActivity(snapshot: Float32Array)` expands stride (1:1 for fixture) into `aActivity` and
  flags the attribute needsUpdate.
- **Core edges** — `THREE.LineSegments`, `BufferGeometry` of endpoint pairs for every CSR edge
  with `src < coreCount && dst < coreCount`, `LineBasicMaterial` low opacity, warm grey. Optional:
  per-vertex colour driven by endpoint `aActivity` (nice-to-have; static opacity is the fallback,
  not a blocker).
- **`fly.ts`** — a `THREE.Group`: thorax + abdomen (scaled spheres / `CapsuleGeometry`), head
  sphere, two wing planes (`PlaneGeometry`, translucent). `update(readouts, dt)`: `flapHz =
  lerp(FLAP_MIN, FLAP_MAX, clamp01((readouts.wing_l + readouts.wing_r) / 2))`, wing rotation =
  `FLAP_AMP * sin(elapsed * flapHz * 2π)`; body pitch offset from `readouts.thrust`. World pose
  applied by the loop (`group.position` / `group.quaternion` from `body/`).
- **`world.ts`** — `buildWorld(scene, sceneConfig, palette)`: ground `PlaneGeometry` (tint of bg;
  optional distance-faded grid via a shader or `GridHelper` with fog), bounds `LineSegments` box
  (barely visible), one mesh per `objects[]` entry (`box|sphere|torus` → matching geometry,
  transform, `material` key → `palette.material(key)`), one `PointLight` + small emissive marker
  sphere per `lights[]` entry, plus one warm `DirectionalLight` (key) and a
  `HemisphereLight` (warm up / cool down) fill.
- **`follow-camera.ts`** — `updateFollowCamera(camera, pose, dt, cfg)`: critically-damped spring
  (`omega`, `zeta = 1`) moving the camera toward `pose.position + pose.orientation * OFFSET`
  (offset behind + above); `camera.lookAt(pose.position + pose.forward * LOOKAHEAD)`.
- **`palette.ts`** — exported named colours (`bg`, `pointCold`, `pointHot`, `coreTint`, `edge`,
  `clay`, `sage`, `ochre`, `flyBody`, `flyAccent`, `ground`, `bounds`) + `material(key)` →
  `MeshStandardMaterial` (matte: `roughness ≈ 0.9`, `metalness = 0`, `flatShading = true`).
  Every visual value in `viz/` reads from here.

## 5. `body/` (6DOF) + `sensing/`

### 5.1 `body/` — `Body` with `{ position: Vec3, orientation: Quat, vel: Vec3, angVel: Vec3 }`

`step(dt: number, readouts: Readouts, world: WorldQuery) -> { contact: boolean }`:

- **Readouts → wrench** (body frame; constants in `app/config.ts`):
  - `s = (wing_l + wing_r) / 2` → lift along body-up `= GRAVITY * MASS + LIFT_K * (s - HOVER_S)`
    (so `s ≈ HOVER_S`, i.e. rest, hovers). Constant `CRUISE_THRUST` along body-forward so the fly
    drifts into objects.
  - `a = wing_l - wing_r` → `ROLL_K * a` roll torque + `YAW_A_K * a` yaw torque.
  - `thrust` readout → `THRUST_K * thrust` body-forward force. `yaw_torque` readout →
    `YAW_K * yaw_torque` yaw torque.
  - `escape` rising past `ESCAPE_TH` (edge-triggered; latch until it drops below `ESCAPE_TH - HYST`)
    → one impulse `ESCAPE_IMPULSE` along `normalize(bodyUp + bodyFwd)`, and set
    `controlLockout = ESCAPE_LOCKOUT_S`. While `controlLockout > 0` (decremented by `dt`), all
    readout-derived forces/torques are skipped — only gravity, drag, bounds, collision apply.
- **Noise** — seeded low-frequency value noise added to each readout before mapping,
  amplitude `NOISE_AMP`, for lifelike jitter. Deterministic given the seed.
- **Integrate** (semi-implicit Euler): `vel += (force / MASS) * dt`; `vel *= exp(-LIN_DRAG * dt)`;
  `position += vel * dt`. `angVel += (torque / INERTIA) * dt`; `angVel *= exp(-ANG_DRAG * dt)`;
  `orientation = normalize(orientation + 0.5 * quat(0, angVel.x, angVel.y, angVel.z) * orientation * dt)`.
- **Soft bounds** — for each axis outside `sceneConfig.bounds`, add a spring force
  `-BOUNDS_K * overshoot - BOUNDS_C * vel_axis` back toward the volume. No hard clamp.
- **Collision** — fly as a sphere radius `FLY_R` vs each object's world AABB (+ the bounds box from
  inside). On penetration: translate out along the least-penetration axis, set that velocity
  component to `-BOUNCE * v`, return `contact: true`.

The loop turns `contact: true` into a one-frame-late `proximity` startle: it adds
`CONTACT_STARTLE` to the `proximity` slot of the *next* frame's stimulus vector.

### 5.2 `sensing/` — pure

`sample(pose: Pose, world: WorldQuery, dt: number, prev: SensingState) -> { stimulus: Float32Array; state: SensingState }`
— `stimulus` length `= nInputRoles`, index-aligned to `roleTable.inputOrder`; only `looming` and
`proximity` slots are non-zero this plan. Each channel one-pole smoothed
(`y += (x - y) * (1 - exp(-dt / TAU))`):

- **`proximity`** — cast rays along `±forward, ±up, ±right` from `pose.position` vs world AABBs +
  bounds; `raw = 1 / max(minHitDist, EPS)`; clamp to `[0, PROX_MAX]`; smooth.
- **`looming`** — find the nearest object whose centre is within `LOOM_CONE` of `pose.forward`;
  `theta = 2 * atan(objectRadius / dist)`; `raw = max(0, (theta - prev.theta) / dt)`; smooth.
  `prev.theta` carried in `SensingState`.

`raycast.ts`: `rayAabb(origin, dir, aabbMin, aabbMax) -> number | null` (slab method),
`nearestHit(origin, dirs, aabbs) -> number`.

## 6. `app/config.ts`, `scene.config.ts`

`app/config.ts` — one exported `const CONFIG` object, sections: `sim` (seed, `SNAP_MAX`, LIF param
overrides), `physics` (every `*_K`, `*_TH`, `MASS`, `INERTIA`, drags, `FLY_R`, `HOVER_S`,
`CRUISE_THRUST`, `ESCAPE_*`, `BOUNDS_*`, `BOUNCE`, `CONTACT_STARTLE`, `NOISE_AMP`), `sensing`
(`PROX_MAX`, `EPS`, `LOOM_CONE`, all `TAU`s), `camera` (`OFFSET`, `LOOKAHEAD`, `omega`),
`aesthetic` (`pointGlow`, `grid: boolean`, `grain: false`, point sizes, `ACT_SWELL`).
First-pass numeric values are chosen in the plan with "tune against the manual checklist" notes.

`scene.config.ts` — `{ bounds: { min: Vec3, max: Vec3 }, objects: Array<{ kind: 'box'|'sphere'|
'torus', position, rotation, scale, material: string }>, lights: Array<{ position, color, intensity }>,
fly: { start: Vec3, heading: number } }`. Plan 02 ships a small scene: ground + 2–3 objects, one of
them squarely on the fly's cruise path so the escape demo self-runs, + 2 point lights.

## 7. Testing, CI, carry-ins

### 7.1 Tests (TDD; vitest stays `environment: node`)

Pure-logic suites, written test-first:

- `bridge/ring.test.ts` — seq odd/even write, torn-read retry returns last-good, SPSC round-trip.
- `bridge/protocol.test.ts` — control-message codec round-trip; PM buffer double-buffering never
  aliases.
- `bridge/step-accumulator.test.ts` — with a fake `SimLike`: exact tick count for a given elapsed;
  `MAX_CATCHUP_MS` clamp; **stimulus re-injected every tick** (fake records inject calls); `hzEma`
  converges.
- `sim/roles.test.ts` — `groups.json` → `RoleTable`: names, index order stable, input/readout
  namespaces separate.
- `sensing/raycast.test.ts` — `rayAabb` hits/misses/inside on hand cases; `nearestHit` picks min.
- `sensing/sensing.test.ts` — `looming` rate on a scripted approach (hand-computed dθ/dt);
  `proximity` on known geometry; smoothing converges; `light_*`/`wind_*` slots stay 0.
- `body/wrench.test.ts` — known readouts → expected force/torque (hover cancels gravity at
  `HOVER_S`; asymmetry → roll+yaw sign; `thrust`/`yaw_torque` trims).
- `body/escape.test.ts` — rising edge fires exactly one impulse; `controlLockout` suppresses
  readout forces for the window; hysteresis prevents re-fire while held.
- `body/integrate.test.ts` — quaternion stays normalized over many steps; drag reduces speed
  monotonically with no force; soft-bounds force points inward.
- `body/collision.test.ts` — sphere-AABB push-out on least-penetration axis; `contact` flag;
  restitution sign.
- `viz/pure.test.ts` — `activityColour(t)` endpoints + monotone; `flapFrequency(readouts)` range;
  `updateFollowCamera` spring approaches target, no overshoot at `zeta = 1`.
- `viz/builders.test.ts` — `buildBrainGeometry(neurons)` vertex count = `neurons.count`,
  `aCore` sum = `coreCount`; `buildCoreEdges(graph, coreCount)` only core-core pairs;
  `buildWorld` mesh/light counts match `scene.config`. These import `three` but construct only
  `BufferGeometry` / `Object3D`, **no `WebGLRenderer`** — confirm that runs under node vitest;
  if `three` pulls a browser global at import, isolate the geometry math into a `three`-free
  helper and test that instead.

### 7.2 Node-wasm integration test

- Build step: `wasm-pack build crates/fly-sim --target nodejs --dev --out-dir crates/fly-sim/pkg-node`
  (gitignored). Add `rs:wasm:node` script.
- `bridge/integration.test.ts` — imports `crates/fly-sim/pkg-node`, constructs the real `Sim` with
  the fixture bytes, defines roles via `sim/roles.ts`, then drives it through the **real
  `stepAccumulator`** with a `looming` ramp stimulus, asserting `readout(escape)` crosses
  `ESCAPE_TH` within a bounded tick count and stays sub-threshold under a zero stimulus. This is
  the one true end-to-end "the brain reacts" test, against the real wasm.
- Skips with a clear message if `pkg-node` is absent (so a bare `yarn test` still runs the pure
  suites); CI always builds it first.

### 7.3 `examples/smoke.mjs`

Committed. Loads `crates/fly-sim/pkg-node`, builds `Sim` from the fixture, injects a rising
`looming`, prints the `escape` readout climbing to threshold. Scripts: `rs:wasm:node` (build),
`rs:smoke` (`yarn rs:wasm:node && node examples/smoke.mjs`). **Not** in `yarn ci`.

### 7.4 CI + scripts

`.github/workflows/ci.yml` / `package.json`: `yarn ci` and `yarn prep` gain `rs:wasm:node` **before**
`yarn test`. `yarn dev` now serves the real app. No new CI job; still one headless job. New runtime
dep `three` (pinned exact). `wasm-pack build --target web` output consumed by Vite — add a
`rs:wasm` (web) invocation to the dev/build flow or a Vite plugin; `pkg/` gitignored.

### 7.5 Carry-ins from Plan 01

- Add `@types/node` (devDependency); **delete `src/formats/node-env.d.ts`**; remove any now-moot
  `types` narrowing in `tsconfig`.
- `.gitignore`: `crates/fly-sim/pkg-node/`, `crates/fly-sim/pkg/`, `dist/`.

### 7.6 Docs

- `docs/manual-checklist.md` — fill the Plan 02 rows: (1) fly hovers stably at rest, no drift-to-
  ground; (2) fly cruises and a `scene.config` object in the path triggers a visible escape burst +
  veer-away; (3) point cloud visibly pulses with activity; (4) core edges light the looming→escape
  path during the burst; (5) follow camera tracks smoothly, no jitter/overshoot; (6) runs in both
  `crossOriginIsolated` (SAB) and non-isolated (PM) — verify by toggling the `vite.config.ts` headers.
- `docs/architecture.md` — mark the Plan 02 module paths as implemented; note Plan 02b scope.
- `README.md` — Status → Plan 02 complete, next is Plan 02b.

## 8. Out of scope — explicit cut

**→ Plan 02b "rich loop + controls":** `light_l/light_r/wind_l/wind_r` sensing; phototaxis
steering; wind antennal channel; neuron-count slider HUD (log scale, live sim-Hz); region/class
filter checkboxes (stretch); readout meters (thrust/yaw/escape) + sensory meters
(proximity/looming/light); brain camera mode (orbit / free-fly through the connectome, fly as a
marker) + docked corner brain panel + camera toggle key; audio (ambient bed + escape blip +
wingbeat hum, master mute/volume); runtime place-object / move-light UI; fly + world aesthetic
pass via `frontend-design` (post-processing, grain, refined palette, better fly model);
per-segment core-edge activity brightness (if not landed as the §4 nice-to-have); `set_params`
live-tuning debug panel.

**Aesthetic pass — follow [`docs/2026-09-09-visual-direction.md`](../../2026-09-09-visual-direction.md)
("Deep Field").** It specifies the palette (with each token's code home), typography,
HUD layout, motion, and the post-FX stack, and carries a tracked status table
(§7) — update that table in the same commit as the code so status matches
reality. Live visual reference:
<https://claude.ai/code/artifact/1de23900-b352-4a62-be19-512f36365675>. The
one-line brief: one warm ember of a fly through a cool bioluminescent connectome
in a blue-black void; the escape is the only violent motion.

**→ Plan 03 "real data + deploy":** Python `fetch/filter/tier/core_circuit/emit_bin` vs the real
MaleCNS download; neuPrint type→bodyId mapping; W_NORM tuning; real assets; `format.rs` wasm32
hardening; asset hosting + IndexedDB cache keyed by `manifest.version`; per-group-means snapshot
decimation at high N; deploy target + production COOP/COEP (or documented PM-only); tonic brain
drive (bias) so hover/cruise come from the brain rather than a `body/` constant.

## 9. Risks / watch-items

1. **`three` under node vitest** — `viz/builders.test.ts` needs geometry construction without a
   DOM. If `import 'three'` touches `window`/`document` at load in the installed version, move the
   pure geometry math into `three`-free helpers and test those; keep `three` types only in the
   renderer path. Resolve in the first viz task.
2. **SAB in dev** — `crossOriginIsolated` needs the Vite headers *and* a browser that honours them
   over `localhost`. If SAB won't initialise, `PmBridge` must be a clean fallback from the first
   run — build and smoke `PmBridge` first, `SabBridge` second, behind the same test.
3. **Escape demo tuning** — `LOOM_CONE`, `looming` `TAU`, `ESCAPE_TH`, `CRUISE_THRUST`, object
   placement all interact. The node-wasm integration test pins "ramp → threshold" numerically;
   the *visible* veer is a manual-checklist tune. Budget an iteration pass; first-pass constants
   in the plan are a starting point, not final.
4. **Hover neutrality** — with fixture readouts resting near 0 and no brain bias, `HOVER_S` is
   effectively 0 and hover is a pure `body/` constant (`lift = GRAVITY*MASS` at rest). Keep the
   `LIFT_K * (s - HOVER_S)` form so Plan 03 can shift the operating point into the brain without a
   body rewrite.
5. **Frame-rate coupling** — `body/` integrates on render `dt`; a long stall → big `dt` → tunnelling.
   Clamp `dt` in `loop.ts` (`MAX_FRAME_DT`), same spirit as the worker's `MAX_CATCHUP_MS`.
```
