# Handoff — fly-playground Plan 02b + Plan 03

**Current handoff (2026-09-10):** Plan 2c is implemented. Continue from the
[2c implementation/validation record](superpowers/plans/2026-09-10-fly-playground-2c-brain-panel.md),
which supersedes the historical parallel-branch and camera assumptions below.
Next work is real anatomy and circuit-driven behavior (Plan 03); hardware-GPU
performance verification remains open. Do not restart from the old 2c worktree.

**Written:** 2026-09-09 · for an agent picking up the next two plan cycles.
**Repo state at handoff:** `main` + the brain-viz visibility fix (branch
`fix/brain-point-cloud-visible`, commit `ffc7f93`) + a follow-up "dark spots"
aesthetic tweak on top. Confirm both are merged into `main` before you start;
`git log --oneline -5` should show them.

---

## How to run this

Each plan is its own full cycle, exactly how Plans 01 / 02 were run:

1. `superpowers:brainstorming` — settle intent, scope, and design with the maintainer.
2. `superpowers:writing-plans` — write the plan to
   `docs/superpowers/plans/2026-09-09-fly-playground-02b-*.md` (then `-03-*.md`).
3. `superpowers:subagent-driven-development` — execute task-by-task, with a
   **diff review + fix loop per task** and an **opus whole-branch review** at the end.

Do **02b first, then 03** — 03 depends on 02b's HUD/camera/tuning surfaces.

### Task gate (every change, before commit)

```
npx vitest run && npx tsc --noEmit && npx eslint src \
  && npx prettier --check "src/**/*.{ts,js}" && yarn build
```

`yarn ci` is the full gate (adds Rust fmt/lint/test, wasm build, pytest, fixture
byte-check). Branch off `main`. **The implementing session merges and pushes** —
keep `origin/main` current, fast-forwarding it after each plan's review passes
rather than batching at the end (maintainer directive, 2026-09-10). Fast-forward
merges only; no PR ceremony required.

### Commit trailer (every commit body ends with)

```
Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: <your session URL>
```

### Repo facts you need

- **App:** `yarn dev` → http://localhost:5173. Fly cruises +X from `(0,4,0)`,
  senses proximity + looming, does a giant-fiber escape off the block at `(9,4,0)`.
  HUD (`#hud`) shows `sim NN Hz · NN fps`.
- **Pure core is TDD'd** (`src/bridge`, `src/sensing`, `src/body`, `src/sim`,
  `src/formats`, `src/app`, `src/viz/geometry.ts`, `src/viz/brain-material.ts`).
  `src/viz/*` renderer paths + `src/main.ts` touch `three` and are **not**
  unit-tested — that is how the brain-invisible bug shipped. Keep new logic in
  pure helpers with node-`vitest` tests; `three` imports are fine under vitest
  (node env) for construction-only assertions (see `brain-material.test.ts`,
  `builders.test.ts`).
- **vitest env is `node`.** No DOM, no `@types/node` as a dep.
- **Sim API** (`crates/fly-sim`, WASM `Sim`): `new(neurons,graph,seed)`,
  `define_input_role(name,&[u32])->u32`, `define_readout_role(...)->u32`,
  `inject(role_id,value)` (accumulates; **cleared every `step()`** — re-inject
  before every tick), `step(ticks)`, `readout(role_id)->f32` (EMA fraction
  spiking, ~0..1), `activity_snapshot()->Vec<f32>` (len = `active_count`, ~0..1),
  `set_active_count(n)` (clamps `[core_count, neuron_count]`, O(1) — edges skip
  targets `>= active`), `set_params(dt_ms, tau_m_ms, v_threshold, v_reset,
  refrac_ms, noise_sigma)`, `core_count()`, `neuron_count()`, `sim_abi_version()`.
- **Fixture** (`pipeline/out/fixture/`, committed, byte-reproducible via
  `pipeline/gen_fixture.py`): 500 neurons, `core_count = 48`, `w_norm = 0.01`,
  `scale_factor = 1.0`.
  - Input roles: `looming` 0..7, `light_l` 8..11, `light_r` 12..15,
    `proximity` 16..19, `wind_l` 20..21, `wind_r` 22..23.
  - Readout roles: `escape` 24..31, `wing_l` 32..35, `wing_r` 36..39,
    `thrust` 40..43, `yaw_torque` 44..47.
  - Wired: strong `looming → escape`; weak `light_l → wing_r`,
    `light_r → wing_l`; sparse random background. **No path to `thrust` /
    `yaw_torque` from any input** (that is fine — those come from the body
    constants until Plan 03's tonic drive).
- **Config:** `src/app/config.ts` — one `CONFIG` object, `as const`, keep it that
  way. `src/scene.config.ts` — the static world (objects + lights). `SCENE` and
  `CONFIG` are the two tuning surfaces.
- **Spec:** `docs/superpowers/specs/2026-09-09-fly-playground-02-app-shell-design.md`
  §8 is the authoritative deferred-scope cut. Read §2 (module map), §9 (risks).

---

# PLAN 02b — "rich loop + controls" ✅ COMPLETE

**Status:** executed as
`docs/superpowers/plans/2026-09-09-fly-playground-02b-rich-loop.md` (12 tasks,
branch `plan-02b-rich-loop`). Section-by-section outcome:

- [x] **A. Sensing + steering** — per-eye inverse-square light, a rotating wind
      vector field, both EMA'd in the pure `sensing.ts`; the yaw-noise channel
      folded into the correlated-noise treatment (resting heading now bounded).
      *Open:* with the seed-42 fixture the phototaxis turn is only observable
      from a **left-side** light — documented in `sensing.ts`, ruling stands.
- [x] **B. HUD** — `src/ui/*`: depth slider (log `core_count`→`N`), readout +
      sensory meters, LIF panel through a fixed `setParams` worker branch,
      theme + mute/volume cluster, scene editor. Region/class filter checkboxes
      are deliberately **absent** — they belong to Plan 2c's docked panel.
- [~] **C. Brain viz + camera** — **split out to Plan 2c.** 02b landed the
      aesthetic half (palette, `EffectComposer`, world/fly, motion, load
      sequence) and **froze `FrameView`** as 2c's seam. Still 2c's: the docked
      connectome panel + region filters, per-segment core-edge brightness /
      pathway pulse, connectome breath, the points-converge load phase, and the
      orbit/free-fly brain camera (that camera mode → **Plan 03**).
- [x] **D. Audio** — `src/audio/*`: lazy `AudioContext`, ambient bed, wing hum,
      escape blip, HUD mute + volume, starts muted until a gesture.
- [x] **E. Runtime world editing** — `src/world/*`: `SceneStore`, versioned
      `localStorage` persistence, live world rebuild with GPU dispose, editor UI.
- [x] **F. Carried-over cleanups** — one pause mechanism (`running`, with
      `paused` published through the ring), `activityColour` blue-channel dip.

Everything below is the original 02b brief, kept for provenance.

## A. Sensing + steering (`src/sensing/`, `src/body/`, `src/main.ts` wiring)

- **Per-eye light → phototaxis.** Compute `light_l` / `light_r` from the scene's
  lights (the fixture already wires `light_l → wing_r`, `light_r → wing_l`, i.e.
  contralateral). One-sided light should drive a **sustained** turn toward it.
  `src/sensing/sensing.ts` is pure — add the per-eye light term there with a
  vitest test (angle of light vs. eye axis → per-channel scalar, EMA'd like
  `proximity` / `looming`). Wire the two channels into the stimulus vector in the
  loop.
- **Wind vector field → bilateral antennal channel** (`wind_l` / `wind_r`).
  Optional / stretch. A slow spatial vector field sampled at the two antennae.
- **Fold the yaw-torque noise channel into the correlated-noise treatment.**
  Commit `2cef944` correlated the wing-pair noise to kill an at-rest roll bias.
  A resting fly still wanders **~50°/15 s in heading** (bounded but wrong — hover
  should be the neutral state). Same 2-line shape of fix in `src/body/wrench.ts`
  as `2cef944` did for the wings; extend `src/body/wrench.test.ts` to pin
  bounded-heading-at-rest.

## B. HUD (`src/ui/` — new module)

Framework-free, same discipline as the rest: pure state + a thin DOM render, or a
tiny hand-rolled component. Wire everything end-to-end.

- **Neuron-count slider** — log scale from `core_count` to `nNeurons`, shows live
  `sim_hz`. Calls `bridge.setActiveCount(n)`.
- **Readout meters** — thrust / yaw / escape (from `view.readouts`).
- **Sensory meters** — proximity / looming / light L·R (from the stimulus vector).
- **Region / class filter checkboxes** — stretch.
- **LIF live-tuning panel** — sliders for `set_params(dt_ms, tau_m_ms,
  v_threshold, v_reset, refrac_ms, noise_sigma)`. **Bug to fix as part of this:**
  `setParams` is wired through `sim-bridge.ts` / `pm-bridge.ts` / `sab-bridge.ts`
  / `protocol.ts` but **`src/bridge/sim.worker.ts` has no `m.t === "setParams"`
  branch in `onmessage`, so it is silently dropped.** Add the handler + a
  `WorkerCore.setParams` that calls `sim.set_params(...)`, with a
  `worker-core.test.ts` case.

## C. Brain viz + camera (`src/viz/`, `src/main.ts`)

- **Second camera mode** — orbit / free-fly through the connectome, fly as a
  marker; toggle key. Optional docked corner brain panel while in follow mode.
  The brain point cloud is now a `THREE.Group` at `CONFIG.aesthetic.brainCenter`
  scaled by `brainScale` (set by the Task 1 fix) — the free camera should be able
  to fly around/through it.
- **Per-segment core-edge brightness.** `src/viz/builders.ts buildCoreEdges`
  currently renders `LineSegments` at a static `opacity: 0.35`. Drive per-segment
  brightness from endpoint `aActivity` so the loom → GF → wing-motor pathway
  visibly lights up during an escape. (Needs a custom line material or vertex
  colors; the edge geometry shares the point cloud's position buffer.)
  - **Related placement note:** the escape currently fires when the fly is at the
    cloud's +X edge (`x≈9`) with the dense core (`x≈6`) already *behind* the
    follow-camera, so the "core flushes hot" moment is off-screen in follow mode.
    Nudge `CONFIG.aesthetic.brainCenter.x` toward ~8–9, or rely on the brain
    camera mode / corner panel to show it. Decide during brainstorming.
- **Aesthetic pass** (`frontend-design` skill) — post-processing / bloom via an
  `EffectComposer` (deliberately excluded from Plan 02), grain, refined palette,
  a better fly model. Additive blending *may* return here **if** paired with a
  darker background — but the Task 1 fix deliberately moved to opaque
  `NormalBlending` "dark ink on light ground", so this is a palette-level
  decision, not a revert.

## D. Audio (`src/audio/` — new module)

- **Ambient bed** — a looped sample, or 2–3 detuned oscillators through a lowpass.
- **Reactive one-shots** — escape blip; wingbeat hum tracking `wing_l + wing_r`.
- **Master mute / volume in the HUD.** Starts **muted** until the first user
  gesture (autoplay policy).

## E. Runtime world editing

- UI to place an object / move a light **at runtime** (`src/scene.config.ts` is
  currently static). This is the maintainer's "add objects in space, add light"
  goal. Needs the scene builder (`src/viz/builders.ts buildWorld`) and the
  collision world (`src/app/world-query.ts`) to accept mutations, not just a
  one-time build.

## F. Small carried-over cleanups (fold into whatever task is nearby)

- `src/bridge/sim.worker.ts` — `paused: running ? 0 : 1` is **inside**
  `if (running)`, so it is always `0`. The `RingLayout` PAUSED slot and
  `WorkerCore.pause()` / `resume()` are dead (the worker gates on its own
  `running` flag). Pick **one** pause mechanism and delete the other.
- `src/viz/geometry.ts activityColour` — blue channel dips at the amber midpoint
  (`0.169 → 0.122 → 0.835`). Cosmetic, and the function is currently **only used
  by its own test** (the frag shader does its own `mix(uCold, uHot)`), so either
  fix the ramp or delete the unused helper.

## Out of scope for 02b (→ Plan 03)

Real connectome data; deploy; bundle code-splitting / `manualChunks`; tonic brain
drive.

---

# PLAN 03 — "real data + deploy" ("connect it to the connectome")

Its own brainstorm → plan → execute cycle, **after** 02b.

- **Python pipeline vs the ~1.1 GB MaleCNS v1.0 download:**
  `fetch → filter → tier → core_circuit → emit_bin`. Extend `pipeline/`.
- **neuPrint type → bodyID mapping** for the core circuit (looming / giant-fiber
  / descending / wing-motor). **This is the biggest risk** — the whole "the brain
  drives the behaviour" story depends on getting this circuit right.
- **`W_NORM` tuning** so the core circuit spikes at sensible rates — an iteration
  loop against `docs/manual-checklist.md`, not a one-shot.
- **Real soma positions** for the point cloud, with fallbacks: `somaLocation` →
  SWC roots → synapse centroid.
- **`crates/fly-sim/src/core/format.rs` wasm32 hardening** (prereq — do this
  early).
- **Asset hosting** for the large `graph.bin` + **IndexedDB cache** keyed by
  `manifest.version`.
- **Per-group-means snapshot decimation at high N.** The stride hook in
  `src/bridge/worker-core.ts frame()` (`stride = ceil(activeCount / nSnapshot)`,
  then `snap[i*stride]`) is a **placeholder** — it subsamples, it does not take
  group means. Replace with real per-group aggregation.
- **Tonic brain drive (bias)** so hover / cruise come from the brain, not the
  `CONFIG.physics.CRUISE_THRUST` / `LIFT_K` constants. Spec §9 risk 4: keep the
  `LIFT_K * (s - HOVER_S)` form so the operating point can shift into the brain
  without a `body/` rewrite.
- **Deploy target** + production **COOP/COEP headers** (or a documented
  postMessage-only path), and **`manualChunks`** to split the 767 kB bundle
  (the `yarn build` chunk-size warning is this).

---

## Appendix — module map (current)

```
src/
  app/       config.ts (CONFIG, as const), loop.ts, world-query.ts   [pure, tested]
  body/      6DOF: body, integrate, collision, quat, wrench, noise    [pure, tested]
  bridge/    sim worker transport: sim-bridge / pm-bridge / sab-bridge,
             protocol, ring, worker-core, step-accumulator, sim.worker.ts
  formats/   neurons / graph (CSR) / groups decoders, fixture helpers  [pure, tested]
  sensing/   raycast, sensing (proximity + looming, pure)              [pure, tested]
  sim/       roles (role table from groups)                            [pure, tested]
  viz/       geometry (pure, tested), brain-material (tested),
             builders / renderer / fly / follow-camera / palette       [three; mostly untested]
  main.ts    browser boot + RAF loop                                   [not tested]
  scene.config.ts   static world (SCENE)
```

New in 02b: `src/ui/` (HUD + `scale.ts`), `src/audio/` (`audio.ts` + pure
`mapping.ts`), `src/world/` (`scene-store.ts` + `scene-persist.ts`), and
`src/viz/{motion,post,palette}.ts`.
