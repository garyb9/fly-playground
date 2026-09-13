# fly-playground

A browser playground where a simplified simulation of the _male Drosophila_
connectome (Janelia FlyEM / Google Research **MaleCNS v1.0**) drives a 3D fly
flying freely through a small world. Sensory stimulus goes _into_ the network,
motor activity comes _out_ of it, and a layered anatomical brain inspector shows measured regions, somata,
and selected neuron arbors alongside live neural activity.

This is an **engineered mapping**, not a living fly and not a consciousness
upload. The wiring is real; the neuron equations, the sensory encodings, and the
motor decodings are models. See [`docs/references.md`](docs/references.md) for the
projects that inspired this and the data it is built on.

## Status

Plan 01 (foundations + sim core) complete: repo toolchain, synthetic fixture,
Rust + TypeScript decoders, and a deterministic Rust→WASM LIF `Sim`
(`crates/fly-sim`) that steps the fixture with inject / readout / snapshot and a
golden-trace lock.

Plan 02 (app shell) complete: the fixture brain flies the fly through a
proximity + looming → escape loop in the browser, over a `SharedArrayBuffer`
worker bridge with a `postMessage` fallback, with the connectome drawn as a
Three.js point cloud.

Plan 02b (rich loop + controls) complete: light / wind sensing, the edge-instrument
HUD (depth slider, readout + sensory meters, LIF panel, theme and audio controls,
scene editor), reactive audio, runtime world editing with persistence, and the
"Deep Field" aesthetic pass (palette + post-FX + motion + load sequence +
reduced-motion). The aesthetic direction is specced in
[`docs/2026-09-09-visual-direction.md`](docs/2026-09-09-visual-direction.md), with a
status table the implementing agent keeps current. Plan 2c (docked brain panel) is implemented: a separate connectome view with
mean neural activity, threshold counts, synthetic-group filters, escape glow,
load convergence, dark/light themes, and reduced motion. Pause now freezes body
and sensors as well as the simulation. Browser acceptance covers desktop and
compact layouts, both transports, and context recovery; the 60 fps hardware-GPU
performance target still needs verification. See the
[implementation and validation record](docs/superpowers/plans/2026-09-10-fly-playground-2c-brain-panel.md).
Plan 2d adds fly-centered mouse camera controls: left-drag orbit, wheel zoom,
and middle-click / **center fly** to recenter while retaining zoom and angle.
Plan 03 adds right-drag and WASD/arrow panning, inverted orbit drag, and
Shift+wheel fly selection. The camera shortcuts are listed below.
Plan 03 adds the full **166,700-neuron MaleCNS** dataset (10,520,431 directed
edges after the ≥3-contact filter), 90 anatomical region surfaces, 139,662
measured soma positions, and 24 identified circuit skeletons. The app starts
with three independently simulated, randomly named flies. Each defaults to 50,000 active neurons; its depth slider ranges from the
1,585-neuron always-on circuit to all 166,700 neurons.
Select/follow a fly, add/remove flies, pulse/hold/silence selected cells, inspect
escape traces, and toggle tonic motor drive. Nearby flies enter the looming
sensory pathway. Source hashes and causal checks are included; physiology and
motor decoding remain engineered models. Optional experimental light/wind encoders drive annotated native cells; their
current proxies and downstream responses are documented separately. Deployment is deferred.
See the [Plan 03 record](docs/superpowers/plans/2026-09-10-fly-playground-03-anatomy-experiments.md).

## What it does (target)

- Loads a tiered, pruned version of the MaleCNS connectome.
- A Rust → WASM **leaky integrate-and-fire** network runs at a fixed 200 Hz in a
  Web Worker, decoupled from render framerate.
- An always-on **behavioural core** (looming detectors, giant-fiber escape
  circuit, descending neurons, wing/steering motor neurons) guarantees the fly
  is always alive and reactive.
- A **neuron-count slider** adds the rest of the brain on top of the core, up to
  the full ~166k neurons (with a performance cost).
- The fly has **6DOF free flight** — hovering is the neutral state.
- It **senses** proximity, looming, and light direction; a looming object
  triggers a giant-fiber escape burst.
- Ambient audio bed + reactive one-shots.

## Stack

| Part                  | Tech                                                                    |
| --------------------- | ----------------------------------------------------------------------- |
| Offline data pipeline | Python (pandas, pyarrow, neuprint-python, navis)                        |
| Simulation core       | Rust → WASM (`wasm-pack`, `wasm-bindgen`)                               |
| App shell             | TypeScript + Three.js, bundled with Vite                                |
| Audio                 | Web Audio API                                                           |
| CI                    | `cargo test`, `wasm-pack build`, `vitest`, `tsc --noEmit`, `vite build` |

## Quickstart

Use `wasm-pack` 0.15.0 (also pinned in CI). To install or upgrade:

```bash
cargo +stable install wasm-pack --version 0.15.0 --locked --force
```

```bash
# Prepared MaleCNS assets are included under public/data/malecns.
npm install
yarn dev

# To rebuild the public data from source (~1.1 GB download):
python3 -m venv pipeline/.venv
pipeline/.venv/bin/pip install -e "pipeline[real,dev]"
yarn data:build
yarn data:verify
```

The browser loads the prepared real data. Unit tests also retain the small
synthetic fixture under `pipeline/out/fixture/`. Large browser assets are checked
by SHA-256 and cached in IndexedDB by bundle version.

## Controls

| Key / control             | Action                                                 |
| ------------------------- | ------------------------------------------------------ |
| Left-drag in the world    | Orbit around the moving fly                            |
| Scroll wheel              | Zoom in / out                                          |
| Right-drag                | Pan horizontally / vertically                          |
| WASD / arrow keys         | Pan the camera (also while paused)                     |
| Middle-click / center fly | Recenter on the fly; retain zoom and viewing direction |
| Shift + scroll            | Select the previous / next fly                         |
| Space / pause             | Pause or resume the simulation and body                |
| Neuron slider             | Selected fly’s simulated depth (1,585–166,700)         |
| Anatomy layers / regions  | Show/hide surfaces, somata, circuit and arbors         |
| Audio controls            | Mute / volume                                          |
| Readout + sensory meters  | Watch stimulus → brain → motion                        |

Additional controls: **add fly**, **remove selected**, **reset trial**, a fly roster,
and independent **pulse / hold / silence / restore** interventions. Select a
circuit in the experiment strip or search for a type/body ID in the expanded
anatomical inspector. **Tonic flight drive** applies a modeled constant current
to wing motor cells; disabling it removes that drive. Both neuronal and body
state pause together. Full depth and additional flies increase CPU/memory cost.

## Documentation

- [`docs/2026-09-09-design.md`](docs/2026-09-09-design.md) — full design / spec
- [`docs/2026-09-09-visual-direction.md`](docs/2026-09-09-visual-direction.md) — "Deep Field" aesthetic direction + implementation status
- [`docs/architecture.md`](docs/architecture.md) — module map, worker protocol, ring buffer
- [`docs/neuron-model.md`](docs/neuron-model.md) — LIF math, CSR format, exc/inh sign, determinism
- [`docs/data-pipeline.md`](docs/data-pipeline.md) — download → filter → tier → binary formats
- [`docs/references.md`](docs/references.md) — inspiration and data sources

## License & attribution

Project code: MIT. Derived MaleCNS assets: CC-BY 4.0; see `public/data/malecns/ATTRIBUTION.md`.

The MaleCNS dataset is **CC-BY 4.0**. Any build that ships derived connectome
data must cite: _FlyEM / University of Cambridge / MRC LMB / Google Research —
MaleCNS v1.0_. See [`docs/references.md`](docs/references.md).

Each fly now receives an independent neural/body-noise seed and starting heading;
reset trial reuses its seed and heading. Hover over its roster entry to see the
seed. Body/wing colors match its compact top roster marker and trail. Floating names
are removed from the scene. **Randomize features** changes
the selected fly's cosmetic body proportions and wing span.

**Selected fly brain depth** offers 1,585, 10,000, 50,000 and 166,700 presets;
the existing neuron slider allows intermediate counts. Increasing depth includes
more neurons; it does not automatically make every neuron fire.

The inspector's **active paths** layer colors up to 1,000 recorded compact-circuit
connections by smoothed source activity. These soma-to-soma lines are connectivity
cues, not measured axon trajectories or proof of signal transmission. The 24
measured arbors also brighten with their cell's activity. Live circuit meters
show mean activity among currently simulated members. Optional region glow uses measured ROI pre/post synapse counts to weight cell
activity, with simulated coverage shown. This does not localize activity within
an individual neuron.

**Matched causal assay** runs isolated control, stimulated and pathway-silenced
conditions for looming/escape or either wing motor group. It uses identical seeds,
fixed 5 ms brain/body steps, a declared 400 ms pulse and the same starting body.
Save the definition and traces as JSON; loading validates the data-bundle version
and target indices before replay. The assay uses its own declared LIF parameters
(no membrane noise), independently of the live playground's tuning.

Live bodies now advance according to elapsed neural ticks, using fixed physics
substeps and the latest held readouts. Background-tab recovery is capped at one
second. Exact deterministic comparisons use the isolated assay, which has every
tick's readout.

See [the continuation record](docs/2026-09-10-plan03-continuation.md) for sensory
assumptions, causal evidence, performance measurements and remaining limits.

The left sidebar opens on **Brain**, with a visible neuron-count slider directly below the
brain view; **Habitat** and **Tuning** have their own tabs. Fly names stay across
the top, with fly controls in a collapsible lower panel. New flies start at 50,000 active neurons. The camera help dropdown has been removed.

**Habitat** generates 1–4 connected rooms, 0–12 editable point lights and 0–80
flowers. A seed reproduces the layout; **Shuffle seed** generates another one.
Generation replaces the current scene and saves it locally. Use **reset trial**
to put flies at the new entrance. Flowers currently provide visible obstacles,
without an olfactory or feeding model. Light count excludes ambient/key lighting.

**Flight drive** adjusts the selected fly's modeled tonic wing-motor current;
the default is 0.85 (previously 0.6). On the compact graph with seed 42, a
1,000-tick software check measured mean wing activity of 0.506 versus 0.483;
the body model's hover reference is 0.5. This is model tuning, not biological
validation. The neural experiment target list also includes forward thrust motors.
