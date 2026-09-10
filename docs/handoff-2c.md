# Handoff — fly-playground, Plan 2c in progress

**Written:** 2026-09-10, mid-session. Supersedes nothing; complements
`docs/handoff-plan-02b-03.md` (whose Plan 02b section is now DONE).

---

## 1. Repo state right now

- `origin/main` == local `main` == **`ef3fd6b`**. Clean. `yarn ci` green, `yarn build` clean
  (no chunk-size warning).
- Contains: Plan 01, Plan 02, **all of Plan 02b** (12 tasks + a final-review fix wave + a
  Task-12-minor sweep), plus 3 housekeeping commits (`.gitignore .claude/`, crate metadata + MIT
  `LICENSE`, `three` split into its own vendor chunk).
- Branches / worktrees:
  | branch | worktree | commit | state |
  |---|---|---|---|
  | `main` | `/home/gb/projects/fly-playground` | `ef3fd6b` | the checkout you run `yarn dev` from |
  | `plan-02b-rich-loop` | `.claude/worktrees/plan-02b-rich-loop` | `848b99a` | **fully merged into main**; keeps only SDD scratch — safe to `git worktree remove --force` + `git branch -D` |
  | `plan-2c-brain-panel` | `.claude/worktrees/plan-2c-brain-panel` | `ef3fd6b` | **active** — Plan 2c work happens here |
- **Push policy (maintainer directive, 2026-09-10, recorded in `docs/handoff-plan-02b-03.md` and
  the 02b plan):** the implementing session pushes its branch and fast-forwards `origin/main`.
  For Plan 2c the cadence is: push the branch as tasks land; **merge to `main` once**, at plan
  completion + review (incremental FF of an in-flight plan kept leaving the maintainer's checkout
  behind — `git pull` in the main checkout after any push).

## 2. What Plan 02b delivered (brief)

On `main` now:

- **Sensing + steering:** per-eye `light_l/light_r` + bilateral `wind_l/wind_r` sensing; a
  mean-zero yaw-jitter fix (resting heading no longer wanders).
- **Bridge:** `setParams` wired through to the real `sim.set_params`; pause unified on the worker
  `running` flag; `SimState.paused` on both transports.
- **HUD (`src/ui/`):** edge-instrument DOM overlay — vertical "depth" (neuron-count) slider,
  readout + sensory meters (with a `loomingWarnColour` warn-lerp on the looming meter), a live
  6-param LIF tuning panel, a scene editor, theme / audio / pause controls. IBM Plex Mono/Sans
  self-hosted.
- **Audio (`src/audio/`):** procedural ambient bed + wing hum + escape blip; HUD mute/volume;
  silent until first gesture.
- **World editing (`src/world/`):** runtime `SceneStore` + `localStorage` persistence + live
  world rebuild + a boot guard that discards a malformed persisted scene.
- **Deep Field aesthetic (`src/viz/`):** dual `PALETTE_DARK`/`PALETTE_LIGHT` + a runtime
  light/dark toggle that re-themes the 3D scene (`renderer.setTheme` → `applyTheme` +
  `keyLight`); `EffectComposer` post-FX stack (bloom → vignette → grain → **`OutputPass`**);
  buoy world materials + a radial ground disc + a cool key light; an ember fly (emissive +
  parented `PointLight` on the bloom layer); a boot load sequence (banner types in → fly
  ignites → HUD fades in); `prefers-reduced-motion` branch; `viz/motion.ts` pure curves.

**Known limitations carried to Plan 03** (documented, not bugs):
- **Phototaxis is left-side-only.** The synthetic fixture's `light_r` neuron group (13/14/15) is
  partly inhibitory under its seed, so `light_r → wing_l` can't clear threshold. The test and app
  use `light_l → wing_r`. Full bilateral needs a fixture regen. See `src/sensing/sensing.ts`
  comment + `docs/manual-checklist.md`.
- **Real-GPU visual tuning pass owed:** bloom/vignette/grain values are first-pass; the buoy
  Fresnel rim is conservative and GPU-unverified; on the **light** theme the fly washes to a flat
  brown and buoys nearly match the background. `visual-direction.md` §7 rows **A5/A6/A12** are
  honestly `partial` pending a real-GPU eyeball.
- Radial ground-disc falloff is very diffuse; the dim `bounds` hairline has no mesh yet.
- `wasm-pack` locally is 0.13.1; 0.15.0 is out — a toolchain update, not a repo change; do it at
  a quiet moment and re-run `yarn ci`.

**02b SDD ledger with every ruling:**
`.claude/worktrees/plan-02b-rich-loop/.superpowers/sdd/2026-09-09-fly-playground-02b-rich-loop/progress.md`
(gitignored). Rulings were also summarised to the maintainer in-session.

## 3. Plan 2c — what it is, where it stands

**Goal:** relocate the connectome from a big fly-through world object into a small **docked
instrument panel** (top-left) with a **live neuron feed** — a per-role firing monitor, an
`NNN / 500` firing count, and region activity bars. Same point cloud, same core edges, same
activity colouring, rendered small + framed + slowly rotating, with the feed added. The fly then
flies through clear space.

**Spec (approved, committed):**
`docs/superpowers/specs/2026-09-09-fly-playground-2c-brain-panel-design.md` — full module map,
shared types, visual/behaviour spec, `CONFIG.brainPanel`, the `src/main.ts` seam, testing, risks.

**Progress:** `superpowers:writing-plans` was **in progress and interrupted**. I had:
- fast-forwarded the `plan-2c-brain-panel` worktree/branch onto `main` (`ef3fd6b`),
  `yarn install` + `yarn rs:wasm` done there;
- read every current-state file the plan will touch and worked out the deltas below.

**The implementation-plan doc (`docs/superpowers/plans/2026-09-09-fly-playground-2c-brain-panel.md`)
was NOT yet written.** Next action: write it (see §4), then
`superpowers:subagent-driven-development` — one implementer + one reviewer per task, per-task gate
(`npx vitest run && npx tsc --noEmit && npx eslint src && npx prettier --check "src/**/*.{ts,js}"
&& yarn build`), an Opus whole-branch review at the end, then merge `plan-2c-brain-panel` → `main`
and push.

## 4. Deltas from the spec I already worked out (don't re-derive)

The spec was written before Plan 02b merged. It's ~95% accurate; these are the adjustments — all
simplifications:

1. **`roleSummary` signature is wrong in the spec.** `RoleTable` (`src/sim/roles.ts`) maps role
   name → *vector index*, NOT → neuron-index lists. `roleSummary` needs the neuron indices per
   role (to average `activity` over `looming` neurons 0..7 etc.). Fix: `roleSummary(activity,
   roleNeurons: Record<string, readonly number[]>)` — a plain map. Build it in `main.ts` from
   `parseGroups(groupsJson)` → `{ ...inputRoles, ...readoutRoles }` (both are `Record<string,
   number[]>` on `GroupsFile`). Give `BrainPanel` the parsed `GroupsFile` (or the combined map) +
   `scaleFactor`, not `RoleTable`. `RoleFiring.background` = mean activity of neurons in **no**
   input and **no** readout role. `RoleFiring.yaw` ← the `yaw_torque` role.

2. **Dead scene-brain code to delete** (nothing else consumes it once the panel exists):
   `buildBrainPoints` + `buildCoreEdges` from `src/viz/builders.ts`; `src/viz/brain-material.ts`
   entirely; `src/viz/brain-material.test.ts`; the two `buildBrainPoints`/`buildCoreEdges` cases
   in `src/viz/builders.test.ts` (and trim its now-unused imports: `parseGraph`, the neurons
   `n`, the graph `g`). **KEEP** the pure `src/viz/geometry.ts` functions (`brainPositions`,
   `coreFlags`, `coreEdgePairs`, `activityColour`) — `panel-cloud.ts` uses them. `builders.ts`
   keeps `buildWorld` / `groundDisc` / `geometryFor`; trim its `makeBrainMaterial` +
   `brainPositions/coreFlags/coreEdgePairs` + `GraphFile` imports.

3. **`src/app/config.ts` removals:** `aesthetic.brainScale`, `aesthetic.brainCenter`,
   `aesthetic.POINT_DEPTH_NEAR/FAR/FADE` (only `brain-material.ts` read the depth dials — orphaned
   once it's deleted), and the two stale comments ("Brain point cloud lives as one big fixed
   object…" and "The 'Deep Field' aesthetic pass (Plan 02b) extends this block…" — 02b landed).
   **Add** `CONFIG.brainPanel` per spec §5.

4. **`src/app/config.test.ts`:** delete line ~17 `expect(CONFIG.aesthetic.brainScale)…`; add
   `expect("brainScale" in CONFIG.aesthetic).toBe(false)` + same for `brainCenter`; add the
   `brainPanel` §5 assertions. While in the file, drop the dead `const P = CONFIG as unknown as
   …; void P;` no-op (a carried 02b minor).

5. **`groupVisibilityArray` does not exist.** 02b's spec introduced it for the (never-built)
   scene filter, so it was cut. Plan 2c **adds** it to `src/viz/geometry.ts` (pure, no `three`):
   `groupVisibilityArray(neurons: NeuronsFile, hiddenGroups: Set<number>): Float32Array` — `1`
   per neuron, `0` where `groupId ∈ hiddenGroups`. Test in `src/viz/geometry.test.ts`.

6. **Region tints:** `palette.ts` has every Deep Field token EXCEPT the §2.2 region tints
   (`region-central #6FBF8E`, `region-optic #9B84E0`, `region-cord #5AA0D6`). Keep them as module
   constants in `role-monitor.ts` (which already owns the group→region map: `g0,g1,g2 → central`,
   `g3,g4 → optic`, `g5,g6,g7 → cord`) + consumed by `panel-cloud.ts`. Do NOT extend the
   `Palette` interface (would ripple `applyTheme` + `config.test.ts`). No `panel-palette.ts` shim
   needed — `palette.ts` retokenise landed with 02b.

7. **`src/main.ts` seam** (current file is 431 lines; the brain block is lines ~202–224 + the
   per-frame `aActivityArr.set` at ~280–283):
   - Remove: `buildBrainPoints`/`buildCoreEdges` import (keep `buildWorld`); `type
     { BufferAttribute }` import; lines ~202–217 (`points`, `edges`, shared-position wiring, the
     `brain` `THREE.Group`, `brainCenter`/`brainScale`, `points.frustumCulled`); `brain` from the
     `renderer.scene.add(brain, world3d, fly.object3d)` call (→ `add(world3d, fly.object3d)`);
     lines ~223–224 (`aActivity`/`aActivityArr`); the per-frame `aActivityArr.set(...)` +
     `aActivity.needsUpdate` block (~280–283).
   - Add: `import { parseGroups } from "./formats/groups"`; `const groupsFile =
     parseGroups(groupsJson)`; `const brainPanel = new BrainPanel(neuronsFile, graphFile,
     groupsFile, scaleFactor)` after `createRenderer`; `panelHandle.current = brainPanel`
     (the holder is already there at line ~137 for exactly this); `brainPanel.update(view, bootT)`
     in `onFrame` (the `bootT` `loadEnvelope` clock already exists — 02b laid it down);
     `brainPanel.setViewport(window.innerWidth, window.innerHeight)` in the `resize` handler;
     `import.meta.hot?.dispose(() => brainPanel.dispose())` for Vite HMR cleanup.
   - `scaleFactor` stays in scope (panel cloud needs it via `geometry.brainPositions`).

8. **`docs/2026-09-09-visual-direction.md`** — the §1.4 deviations: reword §0 (connectome is a
   captured instrument volume, not a space flown through); §5 motion table — "connectome idle"
   moves into panel scope, delete the "brain camera mode" row (orbit camera was cut, never
   built); §6.3/§6.4 notes; §7 status table — flip **A4** (point-cloud additive blending) and
   **A7** (core edges) → `done (Plan 2c)`; **A13** (region tints) → `partial (Plan 2c)` at low
   mix. Leave A5/A6/A12 `partial` (02b's real-GPU pass).

## 5. Proposed task decomposition (8 tasks, for writing-plans)

1. **`CONFIG.brainPanel` + `config.ts`/`config.test.ts` cleanup** (delta 3, 4). Foundational.
2. **`role-monitor.ts`** — pure, TDD: `roleSummary`, `firingCount`, `regionCounts` + the
   group→region map + region-tint constants. Tests per spec §7.1.
3. **`panel-view.ts`** — pure, TDD: `roleBarStyle`, `cardRect`, `regionBarOpacity`. Tests per
   spec §7.1.
4. **`geometry.ts` `groupVisibilityArray`** (delta 5) + **`panel-cloud.ts`** — `buildPanelCloud`
   returning `{ group, setActivity, setVisibleGroups, setEscapeFlash, tick }`; additive panel
   point material + per-segment-activity core-edge material (GLSL). Construct-only test per §7.2
   (+ the `geometry.test.ts` case for `groupVisibilityArray`).
5. **`panel-dom.ts`** — thin element creation, untested glue.
6. **`brain-panel.ts`** — `BrainPanel` class: dedicated `WebGLRenderer` + `Scene` + camera sized
   to the card, owns the DOM card, its own RAF for rotate/breath, `update(view, bootT)`,
   `setViewport`, `dispose`, `setGroupVisible`. Wires 2–5 together. `prefers-reduced-motion`
   branch. Untested glue (typecheck + build + manual checklist).
7. **`main.ts` seam + dead-code deletion** (delta 2, 7): delete `buildBrainPoints`/
   `buildCoreEdges`/`brain-material.ts` + their tests, wire `BrainPanel`.
8. **Docs + manual checklist + plan close** (delta 8): `visual-direction.md` §1.4 + §7 flips,
   `architecture.md` (`src/viz/brain-panel/`, connectome is panel-docked, orbit-camera cut),
   `README.md` status, `docs/manual-checklist.md` "Plan 2c" rows (spec §7.4), `yarn ci` +
   `yarn rs:smoke`.

## 6. Seam invariants (unchanged) + gotchas

- `FrameView` is **frozen** at `{ pose, readouts, sensory, activity, simHz, paused }`. Plan 2c
  adds no field to it — the feed is rate-coded off the existing per-neuron `activity` scalar
  (`firing` = `activity[i] >= CONFIG.brainPanel.firingThreshold`).
- Framework-free dirs (`bridge/`, `sensing/`, `body/`, `sim/`, `world/`) never import `three`.
  `src/viz/brain-panel/` may. The pure helpers (`role-monitor.ts`, `panel-view.ts`) import **no**
  `three` and **no** DOM — plain arrays + config in, plain data out.
- Two `WebGLRenderer`s (main + panel). Context count 2, well under the browser cap. Handle
  `webglcontextlost` on the panel canvas (pause its RAF; restore on `webglcontextrestored`).
- The panel's own RAF drives rotate/breath so the cloud still animates while the sim is paused;
  `update(view)` still runs from `main.ts` (02b publishes `FrameView` while paused) so
  bars/colour freeze at the paused values — correct.
- `HudControls.setGroupVisible` type is owned by 02b (`src/ui/controls.ts`); Plan 2c's panel
  imports it and the panel filter checkboxes both update the panel cloud AND call it, and
  `main.ts` sets `panelHandle.current = brainPanel` so the contract is wired.

## 7. How this session has been running plans

`superpowers:brainstorming` → `superpowers:writing-plans` → `superpowers:subagent-driven-development`.
Per task: one implementer subagent (model chosen by task shape — haiku for pure transcription,
sonnet default, opus for design-judgment/aesthetic tasks) + one reviewer subagent, a per-task
gate + one commit, a fix loop (max 5 rounds) on Important/Critical findings. At plan end: an Opus
whole-branch review → one combined fix wave → one scoped re-review → merge to `main`. Every
ruling logged in the plan's SDD ledger (`.superpowers/sdd/<plan-basename>/progress.md`).
