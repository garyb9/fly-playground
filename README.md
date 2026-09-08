# fly-playground

A browser playground where a simplified simulation of the *male Drosophila*
connectome (Janelia FlyEM / Google Research **MaleCNS v1.0**) drives a 3D fly
flying freely through a small world. Sensory stimulus goes *into* the network,
motor activity comes *out* of it, and the whole brain is drawn as a point cloud
that pulses while the fly flies.

This is an **engineered mapping**, not a living fly and not a consciousness
upload. The wiring is real; the neuron equations, the sensory encodings, and the
motor decodings are models. See [`docs/references.md`](docs/references.md) for the
projects that inspired this and the data it is built on.

## Status

Plan 01 (foundations + sim core) complete: repo toolchain, synthetic fixture,
Rust + TypeScript decoders, and a deterministic Rust→WASM LIF `Sim`
(`crates/fly-sim`) that steps the fixture with inject / readout / snapshot and a
golden-trace lock. Next: Plan 02 (app shell — worker bridge, brainviz, body,
world, sensing, UI, audio).

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

| Part | Tech |
| --- | --- |
| Offline data pipeline | Python (pandas, pyarrow, neuprint-python, navis) |
| Simulation core | Rust → WASM (`wasm-pack`, `wasm-bindgen`) |
| App shell | TypeScript + Three.js, bundled with Vite |
| Audio | Web Audio API |
| CI | `cargo test`, `wasm-pack build`, `vitest`, `tsc --noEmit`, `vite build` |

## Quickstart (once implemented)

```bash
# 1. Generate data assets (one-time, needs ~1.1 GB download)
cd pipeline && uv sync && python fetch.py && python filter.py && python tier.py && python emit_bin.py

# 2. Build the WASM sim
wasm-pack build crates/fly-sim --target web

# 3. Run the app
npm install && npm run dev
```

Until the pipeline is run, the app and tests use a small synthetic connectome
fixture under `pipeline/out/`.

## Controls (target)

| Key / control | Action |
| --- | --- |
| Neuron slider | how much of the brain to integrate (core … 166k) |
| Camera toggle | follow-the-fly ↔ free-fly through the brain |
| Audio controls | mute / volume |
| Readout + sensory meters | watch stimulus → brain → motion |

## Documentation

- [`docs/2026-09-09-design.md`](docs/2026-09-09-design.md) — full design / spec
- [`docs/architecture.md`](docs/architecture.md) — module map, worker protocol, ring buffer
- [`docs/neuron-model.md`](docs/neuron-model.md) — LIF math, CSR format, exc/inh sign, determinism
- [`docs/data-pipeline.md`](docs/data-pipeline.md) — download → filter → tier → binary formats
- [`docs/references.md`](docs/references.md) — inspiration and data sources

## License & attribution

Project code: TBD.

The MaleCNS dataset is **CC-BY 4.0**. Any build that ships derived connectome
data must cite: *FlyEM / University of Cambridge / MRC LMB / Google Research —
MaleCNS v1.0*. See [`docs/references.md`](docs/references.md).
