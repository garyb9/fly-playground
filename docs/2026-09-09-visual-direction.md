# fly-playground — visual direction: "Deep Field"

**Date:** 2026-09-09
**Status:** approved in brainstorming — this is the input to Plan 02b spec §8
("fly + world aesthetic pass via `frontend-design`").
**Parent design:** [`2026-09-09-design.md`](2026-09-09-design.md) ·
**Plan 02b spec:** [`superpowers/specs/2026-09-09-fly-playground-02-app-shell-design.md`](superpowers/specs/2026-09-09-fly-playground-02-app-shell-design.md)
**Style-frame (live visual reference):**
<https://claude.ai/code/artifact/1de23900-b352-4a62-be19-512f36365675>

---

## 0. The one-sentence brief

You pilot a single warm ember of a fly through a vast, cool, bioluminescent
connectome floating in an astronomical-twilight void. The field is calm; the
giant-fiber escape is the one violent moment. Professional because it reads like
a captured scientific volume; fun because it is genuinely beautiful to move
through.

The name **Deep Field** is the working handle for the direction — an astronomy
deep-field exposure and the neural field, the same picture.

## 1. Why this direction (grounding + differentiation)

Two fixed points from research framed the choice:

1. **The canonical rendering of this exact dataset** (Google Research / Janelia
   MaleCNS release, FlyWire codex, Neuroglancer scenes) is deliberately
   *diagrammatic*: neurons region-coded — central brain **green**, optic lobes
   **violet/purple**, ventral nerve cord **blue** — dense, flatly lit, "structural
   clarity over atmosphere." That regional colour identity is the connectome's
   own signature and we keep it. The flat textbook lighting is theirs; we do not.
2. **The nearest prior-art playground**, dzhng's `fly-escape` ("Brain Chamber"),
   is a *whimsical sunlit house escape* — bright, domestic, playful. Deep Field
   is the opposite end of the room: dark, weightless, awed.

So the position is precise: **same colours as the textbook figure, lit like the
deep sea instead of like a figure.**

### What this is NOT — reject on sight

- **Not** the current placeholder palette (`bg #ece4d6` cream, `clay #b5643c`
  terracotta, `coreTint #d98a1f` amber). Warm-cream-plus-terracotta is the single
  commonest tell of a generated page; it is the thing we are removing.
- **Not** `#000` or tinted near-black (`#0B0B0B`, `#111`, the current stub's
  `#0e0f14`). `void` carries real blue hue.
- **Not** black-plus-one-neon-accent. The cool side is a *semantic system* (three
  region hues + resting + spiking + pathway + event), each colour meaning
  something in the sim. The single bold move — one warm light in a cool frame —
  is spent once, on the fly.
- **Not** a nebula rainbow. No magenta/gold/cyan gradient wash on the brain.
- **Not** the sunlit-house / daylight look of `fly-escape`.
- **Not** chromatic aberration, lens-dirt sprites, scanlines, or a literal
  reference grid on the ground. Those are the accessories to remove.

## 2. Palette

Hex values are the spec. Every one maps to a home in code (`§6`).

### 2.1 Core — 6 values

| token | hex | role |
|---|---|---|
| `void` | `#070B14` | scene background / deepest field. Blue-hued, **not** tinted black. |
| `abyss` | `#0F1A2E` | fog target — the connectome and world recede into this, hides the far bound. |
| `neuron` | `#4A8FA8` | resting connectome point — dim cyan-teal. |
| `spark` | `#EAF7FF` | fully active / spiking point — near-white, faintly cool. |
| `ember` | `#FFB25A` | **the fly.** The only warm light in the frame. |
| `ember-core` | `#FFE7BE` | fly hot centre, wing shimmer, escape after-glow. |

### 2.2 Region tints — the dataset's own identity

Applied as a **subtle** hue bias on resting points, keyed by neuropil/class group
(`groups.json`). At rest a point sits near `mix(neuron, regionTint, 0.35)`; as
`aActivity → 1` it lerps to `spark` (activity always wins over region, so the sim
read stays legible).

| token | hex | region |
|---|---|---|
| `region-central` | `#6FBF8E` | central brain (green) |
| `region-optic` | `#9B84E0` | optic lobes (violet) |
| `region-cord` | `#5AA0D6` | descending / ventral nerve cord (blue) |

If per-group tinting is more than Plan 02b wants to carry, ship a single
`neuron → spark` ramp and add region tint in Plan 03 — the palette is forward
-compatible.

### 2.3 Event & pathway

| token | hex | role |
|---|---|---|
| `pathway` | `#7C6BE8` | core loom→GF→motor `LineSegments`. Cool violet — deliberately distinct from generic `neuron` points so the reflex arc reads as its own structure. |
| `escape-hot` | `#FFFFFF` | peak of the giant-fiber flash. |
| `escape-warm` | `#FFF1DA` | the flash's warm-tinted edge as it blooms and decays. |

The **looming meter** in the HUD lerps its fill colour `neuron → ember →
escape-warm` as the scalar climbs toward `ESCAPE_TH` — a diegetic warning, no
separate alarm styling needed.

### 2.4 World surfaces

Drop `clay` / `sage` / `ochre`. The three obstacle forms become cool dark
"buoys": one dark base, a faint Fresnel rim in a region hue so they read as
navigable objects without competing with the connectome for the eye.

| token | hex | role |
|---|---|---|
| `buoy` | `#101A28` | obstacle base material (matte, near the `abyss` value). |
| `buoy-rim-a` | `#5AA0D6` | Fresnel edge, "box" obstacle. |
| `buoy-rim-b` | `#6FBF8E` | Fresnel edge, "torus" obstacle. |
| `buoy-rim-c` | `#9B84E0` | Fresnel edge, "sphere" obstacle. |
| `ground` | `#0A1220` | ground disc centre; fades radially into `void`. No grid lines. |
| `bounds` | `#22344d` | boundary box hairline. Near-invisible; brightens locally only where the fly approaches a wall. |

### 2.5 HUD (CSS, `rgba` over `void`)

| token | value | role |
|---|---|---|
| `hud-line` | `rgba(200,225,255,0.22)` | frame hairlines, meter tracks, tick marks. |
| `hud-text` | `rgba(214,230,255,0.72)` | labels and readouts at rest. |
| `hud-bright` | `rgba(236,245,255,0.96)` | focused / active / changing control. |
| `hud-warn` | tracks `§2.3` looming lerp | looming meter fill only. |

Contrast: `hud-text` resolves to roughly `#9DB4CE` over `#070B14` ≈ **7:1** at
the 12–14px UI sizes — clears WCAG AA. `spark` / `ember` on `void` are extreme
contrast by construction. Re-verify final values against the real background in
implementation; region tints are glow-on-glow decoration, never text.

## 3. Typography

One superfamily, two clearly distinct faces. Both are on Google Fonts
(self-host in the app; the style-frame Artifact loads them from
`fonts.googleapis.com`).

### 3.1 IBM Plex Mono — numbers and the boot banner only

- **Numeric readouts**: `sim_hz`, tick counter, meter percentages, neuron-count
  slider value, FPS. `font-variant-numeric: tabular-nums` so digits do not jitter
  as they change.
- **Load-screen boot banner**: the project name and the streaming asset log,
  set as if the instrument is printing them. Weight 400, `letter-spacing:
  0.04em`, lowercase.
- Justification for mono here — against the usual "mono label" tell: this is a
  genuine 200 Hz instrument with counters that change every frame. Mono earns its
  place on *data that updates*. It is never used for a static label.

### 3.2 IBM Plex Sans — every label, every sentence

- Meter labels ("looming", "escape", "thrust"), control labels, the audio and
  camera toggles, any first-run tip or about text.
- Weights: 400 body, 500 for a label that needs to sit slightly forward.
- **Sentence case. Never all-caps. No tracked-out eyebrow labels. No `→`
  appended to buttons or links.** A toggle says `follow camera` / `brain camera`,
  not `FOLLOW →`.

### 3.3 No display serif

There is no serif-display moment. The wonder is carried by the connectome
assembling out of the dark on load, not by a logotype. Type stays quiet
throughout — that restraint is the point.

### 3.4 Type scale

| use | size / line-height | face / weight |
|---|---|---|
| boot banner name | 20 / 1.3 | Plex Mono 400 |
| asset log line | 12 / 1.5 | Plex Mono 400 |
| meter / readout value | 13 / 1.2 | Plex Mono 500, tabular |
| meter / control label | 12 / 1.4 | Plex Sans 500 |
| first-run tip / about | 14 / 1.6 | Plex Sans 400, ≤ 64ch measure |

## 4. Composition, HUD & layout

The world owns the centre. The HUD is faint capture-overlay instrumentation
pushed to the **edges** — a research rig you can attend to or ignore. No solid
panels; hairlines and low opacity over the void, everything lifting to
`hud-bright` on hover/focus.

```
┌ fly-playground ·············································· sim 198 hz ┐
│  ·                                                                  ·  │
│ [ depth ]                                                           ·  │
│  |                                                                  ·  │
│  |                        ( the world )                             ·  │
│  |                                                                  ·  │
│  ·                                                                  ·  │
│  ·  looming ▓▓▓▓▓░░░░   escape ▓░░░░░   thrust ▓▓▓░░░   yaw ░▓░░░    ·  │
└ ·············································· ◍ follow camera   ♪ ──○── ┘
```

- **Frame** — a 1px `hud-line` inset rectangle with the corners open (ticks, not
  a closed box). Reads as a reticle / capture boundary.
- **Top-left** — project name (Plex Mono, dim). **Top-right** — live `sim_hz`
  (and FPS behind a debug flag). These are the only always-on readouts.
- **Left edge** — the neuron-count slider as a **vertical "depth" control**
  (`core_count` at the bottom, full `N` at the top). Log scale. Its current value
  and the live `sim_hz` sit next to the thumb. Framing it as depth, not a
  setting, keeps it in the world's language.
- **Bottom row** — sensory + motor meters as slim horizontal bars: `looming`,
  `escape`, `thrust`, `yaw` (proximity and light L/R join in Plan 02b). Track in
  `hud-line`, fill in `neuron`, except `looming` which uses the `§2.3` warning
  lerp. Labels Plex Sans, values Plex Mono.
- **Bottom-right** — camera toggle (`◍ follow camera` ⇄ `◍ brain camera`) and a
  master audio control (mute + a short volume slider). Icons are simple glyphs,
  not a UI kit.
- **Region/class filter checkboxes** (stretch) — if built, a collapsed list on
  the left edge under the depth control, same hairline treatment.

Center screen stays clear. Alignment: HUD elements align to the frame insets —
left group left-aligned, right group right-aligned, bottom meters in a single
baseline row.

## 5. Motion

A calm field with exactly one violent gesture.

| moment | motion |
|---|---|
| **fly at rest / cruise** | weightless drift; a slow vertical bob (~0.15 units, ~0.5 Hz) on top of the physics; wings a translucent blur. |
| **follow camera** | the existing critically-damped spring, plus a small idle sway (positional, sub-degree, ~0.1 Hz) so a static scene still breathes. |
| **connectome idle** | a slow global "breath" — brightness/point-size ×(1 ± 0.04) over ~7 s — and per-point activity sparkle straight from the sim snapshot. |
| **brain camera mode** | very slow drift-orbit of the whole cloud (~1°/s) while free-flying. |
| **escape burst** | THE moment. One sub-frame white bloom at the fly; a fast bright pulse travelling the `pathway` edges loom→GF→motor; a short camera kick (positional shove + ~1.5° roll, decays in ~0.3 s). Then the calm drift resumes. Contrast is the whole effect — nothing else in the scene moves sharply. |
| **load** | points converge out of the dark and fade up over ~1.2 s → boot banner types in → the fly *ignites* (an `ember` point blooms in at the start position) → sim starts, HUD fades in last. This is the hero moment; hold it, don't rush it. |
| **collision startle** | a brief `neuron→spark` ripple through nearby points and a tiny camera shudder — a smaller cousin of the escape, so a wall tap still registers. |

**`prefers-reduced-motion: reduce`** — drop the connectome breath, the fly bob,
the camera idle sway, the escape camera kick, and the load convergence (points
just fade in place). Keep everything functional: wing flap, physics, activity
sparkle, meter fills, the escape *bloom* (brightness only, no camera move).

## 6. Rendering & post-FX — implementation map

### 6.1 Token homes

| tokens | file | change from current |
|---|---|---|
| all `§2` colours | `src/viz/palette.ts` `PALETTE` | replace every value; keep the existing key names where they map (`bg→void`, `pointCold→neuron`, `pointHot→spark`, `edge→pathway`, `flyBody`/`flyAccent`→ ember pair, `ground`, `bounds`). Add `abyss`, region tints, buoy rims. |
| point size / swell / scale / max | `src/app/config.ts` `CONFIG.aesthetic` | retune for glow (see 6.3); add `BREATH_HZ`, `BREATH_AMP`, `BOB_HZ`, `BOB_AMP`, `ESCAPE_KICK`, post-FX dials below. |
| fog | `src/viz/renderer.ts` | `scene.background = void`; `scene.fog` colour → `abyss`, retune near/far so the far bound sits inside the fade. |
| brain shader colours | `src/viz/brain-material.ts` | `uCold ← neuron`, `uHot ← spark`; add optional `uRegionTint` per-vertex attribute; **switch blending — see 6.3**. |
| fly materials | `src/viz/fly.ts` | add `emissive: ember`, `emissiveIntensity`; parent a small warm `PointLight` to the group; put fly + light on the bloom layer. |
| world | `src/viz/builders.ts` | `buoy` material + Fresnel rim shader per obstacle; drop the warm `DirectionalLight` "sun" for a **cool** key; recolour `HemisphereLight` (`void` sky / `ground` floor); ground disc with radial alpha falloff instead of a grid; bounds hairline dim. |
| HUD | `src/ui/` (new in 02b) + `index.html` stub | replace the mono-everything stub with the `§3`/`§4` system. |

### 6.2 Post-processing stack (ordered)

Requires an `EffectComposer` (the Plan 02 spec deferred this to 02b — this is
where it lands). Order:

1. **render pass** — scene, linear space.
2. **selective bloom** — `UnrealBloomPass` driven by a bloom layer *or* a high
   luminance threshold, tuned so matte `buoy` meshes and the ground never bloom;
   only points, the fly ember + its light, the `pathway` pulse, and light
   markers do. Start: `strength 0.7`, `radius 0.4`, `threshold 0.6`. Dials in
   `CONFIG.aesthetic` (`BLOOM_STRENGTH`, `BLOOM_RADIUS`, `BLOOM_THRESHOLD`).
3. **vignette** — subtle, ~0.2 (`VIGNETTE`).
4. **film grain** — fine, animated, ~3–4 % (`GRAIN` — replaces the current
   boolean `grain: false`; ship it low but **on**). Reads as long-exposure
   sensor noise and quietly ties the look to the EM/microscopy origin of the
   data.
5. **output / tone map** — `ACESFilmicToneMapping` (or `AgXToneMapping` if the
   pinned three version has it), `SRGBColorSpace` out. Set on the renderer;
   `renderer.toneMappingExposure` a dial (`EXPOSURE`, start 1.0).

No SMAA/FXAA is required if MSAA on the composer render target is available;
otherwise add FXAA last. **No** chromatic aberration, **no** lens-dirt texture,
**no** scanline pass.

### 6.3 The point cloud (the hero object)

- **Blending.** The current `brain-material.ts` uses `NormalBlending` with a
  comment that additive "made points disappear" — that was against the *light*
  cream ground. On `void`, go back to **`AdditiveBlending`, `depthWrite:
  false`** — that is what gives the connectome its bioluminescent glow where
  points overlap. Keep the circular `discard` in the fragment shader; consider a
  soft radial alpha falloff (`1.0 - smoothstep(0.35, 0.5, r)`) instead of a hard
  cut so points read as glows, not dots.
- **Colour.** `mix(uCold, uHot, aActivity)`, then optionally
  `mix(that, regionTint, uRegionMix * (1.0 - aActivity))` so active points burn
  toward `spark` regardless of region.
- **Size.** Keep the `POINT_MAX` clamp (the fly flies *through* the cloud). Core
  points slightly larger as now. Add the `§5` breath as a global multiplier on
  `gl_PointSize` and the additive intensity.
- **Depth.** Fog + additive falloff carry it; a DoF/bokeh pass is optional and
  not worth the cost for Plan 02b — fog is enough.

### 6.4 Core edges (`pathway`)

`LineSegments`, colour `pathway`, base opacity low (~0.15 — lower than the
current 0.35; they should be a whisper at rest). On escape, drive a bright
travelling pulse along them (per-vertex or a moving uniform) in `escape-warm`.

### 6.5 The fly

- Body: dark, matte, but with `emissive: ember` at low intensity so it is never
  a black silhouette — it always carries a warm coal.
- A small warm `PointLight` parented to the fly so obstacles it passes catch an
  amber wash on one side — this is how the single warm source justifies itself in
  the lighting, not just the palette.
- Wings: translucent, faint `ember-core` tint, opacity ~0.18; the blur *is* the
  motion cue.
- Fly + its light on the bloom layer so the ember reads as a glow.
- A better fly mesh is welcome (Plan 02b already lists it) but out of scope for
  this doc — the material and light treatment above matter more than the
  topology.

### 6.6 World & lighting

- **Key light**: one cool directional, low intensity — sculpts the buoys without
  warming them.
- **Fill**: `HemisphereLight(void, ground, ~0.4)`.
- The **only warm light in the scene is the fly.** Light markers stay as small
  emissive spheres (they are the `light_l/light_r` stimulus sources — keep them
  legible) but small and bloomed, reading as distant beacons.
- Ground: a large disc, `ground` colour at centre, alpha → 0 by the rim, sitting
  in the fog. A single faint horizon glow line is allowed; a grid is not.
- Bounds: `bounds` hairline box, opacity ~0.05, with a local brighten shader
  where `distance(fly, wall)` is small — the world tells you where its edge is
  instead of a HUD warning.

## 7. Implementation status — tracked

**For the implementing agent:** this table is the source of truth for whether
Deep Field has landed. When you complete a line, change its status to `done` and
append the commit short-hash; use `partial` (with a note) or `deferred → Plan 03`
where that's the honest state. Keep this in the same commit as the code change so
status and reality never drift. `docs/manual-checklist.md` has the matching
"looks right" rows to verify by eye.

| # | item | spec | status |
|---|------|------|--------|
| A1 | `palette.ts` retokenised to §2; existing key names kept where they map (`bg→void`, `pointCold→neuron`, `pointHot→spark`, `edge→pathway`, fly pair→ember) | §2, §6.1 | `done` (Task 11) — dual `PALETTE_DARK`/`PALETTE_LIGHT` + `activePalette(theme)` + generic `applyTheme(root, theme)` |
| A2 | `CONFIG.aesthetic` gains the motion + post-FX dials (`BREATH_*`, `BOB_*`, `ESCAPE_KICK`, `BLOOM_*`, `VIGNETTE`, `GRAIN`, `EXPOSURE`) | §5, §6.2 | `done` (Task 12) — every 02b dial is in `CONFIG` **and consumed** (`BOB_*` + `IDLE_SWAY_*` → fly bob / camera sway, `ESCAPE_KICK` → camera kick, `LOAD` → boot envelope, `EXPOSURE`/`BLOOM`/`VIGNETTE`/`GRAIN` → the composer); `BREATH_*` is Plan 2c's to add |
| A3 | `EffectComposer` post-FX stack in the render path | §6.2 | `done` (Task 11) — `src/viz/post.ts`: render → `UnrealBloomPass` → vignette → grain, ACES tone map + exposure on the renderer |
| A4 | point-cloud blending → `AdditiveBlending` + `depthWrite:false` on `void`; soft radial alpha falloff | §6.3 | `todo` |
| A5 | fly: `emissive: ember` + parented warm `PointLight` + fly & light on the bloom layer | §6.5 | `partial` (Task 11) — emissive + parented `emberLight` landed; bloom selectivity rides the luminance THRESHOLD, not a dedicated bloom layer — layer is a Task 12 call |
| A6 | world: cool key light (drop the warm "sun"), `buoy` material + Fresnel rims, grid → radial ground disc, dim bounds hairline | §2.4, §6.6 | `partial` (Task 11) — cool key + hemi, buoy mats + Fresnel rim, radial ground disc, no grid; the dim bounds hairline has no mesh yet — follow-up |
| A7 | core edges `pathway` colour, opacity ~0.15 at rest; escape pulse travels them | §2.3, §6.4 | `todo` |
| A8 | `src/ui/` built to the §3 type split + §4 layout; `index.html` mono-everything stub retired | §3, §4 | `done` — §3 type split + §4 layout landed; region-filter checkboxes render in the Plan 2c panel (Task 8) |
| A9 | `prefers-reduced-motion` branch | §5 | `partial` (Task 12) — 02b half: `reduced` gates fly bob, camera idle sway, camera kick, and the banner type-in; wing flap / physics / meters / ember ignite stay. Connectome breath + panel converge are Plan 2c. |
| A10 | load sequence: points converge → banner types in → fly ignites → HUD fades in last | §5 | `partial` (Task 12) — 02b half: banner types in → fly ignites → HUD fades in last (`loadEnvelope`). The 'points converge out of the dark' phase is Plan 2c. |
| A11 | escape burst treatment: white bloom + pathway pulse + camera kick, decays ~0.3 s | §5 | `partial` (Task 12) — 02b half: ember spike + camera kick (positional shove + roll, decays ~`ESCAPE_KICK.decayS`). The white bloom flash + pathway pulse are Plan 2c. |
| A12 | final HUD contrast re-checked against the real `void` background | §2.5 | `partial` (Task 11) — HUD tokens are Deep Field §2.5 verbatim; the visual contrast re-check against the real running `void` background is Task 12's manual pass |
| A13 | region tints (§2.2) on resting points, keyed by group | §2.2 | `deferred → Plan 03 ok` |

`A13` and the per-segment `A7` pulse are the safe things to push to Plan 03 if
02b runs long. Everything A1–A12 is the Deep Field floor.

### 7.1 Quick self-check before marking the aesthetic pass done

- Screenshot the running app. Is there exactly **one** warm thing in the frame?
  If the world, the lights, or the UI have gone warm, the central move is broken.
- Cover the fly with a thumb. Does the rest read as cool, quiet, and deep — not
  as "black background, teal accent"?
- Trigger an escape. Is it the sharpest motion in the whole scene?
- None of §2's "not this" list crept back in (cream, tinted-black, grid, nebula).

## 8. References

- Google Research — *A connectomics milestone: mapping the complete male fruit
  fly brain* (region colour convention: central=green, optic=violet, cord=blue).
  <https://research.google/blog/a-connectomics-milestone-mapping-the-complete-male-fruit-fly-brain/>
- FlyWire Codex / Neuroglancer scenes — categorical bright-on-dark neuron
  colouring. <https://codex.flywire.ai/>
- dzhng — `fly-escape` ("Brain Chamber"): the sunlit-house look Deep Field is
  defined against. <https://github.com/dzhng/fly-escape> ·
  <https://fly-escape.vercel.app/>
- Deep-sea bioluminescence palettes — cool cyan/teal points on near-black,
  darkness as material; the reference for `neuron`/`spark`/`void`.
