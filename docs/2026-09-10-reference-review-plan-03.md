# Plan 03 reference review — anatomy and interactive experiments

Reviewed 2026-09-10. User priority: anatomy and verified brain-driven behavior;
production deployment is deferred. This is a quick source and asset review,
not a completed browser acceptance run or biological validation.

## Recommended experience

Keep the Deep Field palette, but give the scene a recognizable anatomical
centerpiece: a translucent brain surface with colored regions, measured neuron
positions and detailed arbors for the selected circuit. Offer an expanded brain
inspector beside the world. Put a small fly roster below the world and a compact
experiment strip below the selected brain. Use consistent region colors; reserve
brightness for activity and a separate selection outline for the targeted fly.

The first compelling interaction should be: select a fly, select the looming
circuit, apply a short pulse, and see its measured neural response and resulting
body motion together. Then repeat with the escape pathway silenced. This makes
both play and causal inspection useful from the first real-data milestone.

## What the references actually provide

| Reference | Verified material | Best use here |
| --- | --- | --- |
| [The palm](https://whatisabrain.com/fly/palm.html) | HTML and deployed JS load separate body, brain outline, neuropil and neuron GLBs; opacity controls; staged circuit explanations and signal animations | Anatomical layers, focus transitions, restrained labels and selected-neuron detail |
| [Fly Escape](https://github.com/dzhng/fly-escape) | Public TypeScript/Three.js and Rust; measured soma exporter; group activity renderer; selected-fly panel, paired eyes and playback UI | Roster, synchronized traces, graph-to-position identity mapping and asset budgets |
| [Desktop Fly](https://github.com/DenisSergeevitch/desktop-fly) | Brain picking/stimulation source; MaleCNS extraction with path and coverage reports; articulated model and Windows Three.js port | Pulse interaction, causal checks, descending-to-motor extraction patterns |
| [FlyWire Codex](https://codex.flywire.ai/?dataset=fafb) | Public catalog lists search, cell details, region views, pathways and 3D inspection; computational tools require login | Search by type/body ID, selected-neuron card, upstream/downstream highlighting |
| [Fly Effect](https://github.com/dj-thank/fly-effect) | Python/Brian2 backend with graph integrity checks, checkpoint/restore and synthetic example; experimental body coupling | Reproducible trials and explicit validation boundaries |
| [NeuroCraft](https://github.com/evnsnclr/neurocraft-fly-public) | Demo and documentation; runnable mod/companion source is not yet released | Brush, light, food and approach experiments; no implementation to transplant yet |

I inspected the repository's saved Fly Escape screenshot showing the selected
fly, roster, paired eye views, measured brain positions, traces and playback.
The palm review used HTML/JS and downloaded GLB headers, not a live visual test.

## Real brain geometry: a practical route

The palm uses `meshes/light/regions/BRAIN.glb`, separate region GLBs (including
PB and EB), individual neuron GLBs and `meshes/fly/fly.glb`. The brain surface
file is about 78 KB and PB about 11 KB: surface anatomy need not require a huge
browser payload. Its [deployed renderer](https://whatisabrain.com/fly/js/palm.js)
uses Three.js GLTFLoader/Draco, translucent surfaces and a wireframe overlay.
The timed signal waves are presentation sequences; they are not evidence of
simulated spikes. Our activity display should follow our simulation timestamps.

For our actual assets, use the MaleCNS coordinate space. The official
[download hub](https://male-cns.janelia.org/download/) provides ROI segmentation
and skeleton sources. The public [brain ROI metadata](https://storage.googleapis.com/flyem-male-cns/rois/fullbrain-roi-v4/info)
explicitly advertises a `mesh` directory and segment properties. Next, inspect
those mesh fragments and labels, convert selected surfaces to compact GLBs,
and apply the same coordinate transform to surfaces, somata and skeletons.
The metadata is verified; mesh conversion and alignment are not yet tested.

Use three levels of detail: brain/region surfaces always available; measured
somata for the broader network; skeletons or detailed neuron meshes loaded only
for selected cells. A region surface describes neuropil anatomy, not a measured
outer tissue membrane. Missing positions need explicit coverage accounting.
Do not construct a smooth hull of random fixture points and label it anatomy.

[Fly Escape's exporter](https://github.com/dzhng/fly-escape/blob/main/scripts/export-brain-positions.py)
reads MaleCNS somaLocation, retains graph indices, omits missing locations and
uses uniform normalization. Its [brain renderer](https://github.com/dzhng/fly-escape/blob/main/packages/game-renderer/src/brain-view.ts)
colors points by recorded group means; that distinction matters when displaying
anatomy beyond the individually simulated or individually reported neurons.

## Experiments and several flies

Start with three independent flies: control, stimulated, and pathway-silenced.
Each needs its own neural state, random seed, sensors and body. Identical initial
conditions plus the same stimulus schedule allow useful comparisons. Share
immutable geometry immediately; sharing the large graph between WASM instances
requires an explicit memory design. Render detailed anatomy for the selected
fly and summarize the others. Validate one circuit and profile three flies
before promising full-CNS real-time swarms.

Use separate **Inspect** and **Stimulate** tools. Selection shows the affected
cells; stimulation has amplitude, duration, pulse/hold and stop controls.
Spatial selection should resolve actual simulated cell IDs and show the count.
Add silence/restore as a distinct intervention. The existing injection API can
support positive drive, but precise timed interventions, arbitrary selections
and silencing need worker/simulation support. Expiry must use simulation ticks
so pause, replay and render rate do not change the experiment.

[Desktop Fly's BrainView.swift](https://github.com/DenisSergeevitch/desktop-fly/blob/master/BrainView.swift)
separates orbit drags from clicks, picks nearby circuit neurons and sends a
400 ms stimulus. Its extra decorative flies do not each carry the brain;
our comparison flies should. Its [MaleCNS extractor](https://github.com/DenisSergeevitch/desktop-fly/blob/master/etl_malecns.py)
records native identities, actual descending-to-motor paths and input coverage.
The leg circuit is a useful extraction example, not a ready flight controller.

Add movable light, a looming paddle and wind first, using our existing sensory
channels. Food/odor can follow once receptors and circuit mappings exist.
Display stimulus, neural activity and motor response on one timeline. Save seed,
parameters, interventions and graph version for repeatable trials. Fly Effect's
[backend](https://github.com/dj-thank/fly-effect/blob/main/organism_core/brain.py)
provides a useful checkpoint/RNG restoration reference, although its Python
runtime is not a browser replacement.

## Body and reuse boundaries

[NeuroMechFly](https://neuromechfly.org/) is the upstream body reference credited
by The palm. Its micro-CT-based model offers a much stronger silhouette and
articulated parts. Use a reduced visual asset with our existing body dynamics
first; adopting its full mechanics is a separate scope. The reference body is
female, so fitting MaleCNS inside it is an illustrative placement requiring
clear provenance, not a same-specimen registration.

FlyGym's [license](https://github.com/NeLy-EPFL/flygym/blob/main/LICENSE) is
Apache-2.0. Desktop Fly's original code and Fly Effect's original code are MIT;
external datasets and meshes have separate terms. Desktop Fly marks its
FlyWire-derived files CC BY-NC and MaleCNS files CC BY. No general license file
was found in the inspected Fly Escape tree, and a reuse license for The palm's
site code was not established. Use their patterns as references; source our
anatomy from licensed upstream data and verify terms before copying code/assets.
The palm's FAFB cells must not be relabeled as our MaleCNS cells.

## Suggested Plan 03 sequence

1. Anatomical viewer: MaleCNS surfaces, real soma coordinates, region controls,
   selected-circuit skeletons and explicit asset/coordinate provenance.
2. One verified real circuit: looming input to escape readout, with stimulus and
   silence controls, traces, path checks and matched causal tests.
3. Three-fly comparison: independent states, reproducible starting conditions,
   selection/follow, per-fly intervention and simultaneous outcome traces.
4. Better body and richer world interactions; add sensory modalities only with
   a declared encoding and validated circuit response.
5. Full-scale delivery and performance work as required by those milestones.
   Production deployment remains deferred.

Before this research request, the initial Plan 03 loader prerequisite was
implemented in `crates/fly-sim/src/core/format.rs`: checked length arithmetic and
rejection of edge counts beyond u32 CSR capacity. Rust tests (34 unit + 2 golden),
Clippy, wasm32 compilation and six oversized-header WASM checks passed; valid
construction after rejected input also passed. No UI or data migration is yet
implemented. No external source code or geometry has been copied into the app.
