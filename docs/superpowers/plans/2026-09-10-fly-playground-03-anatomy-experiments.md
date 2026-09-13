# Plan 03 — anatomical circuit playground

Approved direction: docs/2026-09-10-reference-review-plan-03.md. Anatomy and
behavior first; deployment deferred. Implement incrementally on the existing
Three.js/Rust worker app, preserving fixture-based offline tests.

1. Harden wasm32 loaders (implemented, validated before this cycle).
2. Reproducible public MaleCNS extraction: source hashes, native body IDs,
   measured positions, real looming/escape edges, sign assumptions and path
   report. Resolve annotation schema from downloaded files. Ship a compact
   circuit and anatomically aligned region meshes, with provenance.
3. Expandable anatomical inspector: brain regions, measured soma cloud,
   selected-circuit skeletons, orbit/zoom, layer opacity and cell selection.
4. Timed simulation-tick stimulation, hold/stop, silencing and reset through both
   transports. Test that silencing blocks propagation and expiry respects pause.
5. Three independent flies, selectable/followable, shared scene, per-fly controls
   and traces. Matched replay starts and documented model limits.
6. Improve fly silhouette and expose scene experiments using existing light,
   looming and wind channels. Do not claim unimplemented food/odor responses.
7. Run repository CI and browser checks (desktop/compact, selection, intervention,
   reset, pause, camera and themes). Record measured causal circuit responses and
   actual remaining performance/data limits below.

Full-scale neuron tiers and additional modalities remain contingent on the
verified compact circuit and performance. No production deployment this cycle.

## Implementation and validation — 2026-09-10

Implemented real MaleCNS anatomy: 90 region surfaces, 139,662 measured soma
positions, six identified skeletons, and searchable native cell IDs. Missing
positions are excluded from rendering. Full-depth simulation includes 166,700
neurons and 10,520,431 edges after the ≥3-contact filter; the default always-on
circuit is 1,585 neurons. Public assets include provenance and hashes; an optional
IndexedDB cache verifies content before reuse.

Three independent named flies start together, with add/remove, per-fly depth,
selection and interventions. Peer bodies feed the looming sensor rather than
sharing neural state. Flight uses modeled motor activity with an explicit tonic
drive toggle. Pulse/hold/silence/restore and deterministic trial reset are wired
through both worker transports. Light and wind remain unmapped to native cells.

Final controls: reversed left-drag orbit, right-drag screen-plane pan, middle-click
recenter (preserving angle/zoom), Shift+wheel fly selection, and WASD/arrows pan.
Keyboard navigation works while paused and ignores editable controls. A compact
expandable controls legend is included.

Validation: complete yarn ci passed (128 TypeScript tests, 35 Rust unit tests,
two golden tests, seven Python tests, lint/types/format/build/fixture checks).
Actual WASM causal verification: looming stimulation produced a giant-fiber peak
of 0.87136 from baseline zero; silencing giant fibers or removing looming outgoing
edges reduced the peak to zero. Reset replay was deterministic. The full 166,700
model preserved that response; 320 release-WASM ticks took about 181 ms in Node.
These results validate the implemented model, not biological behavioral fidelity.

Browser checks covered three named flies, spawning a fourth, selecting full depth,
interventions, desktop/compact layouts, and themes. Final camera checks verified
native right-drag pan and middle-click recenter, Shift+wheel selection after UI
refresh, keyboard pan, and input-focus exclusion. Three default circuits ran near
200 Hz in headless Chrome. Hardware-GPU 60 fps and multi-fly full-depth browser
performance remain unverified. Production deployment remains deferred.

## Follow-through on remaining work

See [the continuation record](../../2026-09-10-plan03-continuation.md) for the
matched replayable assay, model-to-body causal tests, opt-in visual/wind encoders,
24 measured arbors, measured ROI activity membership and full-depth multi-fly
benchmarks. Those additions supersede the sensory and geometry limits in the
earlier implementation snapshot above. Biological calibration and hardware-GPU
60 fps validation remain open; production deployment is still deferred.
