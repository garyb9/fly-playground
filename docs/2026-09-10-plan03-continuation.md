# Plan 03 continuation — behavior, experiments and scale

## Implemented

The matched assay executes control, stimulated and pathway-silenced conditions
using real graph data, identical neural/body seeds, identical tonic drive and a
fixed empty arena. Brain and body advance together every 5 ms. The interface
offers looming/escape and bilateral wing motor targets, shared-time stimulus,
escape, height, speed and heading plots, plus JSON save/load/replay. Files contain
the bundle identity, neuron indices, seed, all LIF parameters, tonic drive and
pulse schedule. Loading rejects incompatible bundles and invalid/inactive IDs.
The assay deliberately has its own settings, independent of live tuning.

Tests against the actual compiled WASM establish that looming stimulation raises
escape activity and changes body motion, escape-cell silencing blocks the escape
response, left/right motor stimulation produces opposite modeled turns, and
replay produces identical sample arrays. This is causal validation of software
coupling, not a claim that the flight model reproduces physiology.

Live body integration now follows elapsed neural ticks rather than render wall
time. Fixed physics substeps use the latest held neural readouts. Catch-up after
a background-tab gap is capped at one second. This fixes time-rate mismatch but
does not recover intermediate neural snapshots; the isolated assay is the
reproducible comparison path.

## Experimental sensory encoders

The annotations identify 1,903 left and 1,924 right Mi1/Tm3 neurons, and 157 left
and 110 right JO-E neurons annotated as wind/gravity sensing. Sides use rootSide,
falling back to somaSide. Enabling the experimental-input toggle activates full
depth for the selected fly; reducing depth afterward limits available targets.

Mi1 and Tm3 respond preferentially to brightness increments in published
recordings ([Behnia et al., 2014](https://www.nature.com/articles/nature13427)).
Our opt-in encoder sends bounded positive luminance-change current to these
cells. It is a downstream ON-pathway proxy: there is no retinal image,
column-specific delay, OFF pathway, or validated phototaxis behavior.

Wind encoding uses positive antenna-facing current into JO-E cells. Published
work distinguishes C/E opponent antennal deflections
([Suver et al., 2019](https://pmc.ncbi.nlm.nih.gov/articles/PMC6533146/)).
Our encoder does not reconstruct those push/pull mechanics or claim wind-guided
navigation. Both current gains are engineered.

The data:verify:sensory script stimulates each native source group in full-depth
release WASM, reads its strongest recorded downstream partners, then repeats
with the sources silenced. All four groups produced downstream responses;
source silencing reduced each measured response to zero. Exact target indices
and results are in sensory-model-validation.json. This checks neural wiring
under direct current, separately from natural-stimulus fidelity.

## Anatomy and activity

The viewer now includes 24 measured SWC arbors, adding bilateral visual,
wind-sensory and wing-motor examples. The public MaleCNS download hub documents
the [8 nm SWC coordinate space](https://male-cns.janelia.org/download/).

Region glow uses 438,138 memberships extracted from the public neuron table's
roiInfo pre/post synapse counts across the 90 displayed ROIs. The display is a
synapse-weighted mean of simulated cell activities. It reports coverage using
simulated versus total annotated synapse weights. One neuron may belong to
several ROIs; these are not independent region populations or subcellular
propagation measurements. Missing soma positions remain excluded from points.

The active connection layer remains a capped compact-circuit connectivity view;
its straight lines are not measured axon trajectories.

## Performance and limits

The browser-benchmark script measures actual app frames, worker tick deltas,
transport, viewport, renderer and approximate JS heap for three compact brains,
three full brains, and six full brains. An additional explicitly noise-disabled
stage records a live noise-setting comparison; it is not an isolated RNG benchmark. Results are saved in
browser-performance.json; this environment uses SwiftShader, not a hardware GPU.
JS heap excludes total process/GPU/WASM memory.

The worker no longer performs binning and allocates another activity array when
the snapshot already contains every active neuron. Simulation parameters and
the RNG sequence remain unchanged.

Still open: hardware-GPU 60 fps validation, physiological calibration of sensory
and motor models, full retinal/antennal encoders, richer social behaviors beyond
looming, arbitrary-neuron arbor loading, and session-wide replay of live
closed-loop interactions. Production deployment remains deferred.

## Recorded checks

Full repository CI passed: 137 TypeScript tests, 35 Rust unit tests, two Rust
golden tests and nine Python tests, plus formatting, lint, type checks and the
production build. Browser save/load/replay reproduced all sample arrays exactly;
a wrong bundle version was rejected. Compact layout had no horizontal overflow.

The default looming assay reported peak escape 0.871 for stimulation and zero
for both control and escape-cell silencing. Final body heights were 5.633, 3.602
and 3.977 respectively (same 5-unit starting height). The silenced condition may
still affect other motor pathways; it is not expected to reproduce the control
body trajectory exactly.

| Scenario | Neural ticks/s across flies | Render fps | Approx. JS heap |
| --- | --- | --- | --- |
| 3 flies / compact | 197.9–198.3 | 4.2 | 374 MB |
| 3 flies / full | 128.7–129.1 | 4.9 | 419 MB |
| 6 flies / full | 126.2–127.0 | 3.8 | 396 MB |
| 6 flies / full / membrane noise disabled | 87.9–116.7 | 2.9 | 397 MB |

These are software-rendered, live-scene measurements. They do not meet or
validate a hardware-GPU 60 fps target. The noise-disabled live stage was slower;
activity state, scene history and scheduling were not reset between stages, so
it must not be interpreted as an isolated measurement of RNG cost. An isolated
Node run of 320 quiescent full-depth ticks took about 354 ms without membrane
noise and 1,028 ms with noise 0.02, under concurrent browser load. No automatic
model changes are applied to obtain higher benchmark rates.

The production build also passed the native postMessage fallback check when
served without isolation headers: three flies loaded, experimental sensory input
enabled full depth, and the matched assay returned the expected 0.871 stimulated
escape peak with zero control/silenced peaks. Performance-table measurements
used the Vite development server; fallback functionality used the production
build on a plain local HTTP server.
