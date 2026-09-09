# fly-playground — Plan 2c design / spec: docked brain panel + live neuron feed

**Date:** 2026-09-09
**Status:** approved in brainstorming (all sections) — proceed to written-spec review, then writing-plans
**Parent design:** [`docs/2026-09-09-design.md`](../../2026-09-09-design.md) ·
visual direction [`docs/2026-09-09-visual-direction.md`](../../2026-09-09-visual-direction.md) ("Deep Field", committed `9c6ea39`)
**Sibling plan:** Plan 02b "rich loop + controls"
([`2026-09-09-fly-playground-02b-rich-loop-design.md`](./2026-09-09-fly-playground-02b-rich-loop-design.md)) —
runs in parallel on branch `plan-02b-rich-loop`. Scope split is recorded in §1.3.
**Branch:** `plan-2c-brain-panel` off `main` (`9c6ea39`).

---

## 0. The problem

Plan 02 shipped the connectome as **one big world-space object**: `src/main.ts` wraps the brain
point cloud + core edges in a `THREE.Group`, scales it 10×, and parks it at
`CONFIG.aesthetic.brainCenter = (6, 5, 0)` — on the fly's cruise line between its start `(0, 4, 0)`
and the escape block `(9, 4, 0)` — "so the fly flies through the connectome"
(`config.ts:59-64`, `main.ts:71-80`). In practice this reads as a large amorphous blob hanging in
the flight path. It is not legible as a brain, it occludes the world, and there is no way to see
*which* neurons are active beyond a faint shimmer as the fly passes through.

## 1. Goal of Plan 2c

**Relocate** the connectome from world space into a small **docked instrument panel**, top-left,
and give it a **live neuron feed**: a per-role firing monitor, a global firing count, and region
activity bars — so the brain becomes something you *read*, not something you *fly through*.

Nothing about the connectome visual is lost: the same point cloud, the same core edges, the same
per-neuron activity colouring — rendered small, framed, slowly rotating, with the feed added.

### 1.1 In scope

- A new `src/viz/brain-panel/` module: a `BrainPanel` class owning a **dedicated** small
  `WebGLRenderer` + `Scene` + camera, plus the DOM card (canvas + feed rows + group filter).
- Removal of the world-space brain placement from `main.ts` and `CONFIG.aesthetic`.
- The per-segment core-edge activity glow (loom→GF→motor pathway lights on escape) — **now inside
  the panel**, not on a scene object. (Plan 02b's spec §6.1 assigned this to a scene material;
  Plan 2c takes it. Coordinated — see §1.3.)
- The region / class filter checkboxes (`g0…g7` show/hide) — **in the panel**, calling 02b's
  `HudControls.setGroupVisible` (type owned by 02b).
- Pure, tested helpers for every derivation (role means, firing count, region counts, bar styling,
  card rect).
- `prefers-reduced-motion` branch.
- The panel's half of the Deep Field load sequence ("points converge out of the dark").

### 1.2 Non-goals (→ Plan 03 or owned by 02b)

- **No new sim / worker / protocol fields.** `FrameView` is frozen (agreed with 02b). The feed is
  rate-coded off the existing per-neuron `activity` scalar; "firing" is a threshold on it. No
  per-spike events, no membrane V.
- **No orbit / fly-through camera.** Plan 02b's spec §6.4 (`brain-camera.ts`, `OrbitControls`) and
  §6.5 (`renderInset` scissor viewport) are **cut** — superseded by this panel. 02b's removal pass
  deletes those.
- **No real connectome data**, no neuPrint types, no `W_NORM` tuning — Plan 03.
- **No shared renderer.** The panel does not render as a scissor region of the main
  `WebGLRenderer`; it has its own. Rationale in §3.1.
- **Not owned here:** sensing/steering, the main HUD (depth slider, meters, LIF panel, theme,
  audio, camera toggle), runtime world editing, the non-panel aesthetic pass (scene palette,
  post-FX/bloom, fly, world buoys, ground). All Plan 02b.

### 1.3 Scope split with Plan 02b (agreed between the two implementing sessions)

| area | owner |
|---|---|
| docked brain panel, per-neuron/role feed, panel cloud + panel core-edge glow, group-filter UI, `CONFIG.brainPanel`, removal of `brainCenter`/`brainScale` + the scene brain `Group` | **Plan 2c** |
| light/wind sensing + phototaxis, yaw-noise fix, bridge `setParams` + pause cleanup | Plan 02b |
| main HUD (`src/ui/`), audio (`src/audio/`), runtime world editing + persistence (`src/world/`) | Plan 02b |
| scene palette retokenise, `EffectComposer` post-FX, fly refinement, world buoys/ground, load banner | Plan 02b |
| deletion of orbit camera / `renderInset` / `brain-camera.ts` / scene `edge-material.ts` / scene `aGroup`/`aVisible` attributes / `brainCenter.x` escape-nudge | Plan 02b's removal pass (no conflict — pure deletion) |
| `HudControls.setGroupVisible` **type** | Plan 02b (Plan 2c imports + calls it) |

**`src/main.ts` is the one shared file.** Plan 2c owns ~10 lines (delete scene brain, construct +
`update` + `dispose` the panel). Plan 02b owns the HUD/audio/scene-store/theme/banner wiring.
Whichever PR merges first lays down a shared `loadEnvelope` clock in `main.ts`; the other hooks
into it. Merge order is sequenced by a ping when each PR is up.

### 1.4 `docs/2026-09-09-visual-direction.md` deviations recorded by Plan 2c

The committed "Deep Field" doc assumes the fly-through connectome. Plan 2c invalidates parts of
it; the implementation updates the doc in the same PR:

- **§0 one-sentence brief** — "pilot a … fly through a vast … connectome" reworded: the connectome
  is now a captured instrument volume shown in a panel, not a space traversed.
- **§5 motion table** — the "connectome idle" (breath + sparkle) and "brain camera mode" rows move
  into panel scope; "brain camera mode" (drift-orbit while free-flying) is deleted with the orbit
  camera.
- **§6.3** — the `POINT_MAX` clamp rationale ("the fly flies *through* the cloud: without a cap, a
  point a fraction of a unit from the camera fills the screen") no longer applies. Point sizing is
  panel-framed; the clamp stays only as a cheap guard.
- **§6.4 core edges** — the loom→GF→motor travelling pulse happens in the panel.
- **§7 status table** — A4 (point-cloud blending) and A7 (core edges) are Plan 2c's; A13 (region
  tints) is pulled forward into Plan 2c at low mix (§4.2) rather than deferred.

## 2. Where Plan 02 left off (context for the implementer)

- **`src/viz/geometry.ts`** — pure, no `three`. `brainPositions(n, scaleFactor)`, `coreFlags(n)`,
  `coreEdgePairs(g, coreCount)`, `activityColour(t) → [r,g,b]`. **Reused unchanged.**
- **`src/viz/builders.ts`** — `buildBrainPoints(neurons, scaleFactor) → THREE.Points` (attributes
  `position`, `aCore`, `aActivity`); `buildCoreEdges(graph, coreCount) → THREE.LineSegments`
  (index-only; consumer binds `position`). Plan 2c adds a panel-specific builder rather than
  changing these (see §3.2).
- **`src/viz/brain-material.ts`** — `ShaderMaterial`, per-vertex `aCore`/`aActivity`; uniforms
  from `CONFIG.aesthetic` + `PALETTE`. Currently `NormalBlending`, opaque, `depthWrite:true`
  ("dark ink on light ground" — additive made points vanish on the cream background). The panel
  background is always `--void`, so the panel material goes **additive** (§4.1).
- **`src/main.ts`** — `main.ts:65-88` builds `points` + `edges`, shares the position buffer,
  wraps them in `brain` (`THREE.Group`), applies `brainCenter`/`brainScale`,
  `renderer.scene.add(brain, world3d, fly.object3d)`, and pushes `view.activity` into the
  `aActivity` attribute each frame (`main.ts:106-109`). **These lines change** — see §6.
- **`src/app/loop.ts`** — `FrameView = { pose, readouts, activity, simHz }` today; Plan 02b grows
  it to `{ pose, readouts, sensory, activity, simHz, paused }`. Plan 2c consumes whatever the
  merged `FrameView` is and **adds no field**.
- **`src/app/config.ts`** — one `CONFIG` object, `as const`. `CONFIG.aesthetic.brainScale` /
  `brainCenter` exist only for the world placement — **deleted** by Plan 2c.
- **Fixture** (`pipeline/out/fixture/`): 500 neurons, `coreCount = 48`, `scale_factor = 1.0`.
  `NeuronsFile` carries `groupId: Uint16Array` (8 groups `g0..g7`), `pos: Float32Array` (`count*3`),
  `flags` (`isCore`/`isInhibitory`/`isInput`/`isReadout`), `count`. `RoleTable` (`src/sim/roles.ts`)
  maps role name → neuron index list. Input roles: `looming` 0..7, `light_l` 8..11, `light_r`
  12..15, `proximity` 16..19, `wind_l` 20..21, `wind_r` 22..23. Readout roles: `escape` 24..31,
  `wing_l` 32..35, `wing_r` 36..39, `thrust` 40..43, `yaw_torque` 44..47.
- **`activity_snapshot()`** length = `active_count`; values ~`[0, 1]` (EMA fraction spiking per
  neuron). `readout(roleId)` ~`[0, 1]` (EMA fraction spiking across the role's neurons).
- **Test env:** vitest `node`. Pure logic is TDD'd; `three` construction-only assertions are fine
  under `node` (see `brain-material.test.ts`, `builders.test.ts`). Renderer RAF paths + `main.ts`
  are not unit-tested — keep new logic in pure helpers.
- **Task gate:** `npx vitest run && npx tsc --noEmit && npx eslint src && npx prettier --check
  "src/**/*.{ts,js}" && yarn build`. `yarn ci` is the full gate. Branch off `main`; the maintainer
  merges + pushes.

## 3. Module map

```
src/viz/brain-panel/                    NEW
  brain-panel.ts        BrainPanel class — dedicated WebGLRenderer + Scene + PerspectiveCamera
                        sized to the card; owns the DOM (<div> card → <canvas> + feed rows +
                        filter strip). ctor(neurons, graph, roleTable); update(view: FrameView);
                        setViewport(w,h); dispose(). Its own RAF for rotate/breath.  [three glue — untested]
  panel-cloud.ts        buildPanelCloud(neurons, graph) -> {
                          group, setActivity(Float32Array), setVisibleGroups(Set<number>),
                          setEscapeFlash(t01), tick(dtSeconds)
                        }.  Reuses geometry.ts verbatim; panel point + edge materials.  [construct-only test]
  role-monitor.ts       PURE + tested: roleSummary(activity, roleTable) -> RoleFiring;
                        firingCount(activity, threshold) -> number;
                        regionCounts(activity, neurons) -> [central, optic, cord].
  panel-view.ts         PURE + tested: roleBarStyle(name, value, cfg) -> { widthPct, ramp, glow };
                        cardRect(viewport, cfg) -> { x, y, w, h } (px, clamped, frac fallback);
                        regionBarOpacity(count, total) -> number.
  panel-dom.ts          THIN: buildCardDom() -> { root, canvas, rows, countEl, regionBars,
                        filterStrip } — element creation only, no logic.  [untested glue]
src/app/config.ts       CHG — remove aesthetic.brainScale / aesthetic.brainCenter; add CONFIG.brainPanel
src/main.ts             CHG — delete scene brain Group + brainCenter/brainScale + the aActivity
                        push to the scene cloud; construct BrainPanel; brainPanel.update(view) in
                        onFrame; brainPanel.dispose() on teardown; lay down / hook the loadEnvelope clock
index.html              CHG — the panel <div> is created by JS; add only the CSS custom-property
                        block for the Deep Field panel tokens if not already present from 02b
```

**Seam invariants (unchanged from Plan 02):** `src/bridge/`, `src/sensing/`, `src/body/`,
`src/sim/`, `src/world/` never import `three`. `src/viz/brain-panel/` may import `three`. The pure
helpers (`role-monitor.ts`, `panel-view.ts`) import **no** `three` and **no** DOM — they take
plain arrays + config and return plain data.

### 3.1 Why a dedicated `WebGLRenderer`

- The panel needs **`AdditiveBlending` + `depthWrite:false`** on an always-`--void` background for
  the bioluminescent glow. The main scene can't — Plan 02b's aesthetic pass is a palette-level
  decision and the ground stays comparatively light; the scene brain material history
  (`brain-material.ts` comment) is exactly this conflict.
- The panel has its **own camera and slow auto-rotate**, independent of the follow camera.
- The panel must **not** interact with 02b's `EffectComposer` / `UnrealBloomPass` pass or the main
  resize path. A scissor viewport shares one composed frame; separating them keeps both simple.
- Cost: a second `WebGLRenderer` on a ~300×348 canvas drawing ~500 points + a few hundred core
  edges once per frame. Negligible. Context-count is 2, well under the browser limit.

### 3.2 Why `panel-cloud.ts` instead of reusing `builders.ts` directly

`buildBrainPoints` bakes in `makeBrainMaterial()` (the scene material, `NormalBlending`).
`panel-cloud.ts` calls the **pure** `geometry.ts` functions (`brainPositions`, `coreFlags`,
`coreEdgePairs`) and attaches **panel** materials (additive point material, `pathway` edge
material with the per-segment activity glow). No duplication of geometry math; only the material
choice differs.

### 3.3 Shared types

```ts
// src/viz/brain-panel/role-monitor.ts
export interface RoleFiring {
  looming: number; escape: number;
  wing_l: number; wing_r: number;
  thrust: number; yaw: number;      // yaw = the "yaw_torque" role
  background: number;               // mean activity of neurons in no readout/input role
}
export function roleSummary(activity: Float32Array, roles: RoleTable): RoleFiring;
export function firingCount(activity: Float32Array, threshold: number): number;
export function regionCounts(
  activity: Float32Array, neurons: NeuronsFile, threshold: number,
): [number, number, number];          // [central, optic, cord] — group→region map in §4.2

// src/viz/brain-panel/panel-view.ts
export type RoleName = keyof RoleFiring;
export interface BarStyle { widthPct: number; ramp: "spark" | "warn"; glow: boolean; }
export function roleBarStyle(name: RoleName, value: number, cfg: BrainPanelConfig): BarStyle;
export interface Rect { x: number; y: number; w: number; h: number; }
export function cardRect(viewport: { w: number; h: number }, cfg: BrainPanelConfig): Rect;
export function regionBarOpacity(count: number, activeTotal: number): number;   // [0.25, 1]

// src/viz/brain-panel/brain-panel.ts
export class BrainPanel {
  constructor(neurons: NeuronsFile, graph: GraphFile, roles: RoleTable, cfg?: BrainPanelConfig);
  update(view: FrameView): void;      // the only per-frame data intake
  setViewport(w: number, h: number): void;   // main.ts calls on window resize
  dispose(): void;
}
```

## 4. Visual & behaviour spec (Deep Field)

Colours are the `docs/2026-09-09-visual-direction.md` §2 tokens. The panel reads them from the
same CSS custom properties / `PALETTE` that 02b establishes; if 02b has not landed the retokenise
when Plan 2c builds, Plan 2c ships a local `panel-palette.ts` with the §2 hexes and a `// TODO:
fold into palette.ts once 02b lands` note.

### 4.1 The card

- 300px wide, ~348px tall (grows ~24px when the filter strip is open). Anchored 24px in from the
  top-left frame inset (`CONFIG.brainPanel.rect`, with a viewport-fraction fallback for non-1080p
  via `cardRect`).
- `background: linear-gradient(180deg, rgba(15,26,46,.66), rgba(7,11,20,.72))`; 1px
  `--line-strong` border; 4px radius; `backdrop-filter: blur(2px)` if cheap, else omit.
- **Header row** — `connectome` (Plex Sans, `--text-dim`) left; `NNN / 500` firing count (Plex
  Mono, `tabular-nums`, `--spark` when > 0, dim at rest) right.
- **Region bars** — 3 hairline bars under the header, `--region-central` / `--region-optic` /
  `--region-cord`, opacity from `regionBarOpacity`.

### 4.2 The cloud sub-view

- ~120px-tall `<canvas>`. Fuzzy ellipsoid point cloud, wider than tall (`geometry.ts` positions,
  no world scale — fit to the canvas with the panel camera).
- **Region tint (pulls A13 forward, low mix):** rest colour `mix(neuron, regionTint,
  CONFIG.brainPanel.regionTintMix)` (default `0.33`); as `aActivity → 1` the point lerps to
  `spark` (activity always wins, sim read stays legible). Group→region map for the fixture's 8
  groups: `g0,g1,g2 → central`, `g3,g4 → optic`, `g5,g6,g7 → cord` (documented constant in
  `role-monitor.ts`; Plan 03 replaces it with real neuropil data).
- **Blending:** `AdditiveBlending`, `depthWrite:false`, circular `discard` in the fragment
  shader, soft radial alpha falloff (`1.0 - smoothstep(0.35, 0.5, r)`) so points read as glows.
- **Core edges:** `LineSegments` sharing the cloud's position buffer, colour `--pathway`, base
  opacity `CONFIG.brainPanel.edgeOpacity` (`0.15`). Per-segment brightness from endpoint
  `aActivity` (vertex-coloured or a small `ShaderMaterial` reading a shared `aActivity`
  attribute) so a segment with one hot endpoint glows toward it.
- **Motion:** auto-rotate about the panel's up axis at `cloudRotateHz` (~6°/s); global "breath"
  ×(1 ± `breathAmp`) at `breathHz` on point size + additive intensity.
- **Escape:** rising edge of `view.readouts.escape` past `CONFIG.physics.ESCAPE_TH` →
  `setEscapeFlash(1)`; the panel decays it to 0 over `escapeDecayS` (~0.3s). While > 0: a white
  bloom over the cloud and a bright `--escape-warm` pulse travelling the core edges.

### 4.3 The role monitor

Seven DOM rows (not canvas — crisp text): `label (Plex Sans) · track · value (Plex Mono
tabular)`.

| row | source | ramp |
|---|---|---|
| `looming` | `roleSummary().looming` | **warn**: `neuron → --ember → --escape-warm` as it climbs toward `ESCAPE_TH` |
| `escape` | `.escape` | spark: `neuron`, → `linear-gradient(neuron → spark)` + glow when > `hotRowThreshold` |
| `wing l` | `.wing_l` | spark |
| `wing r` | `.wing_r` | spark |
| `thrust` | `.thrust` | spark |
| `yaw` | `.yaw` | spark |
| `background` | `.background` | spark |

`roleBarStyle(name, value, cfg)` returns `{ widthPct, ramp, glow }`; `panel-dom.ts` applies it.
No business logic in the DOM layer.

### 4.4 Region / class filter

- A collapsed `▸ groups` strip at the card bottom. Expanded: 8 tick-boxes `g0…g7`, all checked.
- Toggling `gN`: the panel maintains a local `hiddenGroups: Set<number>`, rebuilds the cloud's
  `aVisible` attribute (via `geometry.ts` `groupVisibilityArray` — see risk 4 for the ownership
  agreement with 02b), sets `needsUpdate`; **and** calls
  `controls.setGroupVisible(gN, checked)` so the shared `HudControls` contract stays wired even
  though only the panel has a brain to filter now.
- Core edges are unaffected (core membership ⟂ group).

### 4.5 `prefers-reduced-motion: reduce`

Drop auto-rotate, breath, and the escape flash's size kick. Keep: point activity colour, the
edge glow (opacity only, no travelling pulse — jump to lit), bar movement, count, region bars.
Cloud holds a static ¾ view.

### 4.6 Load sequence (Plan 2c's half of visual-direction A10)

On boot, the panel points converge from a scattered/dim state to their positions and fade up over
~1.2s, timed off the shared `main.ts` `loadEnvelope` clock. Under `prefers-reduced-motion` they
fade in place.

## 5. `CONFIG.brainPanel`

```ts
// removed from CONFIG.aesthetic: brainScale, brainCenter
brainPanel: {
  rect: { xPx: 24, yPx: 24, wPx: 300, hPx: 348 },
  rectFrac: { x: 0.0125, y: 0.022, w: 0.156, h: 0.322 },  // fallback when viewport far from 1920x1080
  cloudRotateHz: 0.017,
  breathHz: 0.14,
  breathAmp: 0.04,
  edgeOpacity: 0.15,
  firingThreshold: 0.32,     // per-neuron activity >= this counts as "firing"
  hotRowThreshold: 0.5,      // role bar goes spark-gradient + glow above this
  escapeDecayS: 0.3,
  regionTintMix: 0.33,
  filterDefaultOpen: false,
} as const,
```

`config.test.ts` extends: `brainPanel` has no `null`; every numeric leaf finite; `rect` / `rectFrac`
components `>= 0`; `rectFrac` `x + w <= 1` and `y + h <= 1`; `firingThreshold`, `hotRowThreshold`,
`regionTintMix` in `[0, 1]`; `escapeDecayS > 0`. Assert `CONFIG.aesthetic` no longer has
`brainScale` / `brainCenter` (guard against a bad merge).

## 6. `src/main.ts` changes (the shared seam)

**Remove** (`main.ts:65-88`, `main.ts:106-109`):

- `buildBrainPoints` / `buildCoreEdges` calls and the shared-position-buffer wiring **for the
  scene** (they move into `panel-cloud.ts`).
- the `brain` `THREE.Group`, `brain.position.set(brainCenter…)`, `brain.scale.setScalar(brainScale)`,
  `points.frustumCulled = false`.
- `brain` from `renderer.scene.add(...)` — leaving `renderer.scene.add(world3d, fly.object3d)`.
- the `aActivity` / `aActivityArr` capture and the per-frame `aActivityArr.set(...)` +
  `aActivity.needsUpdate = true` block.

**Add:**

```ts
const brainPanel = new BrainPanel(neuronsFile, graphFile, roleTable);   // appends its own <div>

// in onFrame(view):
brainPanel.update(view);

// resize handler:
// (brainPanel keeps its own fixed px size from CONFIG.brainPanel.rect; setViewport only
//  needed if rectFrac fallback is active — call it alongside renderer.resize)

// teardown / hot-reload dispose path:
brainPanel.dispose();
```

**`loadEnvelope` clock:** whichever of Plan 2c / Plan 02b merges first adds a small shared
`loadEnvelope` (elapsed-seconds since boot, plus a `phase`) in `main.ts` and passes it where the
load animations need it. The second PR rebases and hooks in. Plan 2c's panel-converge reads
`loadEnvelope.t`; Plan 02b's banner/HUD-fade reads the same.

## 7. Testing

### 7.1 New pure suites (TDD, vitest `node`)

- **`viz/brain-panel/role-monitor.test.ts`**
  - `roleSummary`: build a `RoleTable` from the fixture `groups.json`; set `activity` so
    `looming` indices (0..7) are `1` and the rest `0` → `roleSummary().looming === 1`, all others
    `0`. Set `escape` (24..31) to `0.5` → `.escape === 0.5`. `background` = mean over neurons in
    no role; assert it excludes every role index.
  - `firingCount`: `activity` with exactly `k` entries `>= threshold` → `=== k`; boundary
    (`=== threshold`) counts; `NaN` guard → not counted.
  - `regionCounts`: neurons with known `groupId`s and activities → the group→region map bins them
    into `[central, optic, cord]`; sums to `firingCount` for the same threshold.
- **`viz/brain-panel/panel-view.test.ts`**
  - `roleBarStyle("looming", v)`: `ramp === "warn"` for all `v`; `widthPct` monotone in `v`;
    clamped to `[0, 100]`.
  - `roleBarStyle("escape", v)`: `ramp === "spark"`; `glow === true` iff `v > hotRowThreshold`.
  - `cardRect`: 1920×1080 → the `rect` px values; a 800×600 viewport → `rectFrac`-derived, clamped
    inside the viewport, `x + w <= viewport.w`.
  - `regionBarOpacity`: `0` count → `0.25`; `count === activeTotal` → `1`; monotone; `activeTotal
    === 0` → `0.25` (no divide-by-zero).
- **`app/config.test.ts`** — the §5 assertions.

### 7.2 Construct-only

- **`viz/brain-panel/panel-cloud.test.ts`** — `buildPanelCloud(fixtureNeurons, fixtureGraph)`
  returns a `group` with a `Points` child whose geometry has `position` (len `count*3`),
  `aCore` (sums to `coreCount`), `aActivity` (zeros, len `count`), `aVisible` (ones, len `count`);
  and a `LineSegments` child with an index buffer of even length. No `WebGLRenderer`.
  `setVisibleGroups(new Set([2]))` zeroes exactly the `groupId === 2` entries of `aVisible`.

### 7.3 Untested glue (typecheck + `vite build` + manual checklist)

`brain-panel.ts`, `panel-dom.ts`, the mini-renderer RAF, `main.ts`.

### 7.4 Manual checklist (`docs/manual-checklist.md`, new "Plan 2c" rows)

1. Panel is visible top-left on load; the 3D world no longer contains a large brain object; the
   fly flies through clear space.
2. Panel never overlaps the fly or the bottom-row HUD meters.
3. The panel cloud reads as a small rotating brain; points brighten toward white as they fire.
4. Role rows track the demo: `looming` ramps (ember→white) as the fly approaches the block,
   `escape` snaps hot at the burst, `wing l`/`wing r` follow, then all decay.
5. `NNN / 500` count and the three region bars move with activity.
6. Escape: a white bloom in the panel cloud and a bright pulse along the core edges, decaying in
   ~0.3s.
7. `▸ groups` expands; un-ticking `gN` removes that group's points from the panel cloud; core
   edges unaffected; re-ticking restores them.
8. Auto-rotate + breath present normally; with `prefers-reduced-motion` the cloud is static, bars
   and colour still update, the escape flash is brightness-only.
9. Still runs under SAB (`crossOriginIsolated`) and under `postMessage` (headers commented out).
10. `yarn build` bundle: the second `WebGLRenderer` adds no new dependency; bundle size delta is
    just the panel module.

## 8. Docs updated in the Plan 2c PR

- `docs/2026-09-09-visual-direction.md` — the §1.4 deviations (reword §0, edit §5 rows, §6.3/§6.4
  notes, update the §7 status table for A4/A7/A13).
- `docs/architecture.md` — add `src/viz/brain-panel/`; note the connectome is panel-docked, not
  world-placed; mark orbit-camera / inset as cut.
- `docs/manual-checklist.md` — the §7.4 rows.
- `README.md` — Status line: "Plan 2c (docked brain panel) complete" alongside 02b.

## 9. Risks / watch-items

1. **Two `WebGLRenderer`s / context loss.** Chrome's context cap is ~16; we use 2. Handle
   `webglcontextlost` on the panel canvas by pausing its RAF and showing the last frame; restore
   on `webglcontextrestored`. Low likelihood at this scale.
2. **`main.ts` merge collision with Plan 02b.** Bounded to ~10 lines and a shared `loadEnvelope`.
   Mitigation: whoever merges first defines `loadEnvelope`; the other rebases. Ping on PR-up.
3. **Palette timing.** If Plan 02b's `palette.ts` retokenise hasn't merged when Plan 2c builds,
   the local `panel-palette.ts` shim carries the §2 hexes; a follow-up fold-in removes it. Not a
   blocker.
4. **`groupVisibilityArray` ownership.** Plan 02b's spec §6.3 introduces it for the (now removed)
   scene filter. If 02b's removal pass deletes it with the scene filter, Plan 2c keeps a local
   copy in `panel-cloud.ts`. Coordinated: 02b keeps the pure helper in `geometry.ts`, Plan 2c
   imports it.
5. **Region map is synthetic.** `g0..g2→central` etc. is a placeholder for the fixture; documented
   as such. Plan 03's real neuropil data replaces it — no interface change (still
   `regionCounts(activity, neurons, threshold)`).
6. **Reduced-motion completeness.** Every motion the panel introduces (rotate, breath, flash kick,
   load converge) must have a reduced-motion branch — checklist row 8 verifies by eye.
7. **Panel RAF vs. paused sim.** The panel's own RAF drives rotate/breath so the cloud still
   breathes when the sim is paused; `update(view)` still runs from `main.ts` (02b keeps publishing
   `FrameView` while paused), so bars/colour freeze at the paused values — correct.

## 10. Out of scope — explicit cut (→ Plan 03)

Real connectome soma positions / neuropil regions / neuron types; `W_NORM` tuning; per-spike
event stream or membrane-V feed; a resizable / draggable / dockable panel; multiple panels;
panel screenshot/export; the orbit / free-fly camera (cut, not deferred).
