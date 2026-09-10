# Docked Brain Panel + Live Neuron Feed — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the connectome out of world space into a small top-left instrument panel with its own renderer and a live per-role / per-region neuron feed, so the brain becomes something you read rather than fly through.

**Architecture:** A new `src/viz/brain-panel/` module. A `BrainPanel` class owns a dedicated `WebGLRenderer` + `Scene` + `PerspectiveCamera` sized to a DOM card, plus the card's feed rows and group-filter strip. Every derivation (role means, firing count, region counts, bar styling, card rect, breath curve) is a pure, TDD'd helper; the class and the DOM builder are thin untested glue. `src/main.ts` drops the scene brain `Group` and constructs the panel instead. `FrameView` is frozen — the feed is rate-coded off the existing per-neuron `activity` scalar.

**Tech Stack:** TypeScript + Vite + Vitest (env `node`) + Three.js 0.186.0. No new dependencies.

**Spec:** [`docs/superpowers/specs/2026-09-09-fly-playground-2c-brain-panel-design.md`](../specs/2026-09-09-fly-playground-2c-brain-panel-design.md). Read it alongside this plan — this plan argues from it. The spec was written before Plan 02b merged; §"Deltas from the merged-02b reality" below records every place this plan diverges from the spec text, and each affected task repeats the relevant delta inline.

## Global Constraints

- **`FrameView` is frozen:** `{ pose, readouts, sensory, activity, simHz, paused }`. Add no field. `activity` is `Float32Array`, length = the sim's active-neuron count (≥ `coreCount` = 48; role neurons 0..47 are all core, so always present), values ~`[0, 1]`.
- **Seam invariants:** `src/bridge/`, `src/sensing/`, `src/body/`, `src/sim/`, `src/world/` never import `three`. `src/viz/brain-panel/` may import `three`. The pure helpers (`role-monitor.ts`, `panel-view.ts`) import **no** `three` and **no** DOM — plain arrays + config in, plain data out.
- **Commit trailer** — every commit ends with exactly (session attribution, regardless of which model runs the task):
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01WCm5gZDQbaJiz1Kszm414c
  ```
- **Implementer subagents never `git push`.** Stop after the task commit; the controller pushes the branch.
- **Per-task gate:** `npx vitest run && npx tsc --noEmit && npx eslint src && npx prettier --check "src/**/*.{ts,js}" && yarn build`. Task 8 additionally runs the full `yarn ci`.
- **Branch:** `plan-2c-brain-panel` off `main` (`ef3fd6b`). Merge to `main` once, at plan completion + Opus whole-branch review (revised push cadence: an in-progress plan stays on its branch; incremental fast-forwards of `origin/main` kept leaving the maintainer's checkout behind).
- **Fixture facts:** 500 neurons, `coreCount = 48`, `scale_factor = 1.0`. `NeuronsFile.groupId: Uint16Array` holds values `0..7` (group 0 == the 48 core neurons). Input roles: `looming` 0..7, `light_l` 8..11, `light_r` 12..15, `proximity` 16..19, `wind_l` 20..21, `wind_r` 22..23. Readout roles: `escape` 24..31, `wing_l` 32..35, `wing_r` 36..39, `thrust` 40..43, `yaw_torque` 44..47.
- **Region map (synthetic, fixture-only):** `g0,g1,g2 → central (0)`, `g3,g4 → optic (1)`, `g5,g6,g7 → cord (2)`. Region rest tints (visual-direction §2.2): central `0x6fbf8e`, optic `0x9b84e0`, cord `0x5aa0d6`. Plan 03's real neuropil data replaces the map with no interface change.

---

## Deltas from the merged-02b reality (spec was written pre-merge)

1. **`roleSummary` signature.** Spec §3.3 passes `roles: RoleTable`. `RoleTable` (`src/sim/roles.ts`) maps role **name → vector index**, not name → neuron-index list, so it can't drive a mean over "the `looming` neurons". This plan uses `roleSummary(activity, roles: Record<string, readonly number[]>)`, built from `GroupsFile` (`{ ...inputRoles, ...readoutRoles }`, both `Record<string, number[]>` of neuron indices). `BrainPanel`'s ctor takes `GroupsFile`, not `RoleTable`.
2. **Dead scene-brain code is deleted in Task 7** (not by "02b's removal pass" — that pass never existed as a separate thing; 02b kept `buildBrainPoints`/`buildCoreEdges` alive): `buildBrainPoints` + `buildCoreEdges` from `src/viz/builders.ts` and their two `builders.test.ts` cases; `src/viz/brain-material.ts` + `src/viz/brain-material.test.ts`. The pure `geometry.ts` functions stay.
3. **`config.ts` removals happen in Task 7, coupled to the `main.ts` seam** (not Task 1). `main.ts:213` still destructures `CONFIG.aesthetic.brainScale/brainCenter` and `brain-material.ts` still reads `CONFIG.aesthetic.POINT_DEPTH_*`; removing those config keys before their consumers die breaks `tsc`. Task 1 is purely additive (`CONFIG.brainPanel`). Task 7 removes `aesthetic.brainScale`, `aesthetic.brainCenter`, `aesthetic.POINT_DEPTH_NEAR/FAR/FADE` and the two stale block comments, in the same commit that kills every consumer. `BASE_SIZE`, `CORE_SIZE`, `ACT_SWELL`, `POINT_SCALE`, `POINT_MAX` stay (Task 4's panel point material consumes `BASE_SIZE`/`CORE_SIZE`/`ACT_SWELL`/`POINT_MAX`).
4. **`groupVisibilityArray` does not exist yet** (spec risk 4 assumed 02b shipped it; 02b cut the scene filter entirely). Task 4 adds it to `src/viz/geometry.ts` as a pure helper.
5. **Region tints + group→region map live in `role-monitor.ts`** as module constants, not in `palette.ts` — adding them to the `Palette` interface would ripple `applyTheme`, `activePalette`, and `config.test.ts` for no benefit (the panel is dark-only; see delta 7).
6. **Panel filter → no `controls.setGroupVisible` callback.** Spec §4.4 says the panel's own checkboxes also call `controls.setGroupVisible(gN, checked)`. But `main.ts` wires `controls.setGroupVisible → panelHandle.current.setGroupVisible`, so a panel-strip checkbox calling `controls` would recurse into itself. Resolution: `BrainPanel.setGroupVisible(g, visible)` is the single mutator (updates the local `hiddenGroups` set, calls `panelCloud.setVisibleGroups`, reconciles its own checkbox `.checked`). The panel strip's `change` handler calls `this.setGroupVisible` **directly**. The HUD path (`controls.setGroupVisible → panelHandle.current.setGroupVisible`) reaches the same method. No panel→controls call.
7. **The panel is dark-only — it does not theme.** Spec §4.1/§3.1 fix the card background at `--void` "always". `main.ts`'s `controls.setTheme` is not wired to the panel, and `brain-panel.css` carries one fixed Deep Field palette. (A themed panel is a Plan 03 nicety if wanted.)
8. **`BrainPanel.update(view, bootT)`** takes the boot clock as a second arg (the load-converge phase is driven inside `panel-cloud` off its own `tick` accumulator, so `bootT` is currently unused by `update` — pass it anyway; it keeps the seam stable if a future converge tweak needs wall-clock).
9. **`panel-cloud` recenters + normalizes** the `brainPositions` output to a unit sphere at the origin so the panel camera frames any fixture without per-fixture tuning. Presentation-only; the pure `geometry.ts` math is untouched.

---

## File Structure

```
src/viz/brain-panel/                       NEW
  role-monitor.ts     PURE + tested. RoleFiring type; GROUP_REGION / REGION_TINT constants;
                      regionOf(); roleNeurons(groups); roleSummary(); firingCount(); regionCounts().
  panel-view.ts       PURE + tested. BrainPanelConfig + RoleName + BarStyle + Rect types;
                      roleBarStyle(); cardRect(); regionBarOpacity(); breathScale().
  panel-cloud.ts      three glue, construct-only test. buildPanelCloud() -> PanelCloud
                      { group, setActivity, setVisibleGroups, setEscapeFlash, tick, dispose }.
                      Additive point ShaderMaterial + per-segment core-edge ShaderMaterial.
  panel-dom.ts        THIN, untested. buildCardDom(groupIds, filterOpen) -> CardDom (elements only).
  brain-panel.css     NEW. One fixed Deep Field palette; .brain-panel positioned by JS.
  brain-panel.ts      untested glue. class BrainPanel — dedicated WebGLRenderer + Scene + camera +
                      DOM card + own RAF (rotate / breath / escape decay). ctor(neurons, graph,
                      groups, scaleFactor); update(view, bootT); setViewport(w,h);
                      setGroupVisible(g, visible); dispose().
  role-monitor.test.ts / panel-view.test.ts / panel-cloud.test.ts   NEW

src/viz/geometry.ts        CHG — add pure groupVisibilityArray(neurons, hiddenGroups)
src/viz/geometry.test.ts   CHG — add its case
src/viz/builders.ts        CHG (Task 7) — delete buildBrainPoints / buildCoreEdges + now-dead imports
src/viz/builders.test.ts   CHG (Task 7) — delete their two cases + now-dead imports
src/viz/brain-material.ts       DELETE (Task 7)
src/viz/brain-material.test.ts  DELETE (Task 7)
src/app/config.ts          CHG — add CONFIG.brainPanel (Task 1); remove brainScale/brainCenter/
                           POINT_DEPTH_* + stale comments (Task 7)
src/app/config.test.ts     CHG — additive brainPanel assertions (Task 1); removal assertions +
                           drop the dead `const P` no-op (Task 7)
src/main.ts                CHG (Task 7) — drop scene brain Group + aActivity push; construct
                           BrainPanel; brainPanel.update(view, bootT) in onFrame;
                           brainPanel.setViewport in resize; import.meta.hot dispose
docs/2026-09-09-visual-direction.md / architecture.md / manual-checklist.md / README.md / handoff-2c.md
                           CHG (Task 8)
```

---

### Task 1: `CONFIG.brainPanel` + additive config assertions

**Files:**
- Modify: `src/app/config.ts` (inside the `CONFIG` object literal, after the `aesthetic: { … },` block, before `} as const;`)
- Test: `src/app/config.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `CONFIG.brainPanel` — `{ rect: { xPx, yPx, wPx, hPx }, rectFrac: { x, y, w, h }, cloudRotateHz, breathHz, breathAmp, edgeOpacity, firingThreshold, hotRowThreshold, escapeDecayS, regionTintMix, convergeS, filterDefaultOpen }`. `type BrainPanelConfig = typeof CONFIG.brainPanel` is derived in `panel-view.ts` (Task 3).

- [ ] **Step 1: Write the failing test**

Add to `src/app/config.test.ts`:

```ts
test("Plan 2c CONFIG.brainPanel is present and sane", () => {
  const bp = CONFIG.brainPanel;
  const nums = [
    bp.cloudRotateHz, bp.breathHz, bp.breathAmp, bp.edgeOpacity,
    bp.firingThreshold, bp.hotRowThreshold, bp.escapeDecayS,
    bp.regionTintMix, bp.convergeS,
    bp.rect.xPx, bp.rect.yPx, bp.rect.wPx, bp.rect.hPx,
    bp.rectFrac.x, bp.rectFrac.y, bp.rectFrac.w, bp.rectFrac.h,
  ];
  expect(nums.every(Number.isFinite)).toBe(true);
  for (const v of [bp.rect.xPx, bp.rect.yPx, bp.rect.wPx, bp.rect.hPx]) {
    expect(v).toBeGreaterThanOrEqual(0);
  }
  for (const v of [bp.rectFrac.x, bp.rectFrac.y, bp.rectFrac.w, bp.rectFrac.h]) {
    expect(v).toBeGreaterThanOrEqual(0);
  }
  expect(bp.rectFrac.x + bp.rectFrac.w).toBeLessThanOrEqual(1);
  expect(bp.rectFrac.y + bp.rectFrac.h).toBeLessThanOrEqual(1);
  for (const v of [bp.firingThreshold, bp.hotRowThreshold, bp.regionTintMix]) {
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(1);
  }
  expect(bp.escapeDecayS).toBeGreaterThan(0);
  expect(bp.convergeS).toBeGreaterThan(0);
  expect(typeof bp.filterDefaultOpen).toBe("boolean");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/app/config.test.ts`
Expected: FAIL — `CONFIG.brainPanel` is `undefined`.

- [ ] **Step 3: Add the config block**

In `src/app/config.ts`, immediately before the final `} as const;`, after the `aesthetic: { … },` block's closing brace + comma:

```ts
  // Plan 2c: the docked brain panel (src/viz/brain-panel/). `rect` is the 1080p
  // reference placement in CSS px; `rectFrac` is the viewport-fraction fallback
  // `cardRect()` switches to when the viewport is far from 1920x1080. It matches
  // `CONFIG.hud.reservedRect` — the region the HUD keeps clear.
  brainPanel: {
    rect: { xPx: 24, yPx: 24, wPx: 300, hPx: 348 },
    rectFrac: { x: 0.0125, y: 0.022, w: 0.156, h: 0.322 },
    cloudRotateHz: 0.017, // ~6 deg/s auto-rotate
    breathHz: 0.14, // global brightness/size "breath"
    breathAmp: 0.04,
    edgeOpacity: 0.15, // core-edge base opacity at rest
    firingThreshold: 0.32, // per-neuron activity >= this counts as "firing"
    hotRowThreshold: 0.5, // role bar goes spark-gradient + glow above this
    escapeDecayS: 0.3, // panel escape flash decay
    regionTintMix: 0.33, // rest point colour = mix(neuron, regionTint, this)
    convergeS: 1.2, // boot "points converge out of the dark" duration
    filterDefaultOpen: false,
  },
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/app/config.test.ts`
Expected: PASS (both the new test and the existing `CONFIG is fully populated` regex check — every numeric leaf is finite).

- [ ] **Step 5: Gate + commit**

Run: `npx vitest run && npx tsc --noEmit && npx eslint src && npx prettier --check "src/**/*.{ts,js}" && yarn build`

```bash
git add src/app/config.ts src/app/config.test.ts
git commit -m "$(cat <<'EOF'
feat(config): add CONFIG.brainPanel dials for the docked brain panel

Placement (px rect + viewport-fraction fallback), rotate/breath rates,
edge opacity, firing + hot-row thresholds, escape decay, region-tint mix,
boot-converge duration. Additive — no removals yet (those are coupled to
the main.ts seam in a later task).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WCm5gZDQbaJiz1Kszm414c
EOF
)"
```

---

### Task 2: `role-monitor.ts` — pure role / region derivations

**Files:**
- Create: `src/viz/brain-panel/role-monitor.ts`
- Test: `src/viz/brain-panel/role-monitor.test.ts`

**Interfaces:**
- Consumes: `NeuronsFile` (`../../formats/neurons`), `GroupsFile` (`../../formats/groups`).
- Produces:
  - `interface RoleFiring { looming; escape; wing_l; wing_r; thrust; yaw; background: number }`
  - `const GROUP_REGION: Readonly<Record<number, 0 | 1 | 2>>`
  - `const REGION_TINT: readonly [number, number, number]` — `[central, optic, cord]` hex ints
  - `regionOf(groupId: number): 0 | 1 | 2`
  - `roleNeurons(groups: GroupsFile): Record<string, readonly number[]>`
  - `roleSummary(activity: Float32Array, roles: Record<string, readonly number[]>): RoleFiring`
  - `firingCount(activity: Float32Array, threshold: number): number`
  - `regionCounts(activity: Float32Array, neurons: NeuronsFile, threshold: number): [number, number, number]`

- [ ] **Step 1: Write the failing tests**

Create `src/viz/brain-panel/role-monitor.test.ts`:

```ts
import { expect, test } from "vitest";
import { parseNeurons } from "../../formats/neurons";
import { parseGroups } from "../../formats/groups";
import { fixtureBuf, fixtureJson } from "../../formats/fixture";
import { roleNeurons, roleSummary, firingCount, regionCounts, regionOf } from "./role-monitor";

const neurons = parseNeurons(fixtureBuf("neurons.bin"));
const groups = parseGroups(fixtureJson("groups.json"));
const roles = roleNeurons(groups);

const zeros = (): Float32Array => new Float32Array(neurons.count);

test("roleSummary: looming neurons hot -> looming 1, every other role 0", () => {
  const a = zeros();
  for (const i of roles.looming) a[i] = 1;
  const s = roleSummary(a, roles);
  expect(s.looming).toBeCloseTo(1);
  expect(s.escape).toBe(0);
  expect(s.wing_l).toBe(0);
  expect(s.wing_r).toBe(0);
  expect(s.thrust).toBe(0);
  expect(s.yaw).toBe(0);
  expect(s.background).toBe(0);
});

test("roleSummary: escape 0.5 -> .escape 0.5; yaw reads the yaw_torque role", () => {
  const a = zeros();
  for (const i of roles.escape) a[i] = 0.5;
  for (const i of roles.yaw_torque) a[i] = 0.25;
  const s = roleSummary(a, roles);
  expect(s.escape).toBeCloseTo(0.5);
  expect(s.yaw).toBeCloseTo(0.25);
});

test("roleSummary: background is the mean over neurons in NO role", () => {
  const a = zeros();
  const inRole = new Set<number>();
  for (const list of Object.values(roles)) for (const i of list) inRole.add(i);
  for (const i of inRole) a[i] = 1; // only role neurons hot
  expect(roleSummary(a, roles).background).toBe(0);
  // a single non-role neuron hot lifts background off zero
  const firstFree = [...Array(neurons.count).keys()].find((i) => !inRole.has(i))!;
  a[firstFree] = 1;
  expect(roleSummary(a, roles).background).toBeGreaterThan(0);
});

test("firingCount: k entries >= threshold; boundary counts; NaN skipped", () => {
  const a = zeros();
  a[0] = 0.32;
  a[1] = 0.5;
  a[2] = 0.31;
  a[3] = NaN;
  expect(firingCount(a, 0.32)).toBe(2);
});

test("regionCounts bins by group->region and sums to firingCount", () => {
  const a = zeros();
  for (let i = 0; i < neurons.count; i++) a[i] = 0.9;
  const rc = regionCounts(a, neurons, 0.32);
  expect(rc[0] + rc[1] + rc[2]).toBe(firingCount(a, 0.32));
  expect(rc.every((c) => c > 0)).toBe(true);
});

test("regionOf maps the 8 fixture groups into 3 regions", () => {
  expect([0, 1, 2].map(regionOf)).toEqual([0, 0, 0]);
  expect([3, 4].map(regionOf)).toEqual([1, 1]);
  expect([5, 6, 7].map(regionOf)).toEqual([2, 2, 2]);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/viz/brain-panel/role-monitor.test.ts`
Expected: FAIL — `Cannot find module './role-monitor'`.

- [ ] **Step 3: Implement**

Create `src/viz/brain-panel/role-monitor.ts`:

```ts
// Pure, framework-free derivations for the docked brain panel's live feed.
// No `three`, no DOM. Rate-coded off the per-neuron `activity` scalar from
// FrameView (frozen) — "firing" is a threshold on it (CONFIG.brainPanel).

import type { NeuronsFile } from "../../formats/neurons";
import type { GroupsFile } from "../../formats/groups";

export interface RoleFiring {
  looming: number;
  escape: number;
  wing_l: number;
  wing_r: number;
  thrust: number;
  yaw: number; // the "yaw_torque" readout role
  background: number; // mean activity of neurons in no input/readout role
}

/**
 * Fixture group -> coarse brain region. Synthetic placeholder for the 8-group
 * fixture; Plan 03's real neuropil data replaces this with no interface change.
 * 0 = central, 1 = optic, 2 = cord (Google connectome colour convention:
 * central green, optic violet, cord blue).
 */
export const GROUP_REGION: Readonly<Record<number, 0 | 1 | 2>> = Object.freeze({
  0: 0,
  1: 0,
  2: 0,
  3: 1,
  4: 1,
  5: 2,
  6: 2,
  7: 2,
});

/** [central, optic, cord] resting tints — visual-direction.md §2.2. */
export const REGION_TINT: readonly [number, number, number] = [0x6fbf8e, 0x9b84e0, 0x5aa0d6];

export function regionOf(groupId: number): 0 | 1 | 2 {
  return GROUP_REGION[groupId] ?? 0;
}

/** Combined role -> neuron-index list (input + readout), straight from the fixture. */
export function roleNeurons(groups: GroupsFile): Record<string, readonly number[]> {
  return { ...groups.inputRoles, ...groups.readoutRoles };
}

function meanAt(activity: Float32Array, idxs: readonly number[]): number {
  let sum = 0;
  let n = 0;
  for (const i of idxs) {
    const v = activity[i];
    if (v === undefined || !Number.isFinite(v)) continue;
    sum += v;
    n++;
  }
  return n === 0 ? 0 : sum / n;
}

export function roleSummary(
  activity: Float32Array,
  roles: Record<string, readonly number[]>,
): RoleFiring {
  const inRole = new Set<number>();
  for (const list of Object.values(roles)) for (const i of list) inRole.add(i);

  let bgSum = 0;
  let bgN = 0;
  for (let i = 0; i < activity.length; i++) {
    if (inRole.has(i)) continue;
    const v = activity[i]!;
    if (!Number.isFinite(v)) continue;
    bgSum += v;
    bgN++;
  }

  return {
    looming: meanAt(activity, roles.looming ?? []),
    escape: meanAt(activity, roles.escape ?? []),
    wing_l: meanAt(activity, roles.wing_l ?? []),
    wing_r: meanAt(activity, roles.wing_r ?? []),
    thrust: meanAt(activity, roles.thrust ?? []),
    yaw: meanAt(activity, roles.yaw_torque ?? []),
    background: bgN === 0 ? 0 : bgSum / bgN,
  };
}

export function firingCount(activity: Float32Array, threshold: number): number {
  let k = 0;
  for (let i = 0; i < activity.length; i++) {
    const v = activity[i]!;
    if (Number.isFinite(v) && v >= threshold) k++;
  }
  return k;
}

export function regionCounts(
  activity: Float32Array,
  neurons: NeuronsFile,
  threshold: number,
): [number, number, number] {
  const out: [number, number, number] = [0, 0, 0];
  const n = Math.min(activity.length, neurons.count);
  for (let i = 0; i < n; i++) {
    const v = activity[i]!;
    if (!Number.isFinite(v) || v < threshold) continue;
    out[regionOf(neurons.groupId[i]!)]++;
  }
  return out;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/viz/brain-panel/role-monitor.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Gate + commit**

Run the full per-task gate.

```bash
git add src/viz/brain-panel/role-monitor.ts src/viz/brain-panel/role-monitor.test.ts
git commit -m "$(cat <<'EOF'
feat(brain-panel): pure role / region feed derivations

roleSummary / firingCount / regionCounts + the synthetic group->region map
and its rest tints. Rate-coded off FrameView.activity; no three, no DOM.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WCm5gZDQbaJiz1Kszm414c
EOF
)"
```

---

### Task 3: `panel-view.ts` — pure view math

**Files:**
- Create: `src/viz/brain-panel/panel-view.ts`
- Test: `src/viz/brain-panel/panel-view.test.ts`

**Interfaces:**
- Consumes: `CONFIG` (`../../app/config`), `RoleFiring` (`./role-monitor`).
- Produces:
  - `type BrainPanelConfig = typeof CONFIG.brainPanel`
  - `type RoleName = keyof RoleFiring`
  - `interface BarStyle { widthPct: number; ramp: "spark" | "warn"; glow: boolean }`
  - `interface Rect { x: number; y: number; w: number; h: number }`
  - `roleBarStyle(name: RoleName, value: number, cfg: BrainPanelConfig): BarStyle`
  - `cardRect(viewport: { w: number; h: number }, cfg: BrainPanelConfig): Rect`
  - `regionBarOpacity(count: number, activeTotal: number): number` — in `[0.25, 1]`
  - `breathScale(tSeconds: number, cfg: BrainPanelConfig): number` — `1 ± breathAmp`

- [ ] **Step 1: Write the failing tests**

Create `src/viz/brain-panel/panel-view.test.ts`:

```ts
import { expect, test } from "vitest";
import { CONFIG } from "../../app/config";
import { roleBarStyle, cardRect, regionBarOpacity, breathScale } from "./panel-view";

const cfg = CONFIG.brainPanel;

test("roleBarStyle: looming is always 'warn'; width monotone and clamped to [0,100]", () => {
  expect(roleBarStyle("looming", 0.1, cfg).ramp).toBe("warn");
  expect(roleBarStyle("looming", 1.4, cfg).ramp).toBe("warn");
  expect(roleBarStyle("looming", 0.4, cfg).widthPct).toBeGreaterThan(
    roleBarStyle("looming", 0.2, cfg).widthPct,
  );
  expect(roleBarStyle("looming", 5, cfg).widthPct).toBe(100);
  expect(roleBarStyle("looming", -2, cfg).widthPct).toBe(0);
});

test("roleBarStyle: non-looming rows are 'spark'; glow iff value > hotRowThreshold", () => {
  expect(roleBarStyle("escape", 0.9, cfg).ramp).toBe("spark");
  expect(roleBarStyle("wing_l", 0.9, cfg).ramp).toBe("spark");
  expect(roleBarStyle("escape", cfg.hotRowThreshold + 0.01, cfg).glow).toBe(true);
  expect(roleBarStyle("escape", cfg.hotRowThreshold - 0.01, cfg).glow).toBe(false);
});

test("roleBarStyle: non-finite value treated as 0", () => {
  expect(roleBarStyle("escape", NaN, cfg).widthPct).toBe(0);
});

test("cardRect: 1920x1080 -> the px rect; a small viewport -> fraction-derived, clamped inside", () => {
  expect(cardRect({ w: 1920, h: 1080 }, cfg)).toEqual({
    x: cfg.rect.xPx,
    y: cfg.rect.yPx,
    w: cfg.rect.wPx,
    h: cfg.rect.hPx,
  });
  const r = cardRect({ w: 800, h: 600 }, cfg);
  expect(r.x + r.w).toBeLessThanOrEqual(800);
  expect(r.y + r.h).toBeLessThanOrEqual(600);
  expect(r.w).toBeLessThan(cfg.rect.wPx);
  expect(r.x).toBeGreaterThanOrEqual(0);
  expect(r.y).toBeGreaterThanOrEqual(0);
});

test("regionBarOpacity: 0 -> 0.25; full -> 1; monotone; no divide-by-zero", () => {
  expect(regionBarOpacity(0, 10)).toBeCloseTo(0.25);
  expect(regionBarOpacity(10, 10)).toBeCloseTo(1);
  expect(regionBarOpacity(6, 10)).toBeGreaterThan(regionBarOpacity(2, 10));
  expect(regionBarOpacity(0, 0)).toBeCloseTo(0.25);
  expect(regionBarOpacity(5, 0)).toBeCloseTo(0.25);
});

test("breathScale oscillates strictly within 1 ± breathAmp and starts at 1", () => {
  const s = Array.from({ length: 64 }, (_, i) => breathScale(i * 0.37, cfg));
  expect(Math.max(...s)).toBeLessThanOrEqual(1 + cfg.breathAmp + 1e-9);
  expect(Math.min(...s)).toBeGreaterThanOrEqual(1 - cfg.breathAmp - 1e-9);
  expect(breathScale(0, cfg)).toBeCloseTo(1);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/viz/brain-panel/panel-view.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/viz/brain-panel/panel-view.ts`:

```ts
// Pure, framework-free view math for the docked brain panel: role-bar styling,
// the card rect (px placement with a viewport-fraction fallback), region-bar
// opacity, and the connectome "breath" curve. No `three`, no DOM.

import { CONFIG } from "../../app/config";
import type { RoleFiring } from "./role-monitor";

export type BrainPanelConfig = typeof CONFIG.brainPanel;
export type RoleName = keyof RoleFiring;

export interface BarStyle {
  widthPct: number;
  ramp: "spark" | "warn";
  glow: boolean;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export function roleBarStyle(name: RoleName, value: number, cfg: BrainPanelConfig): BarStyle {
  const v = Number.isFinite(value) ? value : 0;
  return {
    widthPct: clamp(v * 100, 0, 100),
    ramp: name === "looming" ? "warn" : "spark",
    glow: v > cfg.hotRowThreshold,
  };
}

/**
 * Card placement. Uses the px `rect` when the viewport is desktop-sized and the
 * rect fits; otherwise a viewport-fraction rect, clamped fully inside the frame.
 */
export function cardRect(viewport: { w: number; h: number }, cfg: BrainPanelConfig): Rect {
  const { rect, rectFrac } = cfg;
  const pxFits =
    viewport.w >= 1280 &&
    viewport.h >= 720 &&
    rect.xPx + rect.wPx <= viewport.w &&
    rect.yPx + rect.hPx <= viewport.h;
  if (pxFits) return { x: rect.xPx, y: rect.yPx, w: rect.wPx, h: rect.hPx };

  const w = Math.min(rectFrac.w * viewport.w, viewport.w);
  const h = Math.min(rectFrac.h * viewport.h, viewport.h);
  const x = clamp(rectFrac.x * viewport.w, 0, viewport.w - w);
  const y = clamp(rectFrac.y * viewport.h, 0, viewport.h - h);
  return { x, y, w, h };
}

/** Region-bar opacity: dim floor at rest, full when the whole active set fires. */
export function regionBarOpacity(count: number, activeTotal: number): number {
  if (!(activeTotal > 0)) return 0.25;
  return clamp(0.25 + 0.75 * (count / activeTotal), 0.25, 1);
}

/** Global "breath" multiplier for point size + additive intensity: 1 ± breathAmp. */
export function breathScale(tSeconds: number, cfg: BrainPanelConfig): number {
  return 1 + cfg.breathAmp * Math.sin(2 * Math.PI * cfg.breathHz * tSeconds);
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/viz/brain-panel/panel-view.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Gate + commit**

```bash
git add src/viz/brain-panel/panel-view.ts src/viz/brain-panel/panel-view.test.ts
git commit -m "$(cat <<'EOF'
feat(brain-panel): pure view math — bar style, card rect, breath curve

roleBarStyle / cardRect (px with viewport-fraction fallback) /
regionBarOpacity / breathScale. Plus the BrainPanelConfig + RoleName types.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WCm5gZDQbaJiz1Kszm414c
EOF
)"
```

---

### Task 4: `geometry.ts groupVisibilityArray` + `panel-cloud.ts`

**Files:**
- Modify: `src/viz/geometry.ts` (add one pure function)
- Modify: `src/viz/geometry.test.ts` (add its case)
- Create: `src/viz/brain-panel/panel-cloud.ts`
- Test: `src/viz/brain-panel/panel-cloud.test.ts`

**Interfaces:**
- Consumes: `NeuronsFile`, `GraphFile`, `brainPositions` / `coreFlags` / `coreEdgePairs` / `activityColour` / `groupVisibilityArray` (`../geometry`), `REGION_TINT` / `regionOf` (`./role-monitor`), `breathScale` / `BrainPanelConfig` (`./panel-view`), `PALETTE_DARK` (`../palette`), `CONFIG` (`../../app/config`).
- Produces:
  - `geometry.ts`: `groupVisibilityArray(n: NeuronsFile, hiddenGroups: ReadonlySet<number>): Float32Array` — length `n.count`, `0` where `groupId ∈ hiddenGroups`, else `1`.
  - `panel-cloud.ts`:
    - `interface PanelCloud { group: THREE.Group; setActivity(activity: Float32Array): void; setVisibleGroups(hiddenGroups: ReadonlySet<number>): void; setEscapeFlash(t01: number): void; tick(dtSeconds: number): void; dispose(): void }`
    - `buildPanelCloud(neurons: NeuronsFile, graph: GraphFile, scaleFactor: number, cfg: BrainPanelConfig, opts: { reduced: boolean }): PanelCloud`

- [ ] **Step 1: Write the failing test for `groupVisibilityArray`**

Add to `src/viz/geometry.test.ts` (extend the existing import from `./geometry`):

```ts
import {
  brainPositions,
  coreFlags,
  coreEdgePairs,
  activityColour,
  groupVisibilityArray,
} from "./geometry";

// ...

test("groupVisibilityArray zeroes exactly the hidden groups", () => {
  const all = groupVisibilityArray(n, new Set());
  expect(all.length).toBe(n.count);
  expect([...all].every((v) => v === 1)).toBe(true);

  const hide2 = groupVisibilityArray(n, new Set([2]));
  for (let i = 0; i < n.count; i++) {
    expect(hide2[i]).toBe(n.groupId[i] === 2 ? 0 : 1);
  }
  const zeroed = [...hide2].filter((v) => v === 0).length;
  const g2 = [...n.groupId].filter((g) => g === 2).length;
  expect(zeroed).toBe(g2);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/viz/geometry.test.ts`
Expected: FAIL — `groupVisibilityArray is not a function`.

- [ ] **Step 3: Add `groupVisibilityArray` to `src/viz/geometry.ts`**

Append:

```ts
/**
 * One float per neuron: `0` when the neuron's group is in `hiddenGroups`, `1`
 * otherwise. Drives the panel cloud's `aVisible` attribute (group filter). Pure —
 * `panel-cloud.ts` uploads it to the GPU.
 */
export function groupVisibilityArray(
  n: NeuronsFile,
  hiddenGroups: ReadonlySet<number>,
): Float32Array {
  const out = new Float32Array(n.count);
  for (let i = 0; i < n.count; i++) out[i] = hiddenGroups.has(n.groupId[i]!) ? 0 : 1;
  return out;
}
```

- [ ] **Step 4: Run `geometry.test.ts`**

Run: `npx vitest run src/viz/geometry.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the construct-only test for `panel-cloud.ts`**

Create `src/viz/brain-panel/panel-cloud.test.ts`:

```ts
import { expect, test } from "vitest";
import * as THREE from "three";
import { parseNeurons } from "../../formats/neurons";
import { parseGraph } from "../../formats/graph";
import { fixtureBuf } from "../../formats/fixture";
import { CONFIG } from "../../app/config";
import { buildPanelCloud } from "./panel-cloud";

const neurons = parseNeurons(fixtureBuf("neurons.bin"));
const graph = parseGraph(fixtureBuf("graph.bin"));
const make = () => buildPanelCloud(neurons, graph, 1, CONFIG.brainPanel, { reduced: false });

const pointsOf = (g: THREE.Group) =>
  g.children.find((c): c is THREE.Points => c instanceof THREE.Points)!;
const segOf = (g: THREE.Group) =>
  g.children.find((c): c is THREE.LineSegments => c instanceof THREE.LineSegments)!;

test("Points child carries position / aCore / aActivity / aVisible at the right lengths", () => {
  const pc = make();
  const geom = pointsOf(pc.group).geometry;
  expect(geom.getAttribute("position").count).toBe(neurons.count);
  expect(geom.getAttribute("aActivity").count).toBe(neurons.count);
  expect(geom.getAttribute("aVisible").count).toBe(neurons.count);
  const core = geom.getAttribute("aCore");
  let coreSum = 0;
  for (let i = 0; i < core.count; i++) coreSum += core.getX(i);
  expect(coreSum).toBe(neurons.coreCount);
  const vis = geom.getAttribute("aVisible");
  let visSum = 0;
  for (let i = 0; i < vis.count; i++) visSum += vis.getX(i);
  expect(visSum).toBe(neurons.count); // all visible at rest
  pc.dispose();
});

test("LineSegments child has an even-length, core-core-only index", () => {
  const pc = make();
  const idx = segOf(pc.group).geometry.getIndex()!;
  expect(idx.count % 2).toBe(0);
  expect(idx.count).toBeGreaterThan(0);
  for (let i = 0; i < idx.count; i++) expect(idx.getX(i)).toBeLessThan(neurons.coreCount);
  pc.dispose();
});

test("setVisibleGroups({2}) zeroes exactly the group-2 points' aVisible", () => {
  const pc = make();
  pc.setVisibleGroups(new Set([2]));
  const vis = pointsOf(pc.group).geometry.getAttribute("aVisible");
  let zeroed = 0;
  for (let i = 0; i < vis.count; i++) if (vis.getX(i) === 0) zeroed++;
  expect(zeroed).toBe([...neurons.groupId].filter((g) => g === 2).length);
  pc.dispose();
});

test("setActivity / setEscapeFlash / tick don't throw before any render", () => {
  const pc = make();
  pc.setActivity(new Float32Array(neurons.count).fill(0.5));
  pc.setEscapeFlash(1);
  pc.tick(0.016);
  pc.tick(2); // past convergeS
  pc.dispose();
});
```

- [ ] **Step 6: Run to verify failure**

Run: `npx vitest run src/viz/brain-panel/panel-cloud.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement `src/viz/brain-panel/panel-cloud.ts`**

```ts
// The panel's own connectome geometry: an additive point cloud + core-edge
// lines, framed small in the docked panel (NOT world-placed). Reuses the pure
// geometry.ts math verbatim; only the MATERIAL choice differs from the deleted
// scene brain — the panel is always drawn on `--void`, so the point + edge
// materials go AdditiveBlending + depthWrite:false for the bioluminescent glow.

import * as THREE from "three";
import type { NeuronsFile } from "../../formats/neurons";
import type { GraphFile } from "../../formats/graph";
import { brainPositions, coreFlags, coreEdgePairs, groupVisibilityArray } from "../geometry";
import { REGION_TINT, regionOf } from "./role-monitor";
import { breathScale, type BrainPanelConfig } from "./panel-view";
import { PALETTE_DARK } from "../palette";
import { CONFIG } from "../../app/config";

export interface PanelCloud {
  group: THREE.Group;
  setActivity(activity: Float32Array): void;
  setVisibleGroups(hiddenGroups: ReadonlySet<number>): void;
  setEscapeFlash(t01: number): void;
  tick(dtSeconds: number): void;
  dispose(): void;
}

const POINT_VERT = /* glsl */ `
  attribute float aCore;
  attribute float aActivity;
  attribute float aVisible;
  attribute vec3 aRest;
  attribute vec3 aScatter;
  uniform float uBaseSize;
  uniform float uCoreSize;
  uniform float uSwell;
  uniform float uMaxSize;
  uniform float uBreath;
  uniform float uConverge;
  uniform float uPixelRatio;
  varying float vActivity;
  varying vec3 vRest;
  varying float vVisible;
  void main() {
    vActivity = aActivity;
    vRest = aRest;
    vVisible = aVisible;
    vec3 p = mix(position + aScatter, position, uConverge);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float base = (aCore > 0.5 ? uCoreSize : uBaseSize) * (1.0 + uSwell * aActivity) * uBreath;
    float size = base * uPixelRatio * (3.0 / -mv.z);
    gl_PointSize = clamp(size, 1.0, uMaxSize) * step(0.5, aVisible);
    gl_Position = projectionMatrix * mv;
  }
`;

const POINT_FRAG = /* glsl */ `
  uniform vec3 uSpark;
  uniform float uConverge;
  uniform float uEscape;
  varying float vActivity;
  varying vec3 vRest;
  varying float vVisible;
  void main() {
    if (vVisible < 0.5) discard;
    float r = length(gl_PointCoord - 0.5);
    if (r > 0.5) discard;
    float a = (1.0 - smoothstep(0.35, 0.5, r)) * uConverge;
    vec3 col = mix(vRest, uSpark, clamp(vActivity, 0.0, 1.0));
    col = mix(col, vec3(1.0), uEscape * 0.6);
    gl_FragColor = vec4(col, a);
    #include <colorspace_fragment>
  }
`;

const EDGE_VERT = /* glsl */ `
  attribute float aActivity;
  varying float vActivity;
  void main() {
    vActivity = aActivity;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const EDGE_FRAG = /* glsl */ `
  uniform vec3 uEdge;
  uniform vec3 uEscapeWarm;
  uniform float uBaseOpacity;
  uniform float uEscape;
  uniform float uConverge;
  varying float vActivity;
  void main() {
    float act = clamp(vActivity, 0.0, 1.0);
    float a = (uBaseOpacity + act * (1.0 - uBaseOpacity)) * uConverge;
    vec3 col = mix(uEdge, uEscapeWarm, uEscape) + act * 0.6;
    gl_FragColor = vec4(col, max(a, uEscape * 0.5));
    #include <colorspace_fragment>
  }
`;

/** Recenter to the centroid and scale to unit radius so the panel camera frames
 *  any fixture without per-fixture tuning (presentation-only). */
function normalize(pos: Float32Array): Float32Array {
  const n = pos.length / 3;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (let i = 0; i < n; i++) {
    cx += pos[i * 3]!;
    cy += pos[i * 3 + 1]!;
    cz += pos[i * 3 + 2]!;
  }
  cx /= n;
  cy /= n;
  cz /= n;
  let maxR = 1e-6;
  for (let i = 0; i < n; i++) {
    const dx = pos[i * 3]! - cx;
    const dy = pos[i * 3 + 1]! - cy;
    const dz = pos[i * 3 + 2]! - cz;
    maxR = Math.max(maxR, Math.hypot(dx, dy, dz));
  }
  const out = new Float32Array(pos.length);
  for (let i = 0; i < n; i++) {
    out[i * 3] = (pos[i * 3]! - cx) / maxR;
    out[i * 3 + 1] = (pos[i * 3 + 1]! - cy) / maxR;
    out[i * 3 + 2] = (pos[i * 3 + 2]! - cz) / maxR;
  }
  return out;
}

/** Deterministic small scatter offsets for the boot "converge out of the dark". */
function scatterOffsets(count: number): Float32Array {
  const out = new Float32Array(count * 3);
  let s = 0x2c1b3a9d;
  const rand = (): number => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) / 0xffffffff - 0.5) * 2;
  };
  for (let i = 0; i < count * 3; i++) out[i] = rand() * 1.6;
  return out;
}

export function buildPanelCloud(
  neurons: NeuronsFile,
  graph: GraphFile,
  scaleFactor: number,
  cfg: BrainPanelConfig,
  opts: { reduced: boolean },
): PanelCloud {
  const a = CONFIG.aesthetic;
  const count = neurons.count;

  const position = normalize(brainPositions(neurons, scaleFactor));
  const aCore = coreFlags(neurons);
  const aActivity = new Float32Array(count);
  const aVisible = new Float32Array(count).fill(1);
  const aScatter = scatterOffsets(count);

  // Rest colour per point: mix(neuron cold, its region tint, regionTintMix).
  const cold = new THREE.Color(PALETTE_DARK.pointCold);
  const aRest = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const tint = new THREE.Color(REGION_TINT[regionOf(neurons.groupId[i]!)]);
    const c = cold.clone().lerp(tint, cfg.regionTintMix);
    aRest[i * 3] = c.r;
    aRest[i * 3 + 1] = c.g;
    aRest[i * 3 + 2] = c.b;
  }

  const pointGeom = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(position, 3);
  const actAttr = new THREE.BufferAttribute(aActivity, 1);
  pointGeom.setAttribute("position", posAttr);
  pointGeom.setAttribute("aCore", new THREE.BufferAttribute(aCore, 1));
  pointGeom.setAttribute("aActivity", actAttr);
  pointGeom.setAttribute("aVisible", new THREE.BufferAttribute(aVisible, 1));
  pointGeom.setAttribute("aRest", new THREE.BufferAttribute(aRest, 3));
  pointGeom.setAttribute("aScatter", new THREE.BufferAttribute(aScatter, 3));

  const pixelRatio =
    typeof window !== "undefined" && window.devicePixelRatio
      ? Math.min(window.devicePixelRatio, 2)
      : 1;

  const pointMat = new THREE.ShaderMaterial({
    uniforms: {
      uBaseSize: { value: a.BASE_SIZE },
      uCoreSize: { value: a.CORE_SIZE },
      uSwell: { value: a.ACT_SWELL },
      uMaxSize: { value: a.POINT_MAX },
      uBreath: { value: 1 },
      uConverge: { value: opts.reduced ? 1 : 0 },
      uPixelRatio: { value: pixelRatio },
      uSpark: { value: new THREE.Color(PALETTE_DARK.pointHot) },
      uEscape: { value: 0 },
    },
    vertexShader: POINT_VERT,
    fragmentShader: POINT_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(pointGeom, pointMat);
  points.frustumCulled = false;

  // Core edges share the point cloud's position + aActivity buffers.
  const pairs = coreEdgePairs(graph, neurons.coreCount);
  const edgeGeom = new THREE.BufferGeometry();
  edgeGeom.setAttribute("position", posAttr);
  edgeGeom.setAttribute("aActivity", actAttr);
  edgeGeom.setIndex(new THREE.BufferAttribute(Uint32Array.from(pairs), 1));

  const edgeMat = new THREE.ShaderMaterial({
    uniforms: {
      uEdge: { value: new THREE.Color(PALETTE_DARK.edge) },
      uEscapeWarm: { value: new THREE.Color(PALETTE_DARK.escapeWarm) },
      uBaseOpacity: { value: cfg.edgeOpacity },
      uEscape: { value: 0 },
      uConverge: { value: opts.reduced ? 1 : 0 },
    },
    vertexShader: EDGE_VERT,
    fragmentShader: EDGE_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const edges = new THREE.LineSegments(edgeGeom, edgeMat);
  edges.frustumCulled = false;

  const group = new THREE.Group();
  group.add(points, edges);
  group.rotation.y = -0.4; // static 3/4 view for reduced motion / first frame

  let t = 0;

  return {
    group,
    setActivity(activity: Float32Array): void {
      const n = Math.min(activity.length, count);
      aActivity.set(activity.subarray(0, n));
      if (n < count) aActivity.fill(0, n);
      actAttr.needsUpdate = true;
    },
    setVisibleGroups(hiddenGroups: ReadonlySet<number>): void {
      aVisible.set(groupVisibilityArray(neurons, hiddenGroups));
      (pointGeom.getAttribute("aVisible") as THREE.BufferAttribute).needsUpdate = true;
    },
    setEscapeFlash(t01: number): void {
      const v = Math.max(0, Math.min(1, t01));
      pointMat.uniforms.uEscape!.value = v;
      edgeMat.uniforms.uEscape!.value = v;
    },
    tick(dtSeconds: number): void {
      t += Math.max(0, dtSeconds);
      const converge = opts.reduced ? 1 : Math.min(1, t / cfg.convergeS);
      pointMat.uniforms.uConverge!.value = converge;
      edgeMat.uniforms.uConverge!.value = converge;
      pointMat.uniforms.uBreath!.value = opts.reduced ? 1 : breathScale(t, cfg);
      if (!opts.reduced) group.rotation.y += 2 * Math.PI * cfg.cloudRotateHz * dtSeconds;
    },
    dispose(): void {
      pointGeom.dispose();
      edgeGeom.dispose();
      pointMat.dispose();
      edgeMat.dispose();
    },
  };
}
```

- [ ] **Step 8: Run the tests**

Run: `npx vitest run src/viz/geometry.test.ts src/viz/brain-panel/panel-cloud.test.ts`
Expected: PASS.

- [ ] **Step 9: Gate + commit**

```bash
git add src/viz/geometry.ts src/viz/geometry.test.ts src/viz/brain-panel/panel-cloud.ts src/viz/brain-panel/panel-cloud.test.ts
git commit -m "$(cat <<'EOF'
feat(brain-panel): panel connectome cloud + pure groupVisibilityArray

buildPanelCloud: additive point ShaderMaterial (region-tinted rest colour ->
spark on activity) + core-edge ShaderMaterial with per-segment activity glow
and an escape-warm travelling pulse; own rotate / breath / converge in tick().
groupVisibilityArray added to geometry.ts as the pure group-filter helper.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WCm5gZDQbaJiz1Kszm414c
EOF
)"
```

---

### Task 5: `panel-dom.ts` + `brain-panel.css`

**Files:**
- Create: `src/viz/brain-panel/panel-dom.ts`
- Create: `src/viz/brain-panel/brain-panel.css`

**Interfaces:**
- Consumes: `RoleName` (`./panel-view`).
- Produces:
  - `interface CardDom { root: HTMLDivElement; canvas: HTMLCanvasElement; countEl: HTMLElement; regionBars: [HTMLElement, HTMLElement, HTMLElement]; rows: Record<RoleName, { fill: HTMLElement; value: HTMLElement }>; filter: { toggle: HTMLButtonElement; strip: HTMLElement; boxes: HTMLInputElement[] } }`
  - `buildCardDom(groupIds: readonly number[], filterOpen: boolean): CardDom`

No unit test (thin DOM glue — verified by `tsc` + the manual checklist).

- [ ] **Step 1: Write `src/viz/brain-panel/panel-dom.ts`**

```ts
// Thin DOM construction for the docked brain panel. Element creation + class
// names only — no state, no listeners, no styling logic. brain-panel.ts wires
// behaviour; brain-panel.css styles it. Not unit-tested (vitest env is `node`).

import type { RoleName } from "./panel-view";

const ROLE_ROWS: readonly { key: RoleName; label: string }[] = [
  { key: "looming", label: "looming" },
  { key: "escape", label: "escape" },
  { key: "wing_l", label: "wing l" },
  { key: "wing_r", label: "wing r" },
  { key: "thrust", label: "thrust" },
  { key: "yaw", label: "yaw" },
  { key: "background", label: "background" },
];

export interface CardDom {
  root: HTMLDivElement;
  canvas: HTMLCanvasElement;
  countEl: HTMLElement;
  regionBars: [HTMLElement, HTMLElement, HTMLElement];
  rows: Record<RoleName, { fill: HTMLElement; value: HTMLElement }>;
  filter: { toggle: HTMLButtonElement; strip: HTMLElement; boxes: HTMLInputElement[] };
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

export function buildCardDom(groupIds: readonly number[], filterOpen: boolean): CardDom {
  const root = el("div", "brain-panel");

  const header = el("div", "bp-header");
  header.append(el("span", "bp-title", "connectome"));
  const countEl = el("span", "bp-count", "0 / 0");
  header.append(countEl);
  root.append(header);

  const regions = el("div", "bp-regions");
  const regionBars: HTMLElement[] = ["central", "optic", "cord"].map((name) =>
    el("span", `bp-region bp-region-${name}`),
  );
  regions.append(...regionBars);
  root.append(regions);

  const canvas = el("canvas", "bp-canvas");
  root.append(canvas);

  const rowsWrap = el("div", "bp-rows");
  const rows = {} as CardDom["rows"];
  for (const { key, label } of ROLE_ROWS) {
    const row = el("div", "bp-row");
    row.dataset.role = key;
    row.append(el("span", "bp-row-label", label));
    const track = el("span", "bp-track");
    const fill = el("span", "bp-fill");
    track.append(fill);
    row.append(track);
    const value = el("span", "bp-value", "0.00");
    row.append(value);
    rowsWrap.append(row);
    rows[key] = { fill, value };
  }
  root.append(rowsWrap);

  const filter = el("div", "bp-filter");
  const toggle = el("button", "bp-filter-toggle", (filterOpen ? "▾" : "▸") + " groups");
  toggle.type = "button";
  const strip = el("div", "bp-filter-strip");
  if (!filterOpen) strip.setAttribute("hidden", "");
  const boxes: HTMLInputElement[] = [];
  for (const g of groupIds) {
    const lbl = el("label", "bp-filter-box");
    const box = el("input");
    box.type = "checkbox";
    box.checked = true;
    box.dataset.group = String(g);
    lbl.append(box, document.createTextNode(` g${g}`));
    strip.append(lbl);
    boxes.push(box);
  }
  filter.append(toggle, strip);
  root.append(filter);

  return {
    root,
    canvas,
    countEl,
    regionBars: regionBars as [HTMLElement, HTMLElement, HTMLElement],
    rows,
    filter: { toggle, strip, boxes },
  };
}
```

- [ ] **Step 2: Write `src/viz/brain-panel/brain-panel.css`**

```css
/* Docked brain panel — a faint instrument card over the void. One fixed Deep
   Field palette: the card background is always `void` (visual-direction §4.1),
   so unlike the HUD it does NOT theme. Declarative glue — not unit-tested. */

.brain-panel {
  position: fixed;
  z-index: 11;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 9px;
  border: 1px solid rgba(200, 225, 255, 0.22);
  border-radius: 4px;
  background: linear-gradient(180deg, rgba(15, 26, 46, 0.66), rgba(7, 11, 20, 0.72));
  color: rgba(214, 230, 255, 0.72);
  font:
    11px/1.4 "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  pointer-events: auto;
  user-select: none;
}

.bp-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.bp-title {
  letter-spacing: 0.06em;
  text-transform: lowercase;
}
.bp-count {
  font:
    11px "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-variant-numeric: tabular-nums;
  opacity: 0.55;
}
.bp-count[data-active="true"] {
  color: #eaf7ff;
  opacity: 1;
}

.bp-regions {
  display: flex;
  gap: 3px;
}
.bp-region {
  height: 2px;
  flex: 1;
  opacity: 0.25;
}
.bp-region-central {
  background: #6fbf8e;
}
.bp-region-optic {
  background: #9b84e0;
}
.bp-region-cord {
  background: #5aa0d6;
}

.bp-canvas {
  display: block;
  width: 100%;
  border-radius: 2px;
  background: #070b14;
}

.bp-rows {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.bp-row {
  display: grid;
  grid-template-columns: 62px 1fr 34px;
  align-items: center;
  gap: 6px;
}
.bp-row-label {
  opacity: 0.7;
}
.bp-track {
  position: relative;
  height: 4px;
  background: rgba(200, 225, 255, 0.12);
  border-radius: 2px;
  overflow: hidden;
}
.bp-fill {
  position: absolute;
  inset: 0 auto 0 0;
  width: 0;
  background: #4a8fa8;
  transition: width 0.12s linear;
}
.bp-fill[data-ramp="warn"] {
  background: linear-gradient(90deg, #4a8fa8, #ffb25a 65%, #fff1da);
}
.bp-fill[data-ramp="spark"] {
  background: linear-gradient(90deg, #4a8fa8, #eaf7ff);
}
.bp-fill[data-glow="true"] {
  box-shadow: 0 0 6px rgba(234, 247, 255, 0.7);
}
.bp-value {
  text-align: right;
  font:
    10px "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-variant-numeric: tabular-nums;
  opacity: 0.6;
}

.bp-filter-toggle {
  all: unset;
  cursor: pointer;
  opacity: 0.6;
  letter-spacing: 0.04em;
}
.bp-filter-toggle:hover {
  opacity: 1;
}
.bp-filter-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  margin-top: 4px;
}
.bp-filter-box {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  opacity: 0.75;
}

@media (prefers-reduced-motion: reduce) {
  .bp-fill {
    transition: none;
  }
}
```

- [ ] **Step 3: Gate + commit**

The gate's `tsc`/`eslint` cover `panel-dom.ts`; `vite build` will not yet bundle the CSS (nothing imports it until Task 6) — that's fine.

```bash
git add src/viz/brain-panel/panel-dom.ts src/viz/brain-panel/brain-panel.css
git commit -m "$(cat <<'EOF'
feat(brain-panel): DOM card builder + fixed Deep Field stylesheet

buildCardDom: header + firing count, 3 region bars, cloud canvas, 7 role
rows, collapsible g0..g7 filter strip. Elements + class names only. The
card is dark-only by design (background is always `void`).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WCm5gZDQbaJiz1Kszm414c
EOF
)"
```

---

### Task 6: `brain-panel.ts` — the `BrainPanel` class

**Files:**
- Create: `src/viz/brain-panel/brain-panel.ts`

**Interfaces:**
- Consumes: `NeuronsFile`, `GraphFile`, `GroupsFile`, `FrameView` (`../../app/loop`), `CONFIG`, `detectEscapeOnset` (`../../audio/mapping`), `buildCardDom` / `CardDom` (`./panel-dom`), `buildPanelCloud` / `PanelCloud` (`./panel-cloud`), `roleNeurons` / `roleSummary` / `firingCount` / `regionCounts` (`./role-monitor`), `roleBarStyle` / `cardRect` / `regionBarOpacity` / `RoleName` (`./panel-view`).
- Produces:
  ```ts
  export class BrainPanel {
    constructor(
      neurons: NeuronsFile, graph: GraphFile, groups: GroupsFile,
      scaleFactor: number, parent?: HTMLElement,
    );
    update(view: FrameView, bootT: number): void;
    setViewport(w: number, h: number): void;
    setGroupVisible(groupId: number, visible: boolean): void;
    dispose(): void;
  }
  ```
  `main.ts` (Task 7) constructs it, assigns `panelHandle.current = brainPanel`, calls `update` per frame, `setViewport` on resize, `dispose` on HMR teardown. `panelHandle` (already in `main.ts:137`) is typed `{ setGroupVisible(g: number, v: boolean): void } | null` — `BrainPanel` satisfies it.

No unit test — untested glue (own `WebGLRenderer` RAF + DOM). Verified by `tsc` + `vite build` + the manual checklist.

- [ ] **Step 1: Write `src/viz/brain-panel/brain-panel.ts`**

```ts
// The docked brain panel: a dedicated WebGLRenderer + Scene + camera drawing the
// panel connectome cloud into a small DOM card, plus the live per-role / region
// feed. Its own RAF drives rotate / breath / escape-decay so the cloud keeps
// moving while the sim is paused; `update(view)` (from main.ts) feeds the data.
// Untested glue — see docs/manual-checklist.md "Plan 2c".

import "./brain-panel.css";
import * as THREE from "three";
import type { NeuronsFile } from "../../formats/neurons";
import type { GraphFile } from "../../formats/graph";
import type { GroupsFile } from "../../formats/groups";
import type { FrameView } from "../../app/loop";
import { CONFIG } from "../../app/config";
import { detectEscapeOnset } from "../../audio/mapping";
import { buildCardDom, type CardDom } from "./panel-dom";
import { buildPanelCloud, type PanelCloud } from "./panel-cloud";
import { roleNeurons, roleSummary, firingCount, regionCounts } from "./role-monitor";
import { roleBarStyle, cardRect, regionBarOpacity, type RoleName } from "./panel-view";

const ROLE_KEYS: readonly RoleName[] = [
  "looming",
  "escape",
  "wing_l",
  "wing_r",
  "thrust",
  "yaw",
  "background",
];

export class BrainPanel {
  private readonly cfg = CONFIG.brainPanel;
  private readonly reduced =
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  private readonly neurons: NeuronsFile;
  private readonly roles: Record<string, readonly number[]>;
  private readonly dom: CardDom;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  private readonly cloud: PanelCloud;
  private readonly hidden = new Set<number>();

  private raf = 0;
  private lastMs = 0;
  private escape = 0; // decaying 0..1 flash level
  private prevEscapeRead = 0;
  private escapeArmed = true;
  private contextLost = false;
  private disposed = false;

  constructor(
    neurons: NeuronsFile,
    graph: GraphFile,
    groups: GroupsFile,
    scaleFactor: number,
    parent: HTMLElement = document.body,
  ) {
    this.neurons = neurons;
    this.roles = roleNeurons(groups);

    const groupIds = [...new Set(neurons.groupId)].sort((a, b) => a - b);
    this.dom = buildCardDom(groupIds, this.cfg.filterDefaultOpen);
    parent.appendChild(this.dom.root);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.dom.canvas,
      alpha: true,
      antialias: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.camera.position.set(0, 0, 3.1);
    this.camera.lookAt(0, 0, 0);

    this.cloud = buildPanelCloud(neurons, graph, scaleFactor, this.cfg, { reduced: this.reduced });
    this.scene.add(this.cloud.group);

    for (const box of this.dom.filter.boxes) {
      box.addEventListener("change", () => {
        this.setGroupVisible(Number(box.dataset.group), box.checked);
      });
    }
    this.dom.filter.toggle.addEventListener("click", () => {
      const closed = this.dom.filter.strip.hasAttribute("hidden");
      if (closed) this.dom.filter.strip.removeAttribute("hidden");
      else this.dom.filter.strip.setAttribute("hidden", "");
      this.dom.filter.toggle.textContent = (closed ? "▾" : "▸") + " groups";
    });

    this.dom.canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      this.contextLost = true;
    });
    this.dom.canvas.addEventListener("webglcontextrestored", () => {
      this.contextLost = false;
    });

    this.layout(window.innerWidth, window.innerHeight);
    this.startRaf();
  }

  /** The only per-frame data intake. `bootT` is the shared main.ts boot clock. */
  update(view: FrameView, _bootT: number): void {
    if (this.disposed) return;

    this.cloud.setActivity(view.activity);

    const esc = view.readouts.escape ?? 0;
    const edge = detectEscapeOnset(
      this.prevEscapeRead,
      esc,
      CONFIG.physics.ESCAPE_TH,
      CONFIG.physics.ESCAPE_HYST,
    );
    this.prevEscapeRead = esc;
    if (edge.onset && this.escapeArmed) {
      this.escape = 1;
      this.escapeArmed = false;
    } else if (edge.armed) {
      this.escapeArmed = true;
    }

    const summary = roleSummary(view.activity, this.roles);
    for (const key of ROLE_KEYS) {
      const st = roleBarStyle(key, summary[key], this.cfg);
      const { fill, value } = this.dom.rows[key];
      fill.style.width = `${st.widthPct}%`;
      fill.dataset.ramp = st.ramp;
      fill.dataset.glow = String(st.glow);
      value.textContent = summary[key].toFixed(2);
    }

    const count = firingCount(view.activity, this.cfg.firingThreshold);
    this.dom.countEl.textContent = `${count} / ${this.neurons.count}`;
    this.dom.countEl.dataset.active = String(count > 0);

    const rc = regionCounts(view.activity, this.neurons, this.cfg.firingThreshold);
    rc.forEach((c, i) => {
      this.dom.regionBars[i].style.opacity = String(regionBarOpacity(c, count));
    });
  }

  setGroupVisible(groupId: number, visible: boolean): void {
    if (visible) this.hidden.delete(groupId);
    else this.hidden.add(groupId);
    this.cloud.setVisibleGroups(this.hidden);
    const box = this.dom.filter.boxes.find((b) => Number(b.dataset.group) === groupId);
    if (box && box.checked !== visible) box.checked = visible;
  }

  setViewport(w: number, h: number): void {
    this.layout(w, h);
  }

  dispose(): void {
    this.disposed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.cloud.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.dom.root.remove();
  }

  private layout(vw: number, vh: number): void {
    const r = cardRect({ w: vw, h: vh }, this.cfg);
    const s = this.dom.root.style;
    s.left = `${r.x}px`;
    s.top = `${r.y}px`;
    s.width = `${r.w}px`;

    const cw = Math.max(1, Math.round(r.w - 18)); // minus card padding + border
    const ch = Math.max(1, Math.round(cw * 0.42));
    this.renderer.setSize(cw, ch, false);
    this.dom.canvas.style.width = `${cw}px`;
    this.dom.canvas.style.height = `${ch}px`;
    this.camera.aspect = cw / ch;
    this.camera.updateProjectionMatrix();
  }

  private startRaf(): void {
    this.lastMs = performance.now();
    const pump = (): void => {
      if (this.disposed) return;
      const now = performance.now();
      const dt = Math.min((now - this.lastMs) / 1000, 0.05);
      this.lastMs = now;

      if (!this.contextLost) {
        if (this.escape > 0) {
          this.escape = Math.max(0, this.escape - dt / this.cfg.escapeDecayS);
        }
        this.cloud.setEscapeFlash(this.escape);
        this.cloud.tick(dt);
        this.renderer.render(this.scene, this.camera);
      }
      this.raf = requestAnimationFrame(pump);
    };
    this.raf = requestAnimationFrame(pump);
  }
}
```

- [ ] **Step 2: Gate**

Run: `npx vitest run && npx tsc --noEmit && npx eslint src && npx prettier --check "src/**/*.{ts,js}" && yarn build`
Expected: PASS. `vite build` now bundles `brain-panel.css`. Nothing constructs `BrainPanel` yet (that's Task 7), so no runtime check here.

- [ ] **Step 3: Commit**

```bash
git add src/viz/brain-panel/brain-panel.ts
git commit -m "$(cat <<'EOF'
feat(brain-panel): BrainPanel class — dedicated renderer + live feed

Own WebGLRenderer/Scene/camera into the card canvas; own RAF for
rotate/breath/escape-decay (keeps moving while the sim is paused);
update(view) feeds activity + role rows + firing count + region bars;
setGroupVisible is the single filter mutator (HUD path and panel strip
both reach it); context-loss guard; dispose() tears it all down.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WCm5gZDQbaJiz1Kszm414c
EOF
)"
```

---

### Task 7: `main.ts` seam + delete the dead scene brain + `config.ts` removals

**Files:**
- Modify: `src/main.ts`
- Modify: `src/viz/builders.ts`
- Modify: `src/viz/builders.test.ts`
- Delete: `src/viz/brain-material.ts`, `src/viz/brain-material.test.ts`
- Modify: `src/app/config.ts`
- Modify: `src/app/config.test.ts`

**Interfaces:**
- Consumes: `BrainPanel` (`./viz/brain-panel/brain-panel`), `parseGroups` (`./formats/groups`).
- Produces: no new exports. Removes `buildBrainPoints` / `buildCoreEdges` from `builders.ts`; removes `CONFIG.aesthetic.brainScale` / `brainCenter` / `POINT_DEPTH_NEAR` / `POINT_DEPTH_FAR` / `POINT_DEPTH_FADE`.

This task changes several files in one commit because every consumer of the removed config keys and the deleted module dies together — a smaller split would not `tsc`.

- [ ] **Step 1: Delete the scene brain material + its test**

```bash
git rm src/viz/brain-material.ts src/viz/brain-material.test.ts
```

- [ ] **Step 2: Trim `src/viz/builders.ts`**

- Change the import line 7-9 region to drop the now-dead imports. After the edit the imports read:
  ```ts
  import * as THREE from "three";
  import type { SceneConfig } from "../scene.config";
  import { activePalette, material } from "./palette";
  import { CONFIG } from "../app/config";
  import type { Theme } from "../ui/controls";
  ```
  (Removed: `NeuronsFile`, `GraphFile` type imports; `brainPositions, coreFlags, coreEdgePairs` from `./geometry`; `makeBrainMaterial` from `./brain-material`; `PALETTE` from the palette import — keep `activePalette, material`.)
- Delete the `buildBrainPoints` function (lines ~14-21) and the `buildCoreEdges` function (lines ~23-38), including their doc comments.
- Leave `geometryFor`, `groundDisc`, `buildWorld` untouched.

- [ ] **Step 3: Trim `src/viz/builders.test.ts`**

Replace the top of the file so it no longer imports the fixture parsers or the deleted builders, and delete the two obsolete tests. Result:

```ts
import { expect, test } from "vitest";
import * as THREE from "three";
import { SCENE } from "../scene.config";
import { buildWorld } from "./builders";

test("buildWorld: one mesh per object + one marker per light + a ground disc; one cool key + hemi; no grid", () => {
  const world = buildWorld(SCENE);
  const meshes = world.children.filter((c) => c instanceof THREE.Mesh);
  const dir = world.children.filter((c) => c instanceof THREE.DirectionalLight);
  const hemi = world.children.filter((c) => c instanceof THREE.HemisphereLight);
  const points = world.children.filter((c) => c instanceof THREE.PointLight);
  expect(points.length).toBe(SCENE.lights.length);
  expect(dir.length).toBe(1);
  expect(hemi.length).toBe(1);
  expect(meshes.length).toBe(SCENE.objects.length + SCENE.lights.length + 1);
  expect(world.children.some((c) => c.name === "ground-disc")).toBe(true);
});
```

- [ ] **Step 4: `src/app/config.ts` removals**

- Delete the stale block comment above `aesthetic:` (the `// The "Deep Field" aesthetic pass (Plan 02b) extends this block …` paragraph, lines ~79-82).
- Inside `aesthetic:`, delete the `POINT_DEPTH_NEAR` / `POINT_DEPTH_FAR` / `POINT_DEPTH_FADE` lines **and** their `// Depth shading: …` comment (lines ~90-94).
- Delete the `// Brain point cloud lives as one big fixed object …` comment and the `brainScale: 10,` + `brainCenter: { x: 6, y: 5, z: 0 },` lines (lines ~111-115).
- Keep `BASE_SIZE`, `CORE_SIZE`, `ACT_SWELL`, `POINT_SCALE`, `POINT_MAX`, `FLAP_MIN/MAX/AMP`, and everything else.

- [ ] **Step 5: `src/app/config.test.ts` — swap the assertions**

- Delete line 17: `expect(CONFIG.aesthetic.brainScale).toBeGreaterThanOrEqual(1);`
- Delete the dead no-op: line 21 `const P = CONFIG as unknown as Record<string, Record<string, unknown>>;` and line 55 `void P;`.
- In the `"Plan 02b CONFIG blocks are present and sane"` test, in the `// aesthetic` section, add:
  ```ts
  // Plan 2c removed the world-placement dials — guard against a bad merge.
  expect("brainScale" in CONFIG.aesthetic).toBe(false);
  expect("brainCenter" in CONFIG.aesthetic).toBe(false);
  expect("POINT_DEPTH_NEAR" in CONFIG.aesthetic).toBe(false);
  ```

- [ ] **Step 6: `src/main.ts` — the seam**

1. Import line 22 → `import { buildWorld } from "./viz/builders";`
2. Delete line 36 `import type { BufferAttribute } from "three";`
3. After line 21 (`import { parseGraph } from "./formats/graph";`) add:
   ```ts
   import { parseGroups } from "./formats/groups";
   import { BrainPanel } from "./viz/brain-panel/brain-panel";
   ```
4. After `const graphFile = parseGraph(graph);` (line 73) add:
   ```ts
   const groupsFile = parseGroups(groupsJson);
   ```
5. Replace lines ~202-224 (from `const points = buildBrainPoints(...)` through `const aActivityArr = aActivity.array as Float32Array;`) with:
   ```ts
   let world3d = buildWorld(initialScene, currentTheme);
   const fly = new Fly(currentTheme);
   renderer.scene.add(world3d, fly.object3d);

   // --- Plan 2c: docked brain panel ---
   // The connectome now lives in a small top-left instrument panel with a live
   // neuron feed, not as a world object on the fly's cruise line. BrainPanel owns
   // its own WebGLRenderer + Scene + camera + DOM card + RAF; it consumes the
   // frozen FrameView and adds no field to it.
   const brainPanel = new BrainPanel(neuronsFile, graphFile, groupsFile, scaleFactor);
   panelHandle.current = brainPanel;
   // --- end Plan 2c: docked brain panel ---
   ```
   (`world3d` and `fly` were previously declared at lines ~219-220; they move up into this block. Make sure they are not re-declared later.)
6. In `onFrame`, delete the "Constraint #3" block (lines ~280-283):
   ```ts
   // Constraint #3: push per-neuron activity into the shader attribute.
   const n = Math.min(view.activity.length, aActivityArr.length);
   aActivityArr.set(view.activity.subarray(0, n));
   aActivity.needsUpdate = true;
   ```
   and in its place (after `fly.update(view.readouts, view.pose, dt);`) add:
   ```ts
   brainPanel.update(view, bootT);
   ```
7. `resize` (line ~408):
   ```ts
   const resize = (): void => {
     renderer.resize(window.innerWidth, window.innerHeight);
     brainPanel.setViewport(window.innerWidth, window.innerHeight);
   };
   ```
8. After `loop.start();` (end of `main()`), add the HMR teardown:
   ```ts
   import.meta.hot?.dispose(() => brainPanel.dispose());
   ```
9. Update the frozen-FrameView comment at line ~274 to name the panel as the consumer if it doesn't already read cleanly.

- [ ] **Step 7: Verify no dangling references**

Run:
```bash
grep -rn "buildBrainPoints\|buildCoreEdges\|brain-material\|makeBrainMaterial\|brainScale\|brainCenter\|POINT_DEPTH\|aActivityArr" src
```
Expected: **no matches** (every hit was removed). If `grep` finds anything, fix it before the gate.

- [ ] **Step 8: Gate**

Run: `npx vitest run && npx tsc --noEmit && npx eslint src && npx prettier --check "src/**/*.{ts,js}" && yarn build`
Expected: PASS.

- [ ] **Step 9: Manual smoke**

Run `yarn dev`, open the app:
- Top-left card is visible; it shows `connectome`, an `N / 500` count, 3 region bars, a rotating point cloud, 7 role rows, and a `▸ groups` toggle.
- The 3D world no longer contains a large brain blob; the fly flies through clear space.
- As the demo runs, role rows move; `looming` ramps toward warm as the fly nears the block; `escape` snaps hot at the burst; the count and region bars track activity; the panel cloud flashes white + a pulse runs the edges on escape.
- `▸ groups` expands; un-ticking a box drops that group's points from the panel cloud; re-ticking restores them.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor: dock the connectome — drop the world-space brain, wire BrainPanel

main.ts builds a BrainPanel instead of a scaled scene Group on the fly's
cruise line; per-frame activity now feeds the panel, not a scene attribute.
Deletes the now-dead buildBrainPoints / buildCoreEdges / brain-material.ts
and the world-placement config (brainScale, brainCenter, POINT_DEPTH_*).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WCm5gZDQbaJiz1Kszm414c
EOF
)"
```

---

### Task 8: Docs, manual checklist, full CI

**Files:**
- Modify: `docs/2026-09-09-visual-direction.md`
- Modify: `docs/architecture.md`
- Modify: `docs/manual-checklist.md`
- Modify: `README.md`
- Modify: `docs/handoff-2c.md`

- [ ] **Step 1: `docs/2026-09-09-visual-direction.md`**

- **§0 (line ~15):** reword so the connectome is a captured instrument volume shown in a docked panel, not a space the fly traverses. Keep the "one warm ember of a fly" framing.
- **§5 motion table:** the `connectome idle` row — note the breath now lives in the panel (`src/viz/brain-panel/`). Delete the `brain camera mode` row entirely (the orbit camera was cut in Plan 2c, never built).
- **§6.3 (line ~283):** the `POINT_MAX` clamp note — the fly no longer flies *through* the cloud; the cloud is panel-framed. Keep the clamp as a cheap guard; drop the "fills the screen" rationale.
- **§6.4:** note the loom→GF→motor travelling pulse happens inside the panel (`panel-cloud.ts` edge material), not on a scene object.
- **§7 status table:**
  - `A4` → `done (Plan 2c, <commit-hash>)` — additive point material + soft radial alpha falloff, on the panel's `void`.
  - `A7` → `done (Plan 2c, <commit-hash>)` — `pathway`-coloured core edges, base opacity `CONFIG.brainPanel.edgeOpacity`, per-segment activity glow + escape-warm pulse.
  - `A10` note → the "points converge out of the dark" phase is now done (`panel-cloud` converge over `CONFIG.brainPanel.convergeS`, reduced-motion fades in place).
  - `A11` note → the white bloom flash + pathway pulse are now done (panel).
  - `A13` → `partial (Plan 2c)` — resting points carry a low-mix region tint (`regionTintMix` 0.33); real neuropil regions are Plan 03.
  - Use the Task 8 commit's short hash for `<commit-hash>` (or the Task 4 / Task 7 hash where that's the true landing point — pick the honest one).

- [ ] **Step 2: `docs/architecture.md`**

- Add a `src/viz/brain-panel/` entry to the module list (line ~76 area): the docked panel — dedicated `WebGLRenderer` + `Scene` + camera + DOM card, pure `role-monitor.ts` / `panel-view.ts` feed helpers, `panel-cloud.ts` connectome geometry, `panel-dom.ts` card, `BrainPanel` glue. `FrameView` is its frozen seam.
- Line ~78 "Deferred to Plan 03": drop "the brain (OrbitControls) camera mode" from *deferred* and instead say it is **cut** (superseded by the docked panel); keep "region tints on resting points" only as "real neuropil regions" (a low-mix tint now ships) and keep the `bounds` hairline mesh.
- Lines ~10, ~113-121, ~141: adjust the `brainviz/` box + "Camera modes" note — there is one camera (follow); the connectome renders in the docked panel with its own renderer; no OrbitControls path.

- [ ] **Step 3: `docs/manual-checklist.md`**

Add a `## Plan 2c — docked brain panel` section (before `## Plan 03 — filled later`) with the spec §7.4 rows:

```markdown
## Plan 2c — docked brain panel

- [ ] Panel is visible top-left on load; the 3D world has no large brain object; the fly flies
      through clear space.
- [ ] Panel never overlaps the fly or the bottom-row HUD meters.
- [ ] The panel cloud reads as a small rotating brain; points brighten toward white as they fire.
- [ ] Role rows track the demo: `looming` ramps (ember→white) approaching the block, `escape` snaps
      hot at the burst, `wing l`/`wing r` follow, then all decay.
- [ ] `NNN / 500` count and the three region bars move with activity.
- [ ] Escape: a white bloom in the panel cloud + a bright pulse along the core edges, decaying in
      ~0.3 s.
- [ ] `▸ groups` expands; un-ticking `gN` removes that group's points from the panel cloud; core
      edges unaffected; re-ticking restores them.
- [ ] Auto-rotate + breath present normally; with `prefers-reduced-motion` the cloud holds a static
      ¾ view, bars + colour still update, the escape flash is brightness-only.
- [ ] Still runs under SAB (`crossOriginIsolated`) and under `postMessage` (headers commented out).
- [ ] `yarn build`: the second `WebGLRenderer` adds no new dependency; bundle-size delta is just the
      panel module.
```

Also update the existing Plan 02b line that says "the panel re-renders — the HUD itself shows no filter checkboxes" if it now reads inconsistently, and tick the `## Aesthetic` rows that Plan 2c completes (connectome additive glow; escape pathway pulse; "points converge out of the dark" load phase).

- [ ] **Step 4: `README.md`**

- `## Status` (line ~26-34): add a "Plan 2c (docked brain panel) complete" paragraph — the connectome moved from a world-space blob into a top-left instrument card with a live per-role / region neuron feed and a group filter; the fly-through / orbit camera idea is cut. Update the "The **brain viz** (docked … ) … **Plan 2c**. Next: Plan 03." sentence to past tense.

- [ ] **Step 5: `docs/handoff-2c.md`**

Update §1 and §3: `main` now carries Plan 2c; Plan 2c status = complete + merged. (Keep the doc — it's a useful record. One or two line edits.)

- [ ] **Step 6: Full CI**

Run: `yarn ci`
Expected: PASS end to end (`format:check`, `lint`, `rs:fmt:check`, `rs:wasm`, `typecheck`, `rs:lint`, `rs:test`, `rs:wasm:node`, `test`, `build`, `py:test`, `py:fixture-check`).

Run: `yarn rs:smoke`
Expected: PASS (unchanged — Plan 2c touches no Rust).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
docs: record the docked brain panel (Plan 2c)

visual-direction §0/§5/§6.3/§6.4 + §7 (A4/A7 done, A10/A11 notes, A13
partial); architecture.md (src/viz/brain-panel/, orbit camera cut);
manual-checklist Plan 2c rows; README status; handoff-2c status.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WCm5gZDQbaJiz1Kszm414c
EOF
)"
```

---

## Post-plan: review + merge

1. **Opus whole-branch review** of `plan-2c-brain-panel` vs `main` (`superpowers:requesting-code-review` / a dispatched Opus reviewer). Focus: the `main.ts` seam (no orphaned refs, resize + dispose wired), the two-`WebGLRenderer` lifecycle (context count, `dispose` completeness), shader correctness (additive + `colorspace_fragment`, `aVisible` discard), reduced-motion completeness, `roleSummary` background set math, `cardRect` branch behaviour.
2. Apply one combined fix wave; one scoped re-review.
3. **Merge to `main` and push** (`superpowers:finishing-a-development-branch`, option 1 — merge locally, then push `origin/main`). Per the revised push policy this session and its agents may push `main`. Run `yarn ci` on the merged result before pushing. Tell the maintainer to `git pull` in `/home/gb/projects/fly-playground`.
4. Offer to remove the `plan-2c-brain-panel` and (now fully merged) `plan-02b-rich-loop` worktrees + branches.

## Self-Review (done while writing)

- **Spec coverage:** §3 module map → Tasks 2-6; §4.1 card → Task 5 CSS + Task 6 layout; §4.2 cloud (region tint, additive, core edges, motion, escape) → Task 4; §4.3 role monitor → Tasks 2/3/6; §4.4 filter → Tasks 4/6 (delta 6); §4.5 reduced-motion → Tasks 4/6 + CSS; §4.6 load converge → Task 4 (`tick`); §5 `CONFIG.brainPanel` → Task 1 (+`convergeS`, delta); §6 `main.ts` seam → Task 7; §7 tests → each task's test step; §8 docs → Task 8; §9 risks: context-loss → Task 6 guard, `main.ts` collision → n/a (02b merged), palette timing → n/a (`palette.ts` retokenise landed), `groupVisibilityArray` → Task 4 (delta 4), region map synthetic → documented constant, reduced-motion → Tasks 4/6, panel RAF vs paused → Task 6 own RAF.
- **Placeholder scan:** every code step carries real code; no "add error handling"/"similar to Task N".
- **Type consistency:** `RoleFiring` (role-monitor) ← `RoleName = keyof RoleFiring` (panel-view) ← `ROLE_KEYS` (brain-panel) — all seven keys `looming/escape/wing_l/wing_r/thrust/yaw/background` match. `PanelCloud` method names (`setActivity/setVisibleGroups/setEscapeFlash/tick/dispose`) identical in the interface, the `buildPanelCloud` return, the test, and `BrainPanel`'s calls. `BrainPanelConfig = typeof CONFIG.brainPanel` used in `panel-view`, `panel-cloud`, `brain-panel`. `cardRect` takes `{ w, h }` everywhere. `groupVisibilityArray(n, hiddenGroups)` signature matches geometry.ts, its test, and the `panel-cloud` call.
