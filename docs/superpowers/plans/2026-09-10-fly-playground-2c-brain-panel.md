# Plan 2c — docked brain panel, grounded in the running app

Date: 2026-09-10. Status: implemented and browser-validated; full CI passed. Hardware-GPU performance acceptance remains open.

Builds on [the approved 2c design](../specs/2026-09-09-fly-playground-2c-brain-panel-design.md). The corrections below supersede its stale implementation assumptions. Keep the main scope: a dedicated brain panel, live activity, role summaries, filters, and removal of the world-space graph. Keep Rust, the worker protocol, and `FrameView` unchanged for the panel implementation.

## Review evidence

Reviewed `main` at `ef3fd6b`, the design and handoff documents, the data pipeline proposal, rendering, sensing/body loop, role definitions, and worker snapshots. The existing `plan-2c-brain-panel` worktree contains no brain-panel implementation or written implementation plan; it is behind current main. Do not overwrite or implement from that stale checkout without reconciling it first.

Used headless Chrome through its DevTools protocol to render the local Vite app, inspect controls, pause, switch theme, expand the scene editor, and resize from 1440×900 to 800×600. Also opened the linked fly-escape demo visually. Captures are currently in `/tmp/fly-review/`: `desktop-12s.png`, `compact.png`, `paused-before.png`, `paused-after.png`, `light.png`, `editor.png`, and `reference-fly-escape.png`. The reference capture shows its house and control composition while its loading indicator remained visible; this was not a gameplay benchmark.

Findings:

- The world-space graph dominates the frame with cyan discs and crossing violet lines. It obscures the fly and obstacles and does not read as recognizable anatomy. Docking is the highest-impact next change.
- The warm fly against the cool scene is a useful identity. Its current primitive body and rectangular wings remain conspicuous; bloom alone cannot supply anatomical detail.
- The desktop controls are small and scattered. At 800×600, meters wrap into the pause/control area. Adding a panel without shared layout rules would worsen this.
- Pausing changes the status to “paused”, but the fly/world relationship and sensory readings keep changing. `Loop.frameOnce` calls sensing and `body.step` regardless of `raw.paused`; this is more than decorative wing motion.
- The app loads only the synthetic 500-neuron fixture. The real pipeline is documented but not implemented. `CRUISE_THRUST` contributes forward force independently of neural thrust. The current fixture has no sensory path to the thrust/yaw readout pools.
- The session reported approximately 199–200 simulation Hz and `crossOriginIsolated === true`. Software WebGL and screenshot overhead make this unsuitable evidence of hardware rendering performance. The postMessage path was not visually exercised in this review.
- No page runtime exceptions were captured. There was a favicon 404 and a WASM initialization deprecation warning, plus software-renderer readback warnings.
- Baseline: 32 root test files / 106 tests passed. The default Vitest discovery also runs tests from both `.claude/worktrees` copies, inflating results to 96 files / 318 tests; exclude those copies explicitly until configuration is fixed.

The fly-escape reference is stronger in environmental readability and control hierarchy. Preserve Deep Field's palette while making the fly, obstacle, and brain response equally easy to locate.

## Corrections to the old 2c specification

1. **Role membership:** `RoleTable` maps names to worker role IDs, not neuron IDs. Construct the monitor from parsed `GroupsFile.inputRoles` and `readoutRoles`, or an immutable membership structure derived from them. Do not index neuron activity with role IDs. Map display `yaw` to `yaw_torque`. Exclude the union of *all* input and output memberships from background, including light, wind, and proximity.
2. **Activity semantics:** the snapshot contains smoothed activity, not spike events. Prefer “active above threshold” and “mean activity” in labels/help. Input stimulus meters and sensory-neuron activity are different quantities. Decorative edge travel illustrates graph connectivity; it is not measured spike propagation.
3. **Active depth:** count and summarize only the acknowledged snapshot prefix at fixture scale; clear the unused attribute tail when depth decreases. Display firing/active/total without implying inactive neurons are live. A group filter changes visibility only, not simulation membership or summary statistics.
4. **Responsive sizing:** the old fraction fallback makes a 300px panel only 124.8px wide at 800px. Retain a readable roughly 300px card on desktop, with a 280px compact target where space permits. Use constrained height and a collapsible feed/filter region instead of scaling text. On narrow screens, provide a collapsed card/expanded sheet. Recalculate HUD clearance from actual panel bounds, including expanded filters, rather than the old fixed reserved fraction.
5. **Shared lifecycle:** `loadEnvelope` is already a function in `viz/motion.ts`, consumed using `bootT` in `main.ts`; it is not the object described in the old spec. Pass presentation time/load state explicitly to the panel without adding worker fields. Share the main render clock rather than introducing a competing RAF. Continue cosmetic panel motion while paused, but freeze activity and physical state.
6. **Group controls:** panel DOM emits a visibility request through controls; `panel.setGroupVisible` only applies it. Avoid recursive callbacks through `panelHandle`.
7. **Existing themes:** use the current palette module and initialize from the persisted theme. Update the panel on theme changes. No temporary palette shim is needed.
8. **Scale boundary:** above `snapMax = 8192`, worker snapshots are strided and no longer map directly to neuron indices. The 500-neuron implementation must not be represented as full-scale ready. Plan 03 must explicitly supply snapshot identity or aggregates before accurate full-brain summaries and coloring can ship.

## Implementation sequence

### 1. Stabilize pause and establish the test boundary

Files: `src/app/loop.ts`, `src/app/loop.test.ts`, `vitest.config.ts`.

- Read pause state before advancing the body/sensing. During acknowledged pause, retain the physical pose and sensory state and keep publishing the last frame for UI/rendering. Keep frame timing current so resume does not integrate paused elapsed time.
- Add a regression checking body pose, sensory values, and stimulus submission remain frozen, with correct resume behavior. Handle the initial paused frame explicitly.
- Restrict root Vitest discovery to project tests, preserving existing integration coverage and excluding nested worktrees.

Done when a browser pause freezes the physical scene and sensors, and the isolated root suite passes. Cosmetic wing/breath movement can remain as the existing design allows.

### 2. Implement the monitor's data contract

Files: new `src/viz/brain-panel/role-monitor.ts` and tests; `panel-view.ts` and tests; `src/app/config.ts` and tests.

- Precompute neuron membership arrays and background membership once from `GroupsFile`.
- Implement finite, bounded role means, threshold counts, fixture-region counts, bar styles, and responsive bounds.
- Handle empty roles, shortened snapshots, nonfinite samples, threshold equality, and depth reduction. Missing values must not produce NaN or stale activity.
- Keep the fixture region map explicit and labeled as synthetic. Do not present `g0…g7` as real anatomical regions.
- Add panel configuration, retiring scene brain placement settings when the relocation lands.

Done when controlled fixture activity illuminates exactly the expected roles, background excludes every role, and layout tests preserve readability without overflowing the viewport.

### 3. Build the panel renderer and cloud

Files: new `panel-cloud.ts`, materials and construction tests under `src/viz/brain-panel/`; reuse `geometry.ts` helpers where applicable.

- Dedicated small renderer/camera, fit to data bounds with a stable initial three-quarter view. Preserve the actual fixture coordinates; do not reshape random data into counterfeit anatomy.
- Soft radial points, low region tint, restrained resting edges, and activity-driven edge brightness. Apply point sizing in panel pixels and cap pixel ratio.
- Build geometry once and update buffers/uniforms. Respect shortened snapshots and hidden groups.
- Implement slow rotation, breath, shared-load convergence, and a brief escape flash/pulse. Reduced motion disables rotation, convergence travel, breathing, and moving pulse while preserving activity brightness.
- Dispose owned GPU resources; test shared-attribute ownership. Handle context loss with a visible recovery state and reconstruct/restore rendering rather than promising a retained framebuffer.

Done when a WebGL capture shows a legible volume and distinguishable rest/escape states. Construction tests alone are insufficient for shader acceptance.

### 4. Add the card and integrate the app

Files: new `brain-panel.ts`, `panel-dom.ts`, panel CSS; `src/main.ts`, `src/ui/hud.ts`, `src/ui/hud.css` as needed for clearance.

- Header with dataset status (“synthetic fixture”), active counts, region indicators, cloud, seven role rows, and collapsible group filters. Keep sensory stimulus meters distinct from neuron activity rows.
- Accessible disclosure buttons, labeled checkboxes, visible focus, and readable dark/light themes. All groups start visible.
- Wire theme, filter requests, shared animation time, viewport bounds, and `FrameView` updates. The panel consumes its view immediately or copies retained arrays; it must not assume bridge buffers stay immutable between frames.
- Remove the main-scene brain group and its activity-upload path. Keep the world and fly in the main renderer.
- Implement panel disposal through actual app/HMR cleanup, including listeners and renderer resources; the present `main.ts` has no complete teardown path to hook into automatically.

Done when the fly has clear space, no controls collide at 1440×900 or 800×600, filters remain reachable, and changing depth cannot leave old points glowing.

### 5. Visual acceptance and documentation

- Capture 1920×1080, 1440×900, 800×600, and a narrow 390×844 layout. Include dark/light, filters open, tuning/editor open, core/full depth, paused/resumed, reduced motion, and an escape event.
- Verify the same panel behavior under SAB and postMessage using a temporary development-server configuration without isolation headers; restore it afterward.
- Use a reproducible fixture stimulus scenario to capture escape; random activity is not sufficient evidence. Check temporal order of stimulus, neuronal response, readout, and body response without claiming event-level precision from smoothed snapshots.
- Record render frame time separately from simulation Hz on a named hardware/browser setup. Initial target: 60 fps on the reference desktop at fixture scale, without sustained regression from adding the panel. Establish a measured full-data budget in Plan 03.
- Run TypeScript, ESLint, formatting, Vitest, and build gates; run the repository full CI gate at implementation completion.
- Update README status, architecture, manual checklist, visual-direction status, and stale 02b/2c handoff language. Do not mark 2c complete until the browser acceptance matrix passes.

## The endgame: anatomy and autonomy

Interpret “full brain scan at the side” as an interactive anatomical reconstruction with model activity overlaid. Raw EM slice browsing is a separate optional inspection mode. A soma point cloud alone cannot reproduce the branched structures shown in the references.

The [MaleCNS download hub](https://male-cns.janelia.org/download/) provides EM/segmentation volumes, brain/VNC compartments, neuron skeletons, annotations, and the connectivity graph. It documents different coordinate units for SWC and precomputed skeletons; normalize and validate the spatial transform before overlaying activity. The [Google Research visualization](https://research.google/blog/a-connectomics-milestone-mapping-the-complete-male-fruit-fly-brain/) provides a useful anatomical reference and central/optic/VNC coloring convention.

Recommended follow-on milestones:

| Milestone | Deliverable | Evidence of completion |
| --- | --- | --- |
| 2c | Clear fly world plus accurate fixture brain instrument | Visual matrix and role/depth/pause checks above |
| 03a — anatomical view | Whole-CNS overview from real region geometry, plus progressively loaded neuron skeleton detail and selection | Recognizable anatomy, attribution, validated coordinates and body-ID mapping, measured load/memory/frame-time budgets |
| 03b — real circuit behavior | Verified sensory/core/motor role mappings, real graph, calibrated LIF drive and stable embodied behavior | Repeated autonomous episodes and causal intervention tests |
| 03c — full scale and delivery | Tiered graph loading, cache/versioning, snapshot identity/aggregation, deployment | Tested 166k-class data path, bounded memory, recovery and useful interaction under load |

03a and 03b can be developed independently once stable identity/coordinate contracts are defined. Showing the whole anatomical overview need not wait for simulating every neuron. Always distinguish loaded anatomy, simulated neurons, and displayed activity coverage. Enable an expanded brain inspection view in 03a; this revisits the old spec's camera cut intentionally, without adding it to the core 2c work.

For autonomous flight, add modeled tonic neural input, calibrate the real sensory→network→motor paths, and progressively replace constant cruise drive. Keep the engineered body decoder explicit. Verify bilateral steering, obstacle response/recovery, bounded sustained flight across seeds, and hover behavior. Disabling a relevant circuit or shuffling connectivity should predictably change the corresponding behavior; increasing neuron count alone does not establish autonomy. The actual cell-type/body-ID mapping remains the largest scientific implementation risk.

For visual fidelity, schedule a focused fly/environment art pass after docking: recognizable fly silhouette, segmented abdomen, eyes, antennae/legs, shaped translucent wings, controlled highlights, visible obstacle depth, and a camera that shows behavior. Keep Deep Field's cool-world/warm-fly direction. Prioritize composition and anatomy before adding more post-processing.

Suggested first implementation slice: tasks 1–2, followed immediately by a static docked cloud to validate the composition before investing in animated effects.

## Implementation and validation — 2026-09-10

Implemented tasks 1–4 and the functional browser matrix in task 5. The panel
uses a 300px desktop/280px compact width, actual-height HUD clearance, and a
scrolling content area rather than shrinking its labels. The source fixture
geometry is preserved. Group labels explicitly describe synthetic categories.
No dependencies, worker protocol fields, or Rust simulation changes were added.

- Full `yarn ci` passed: formatting, lint, Rust formatting/Clippy/tests, both
  WASM builds, TypeScript, 114 Vitest tests in 35 root files, production build,
  four Python tests, and byte-reproducible fixture check.
- Chrome 152 via DevTools protocol: 1920×1080, 1440×900, 800×600 and 390×844
  captures; dark/light, open group filters, core depth, paused/resumed, expanded
  editors, and a collapsed/expanded narrow-screen card.
- Both SAB (`crossOriginIsolated=true`, Vite) and postMessage (production build
  served without isolation headers) showed the live panel. Depth reduction
  acknowledged 48 of 500 neurons. Paused sensory text remained unchanged.
- Deterministic browser WASM fixture, seed 42, looming input 1.5 each tick:
  escape crossed 0.5 after 29 ticks (readout 0.507814); the panel showed looming
  mean 0.52, escape mean 0.51, and an active escape flash. Flash decayed after
  0.4 seconds. This tests a real modeled network response, not prerecorded UI.
- Reduced-motion panel screenshots at presentation times 3 and 4 seconds were
  byte-identical. Browser `WEBGL_lose_context` loss/restore showed recovery and
  resumed rendering; disposing the panel removed its DOM.
- No runtime/shader errors in these browser checks. A pre-existing missing
  favicon generated a 404 on the production static server.
- Production app JS: about 76 kB / 26 kB gzip; Three vendor chunk remains
  approximately 746 kB / 192 kB gzip. No new runtime dependencies.
- Performance sample: HeadlessChrome 152, Linux, software WebGL, 1440×900,
  postMessage/light theme, core depth, 30 RAF intervals: median 50ms, p95 66.6ms.
  This environment does **not** meet or validate the intended 60fps hardware
  target. A hardware-GPU baseline/comparison is still needed; do not treat
  simulation Hz as rendering fps.

Captures are in `/tmp/fly-review/2c-*.png`. The original browser-review captures
may have been replaced during implementation. Real MaleCNS anatomy, full-scale
snapshot identity/aggregation, physiological role mapping, and replacing constant
cruise drive are still Plan 03 work, not capabilities of this fixture panel.
