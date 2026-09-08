# References

## The dataset

- **Announcement — Google blog:** *A map of the male fruit fly brain*
  <https://blog.google/innovation-and-ai/technology/research/male-fruit-fly-brain-map/>
- **Announcement — Google Research blog:** *A connectomics milestone: mapping the
  complete male fruit fly brain*
  <https://research.google/blog/a-connectomics-milestone-mapping-the-complete-male-fruit-fly-brain/>
- **Project team:** Janelia FlyEM — MaleCNS connectome
  <https://www.janelia.org/project-team/flyem/male-cns-connectome>
- **Download hub:** <https://male-cns.janelia.org/download/>
- **Query API:** neuPrint, dataset `male-cns:v1.0`
  <https://neuprint.janelia.org>
- **Browser exploration:** Neuroglancer scene linked from the download hub.
- **GCS bucket (public HTTP works too):** `gs://flyem-male-cns/v1.0/`
  e.g. `https://storage.googleapis.com/flyem-male-cns/v1.0/connectome-data/flat-connectome/body-annotations-male-cns-v1.0-minconf-0.5.feather`
- **License:** CC-BY 4.0. Cite *FlyEM / University of Cambridge / MRC LMB /
  Google Research — MaleCNS v1.0*.

Scale: ~166,700 neurons, ~125 M synapses / ~25 M directed segment-to-segment
edges after aggregation. Native coordinates are 8 nm voxel units.

## Inspiration — projects that drive a fly body from this connectome

- **fly-escape** (dzhng) — Rust → WASM LIF sim + TypeScript + Three.js browser
  game, "a selected part" of the MaleCNS connectome, graph pre-prepared and
  committed, simulation buffers before playback.
  Repo: <https://github.com/dzhng/fly-escape>
  Demo: <https://fly-escape.vercel.app/> · About: <https://fly-escape.vercel.app/?about>
- **NeuroCraft Fly** (evnsnclr) — Minecraft Fabric mod; retained MaleCNS graph of
  166,700 neurons and 25,582,938 directed edges; pipeline
  `inputs → modeled neural activity → labeled readouts → scripted body programs → movement`.
  Repo: <https://github.com/evnsnclr/neurocraft-fly-public>
- **desktop-fly** (DenisSergeevitch, older, FlyWire + MaleCNS locomotor extract) —
  referenced in the original research notes for this project.
- Tweets that circulated these: `NewsFromGoogle/status/2095553014715093022`,
  `evnsnclr/status/2095975490708291948`, `dzhng/status/2097372164999847964`.

## Neuron model background

- **EPFL — Neuronal Dynamics, Ch. 1.3: Integrate-and-Fire Models**
  <https://neuronaldynamics.epfl.ch/online/Ch1.S3.html>
  Gerstner, Kistler, Naud & Paninski. Primary reference for the LIF equations
  used here.

## Tooling

- `neuprint-python` — <https://connectome-neuprint.github.io/neuprint-python/>
- `navis` — <https://navis.readthedocs.io/> (skeleton / mesh handling)
- `wasm-pack` / `wasm-bindgen` — <https://rustwasm.github.io/wasm-pack/>
- Three.js — <https://threejs.org/>
- Vite — <https://vitejs.dev/>
