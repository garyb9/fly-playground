# Data pipeline

Offline, run once (or when bumping the dataset version). Lives in `pipeline/`,
Python, **not shipped to the browser**. Produces the four asset files described
in [`neuron-model.md`](neuron-model.md) §2.

```
fetch.py  →  filter.py  →  tier.py  →  core_circuit.py  →  emit_bin.py
   │            │             │              │                  │
 raw feather  pruned edges  ranked +      role neuron       neurons.bin
 + annots     + neuron set  grouped       index lists       graph.bin
                            neuron table                    groups.json
                                                            manifest.json
```

Dependencies (`pipeline/pyproject.toml`): `pandas`, `pyarrow`, `numpy`,
`neuprint-python`, `navis`, `requests`.

## Step 1 — `fetch.py`

Download and cache locally (skip if present):

| File | Size | Use |
| --- | --- | --- |
| `body-annotations-male-cns-v1.0-minconf-0.5.feather` | ~13 MB | class / type / side / group per neuron |
| `connectome-weights-male-cns-v1.0-minconf-0.5.feather` | ~1.1 GB | segment→segment weights (the graph) |
| `body-neurotransmitters-male-cns-v1.0.feather` | ~42 MB | dominant transmitter per neuron → exc/inh sign |
| `body-stats-male-cns-v1.0-minconf-0.5.feather` | ~780 MB | synapse counts (importance ranking); optional if weights suffice |

Base URL: `https://storage.googleapis.com/flyem-male-cns/v1.0/connectome-data/flat-connectome/`
(exact subpath confirmed at implementation time against the download hub).

Soma / representative position per neuron — resolved in this order:
1. a coordinate column in `body-annotations` if present;
2. else `neuprint-python` `fetch_neurons(...)` `somaLocation` for the retained set;
3. else skeleton SWC root node via `navis` for the retained set;
4. else centroid of the neuron's synapse points.

## Step 2 — `filter.py`

- Load `connectome-weights`. Columns are roughly `(body_pre, body_post, weight)`
  (confirm names).
- Drop edges with `weight < W_FLOOR` (start `W_FLOOR = 3`, tune to hit the
  15–25 M edge target).
- Keep only neurons that (a) appear in `body-annotations` with a non-null
  type/class, or (b) are in the curated core set (Step 4) regardless.
- Emit `pruned_edges.parquet` and `neuron_set.parquet`.

## Step 3 — `tier.py`

- **Importance rank:** for each neuron, `score = Σ|w_in| + Σ|w_out|` over pruned
  edges (weighted degree). Sort non-core neurons by descending `score`.
- **Group:** map each neuron to a `group_id` from an annotation column
  (neuropil / super-class / cell class — pick the one with ~10–40 distinct
  values so the region filter UI is usable). Build the ordered `groups` list.
- **Sign:** join `body-neurotransmitters`, apply the table in
  `neuron-model.md` §4, produce a per-neuron `inhibitory` bool.
- Emit `neuron_table.parquet` with final columns:
  `row_index, body_id, pos_x, pos_y, pos_z, group_id, is_core, is_inhibitory,
   is_sensory_input, is_motor_readout`.

## Step 4 — `core_circuit.py`

Builds the always-on behavioural core and the role index lists. This is the
hand-curation step and the riskiest part of the project.

Target circuit (visual → escape/steering → motor):

| Role | Candidate MaleCNS / FlyWire types (to verify in neuPrint) |
| --- | --- |
| looming input | LC4, LC6, LPLC2 (lobula columnar, loom-sensitive) |
| light input | photoreceptor / lamina L1–L5 proxies, or medulla Mi/Tm inputs; split L/R by `side` |
| wind input | antennal / Johnston's organ projection neurons (aPN, JO-*) |
| escape trigger | giant fiber (GF / DNp01), and its targets TTMn, PSI |
| descending | DNp / DNg steering + walking/flight descending neurons |
| wing / steering motor | wing motor neurons (MN*), b1/b2/iii1 steering muscle MNs |
| proximity | no native analogue — injected into GNG / a small mechanosensory pool as a startle |

Method: query `neuprint.Client(dataset="male-cns:v1.0")`, resolve each type name
to `bodyId`s, dedupe, cross-check counts against published figures, write
`core_neurons.parquet` (`body_id, role, role_side`).

If a type name doesn't resolve, log it and fall back to the nearest documented
synonym; never silently drop a role.

## Step 5 — `emit_bin.py`

- Concatenate: core neurons first (fixed order by role, then body_id), then
  non-core by descending importance. Assign `row_index = 0..N`.
- Re-index edges from `body_id` pairs to `row_index` pairs; drop edges touching a
  neuron not in the final set.
- Build CSR: sort edges by `(pre_row, post_row)`, fill `offsets`, `targets`,
  quantise `weights` to `i16` with `w_norm`.
- Scale positions by `scale_factor` (chosen so max extent ≈ 1.0), recentre on the
  centroid.
- Write `neurons.bin`, `graph.bin`, `groups.json`, `manifest.json`
  (`{version, dataset, n_neurons, core_count, n_edges, w_norm, scale_factor,
    generated_at}`).

## Outputs & shipping

- `pipeline/out/` is **gitignored** for real outputs.
- A tiny **synthetic fixture** (`pipeline/out/fixture/`, ~500 neurons, random but
  seeded, with a plausible fake core) **is** committed so the app + CI run with
  no download. `emit_bin.py --fixture` regenerates it.
- Real `graph.bin` (100+ MB) is distributed as a GitHub Release / static-host
  artifact, fetched at runtime, cached in IndexedDB keyed by `manifest.version`.
- `neurons.bin` is committed if it lands under ~50 MB, else it joins `graph.bin`
  as a release artifact.

## Tests (`pipeline/tests/`)

Run on a 500-neuron slice of the real data (or the fixture):

- `offsets` is monotonic non-decreasing, `offsets[-1] == n_edges`.
- every `targets[k] < n_nodes`.
- core neurons occupy `[0, core_count)` and every role list is non-empty.
- non-core importance scores are non-increasing.
- positions are finite and within the recentred bounding box.
- round-trip: parse the emitted binary back, compare to the source DataFrame.

## Implemented Plan 03 pipeline (2026-09-10)

The five-script sequence above is the original design. The current reproducible
implementation is `fetch.py → build_real.py → build_full.py → stamp_assets.py`;
run it with `yarn data:build` after installing `pipeline[real,dev]` in
`pipeline/.venv`. Source downloads are atomically cached in gitignored
`pipeline/raw`; prepared browser data lives in `public/data/malecns`.

- `build_real.py`: selects named LC4/LPLC2/DNp01 and wing/escape motor cells
  with measured somata plus their 1,200 strongest partners. It retains 1,585
  neurons and 76,027 edges, including 308 direct looming→GF edges.
- `build_full.py`: selects **all 166,700 non-null-superclass neurons** from the
  annotation file, including cells without a type or soma. The compact set is
  the prefix; the remainder is ranked by weighted degree. The ≥3-contact floor
  retains 10,520,431 directed edges. This is the full neuron set with pruned
  connectivity, not the unfiltered edge table.
- 139,662 of those neurons have measured somata. Flag bit 16 means missing
  position: the record remains in simulation and is excluded from the point
  index. Zero placeholders in those records are not rendered as anatomy.
- The 90 public ROI surfaces use Neuroglancer's legacy mesh format. Vertex
  clustering at 4096 nm reduces the raw 139 MB to about 6.3 MB. Source positions
  are nm; divide by 8 before applying the shared soma/SWC transform. Six SWCs
  provide detailed GF/LC4/LPLC2 arbors. These are neuropil boundaries, not an
  invented tissue shell or a hull of the fixture.
- Sources and transforms are recorded with hashes; `stamp_assets.py` creates
  the browser content manifest. Re-run it whenever any shipped asset changes.
  IndexedDB cache keys include its version, and loaded bytes must match hashes.
- Neural input: LC4/LPLC2 looming. Other legacy sensory channels are present as
  readouts of the sensing code but their input-role lists are empty until a
  validated real mapping exists. The UI states this limitation.
- Current sign hypothesis: ACh positive, GABA/Glu negative; unresolved or
  modulatory sources have zero direct current. Raw contacts remain in source
  data; quantized graph weights reflect the declared sign/current hypothesis.

`yarn data:verify` exercises the actual full graph through optimized WASM:
looming stimulation, GF silencing, removal of looming-cell outgoing edges,
full-depth propagation and deterministic replay. `pipeline/tests/test_real_assets.py`
checks identity, CSR ranges, missing-coordinate flags and region geometry using
only the prepared assets; it needs no network or pandas.

Plan 03 extensions: build_extensions.py adds native sensory identities and 24
SWC arbors. fetch_regions.py reads only selected Arrow columns from the public
neuPrint neuron table, retaining pre/post ROI membership for shipped IDs. The
prepared membership is cached against the cell-order hash. Both run before
stamp_assets.py in data:build. Browser data tests validate indices, counts and
skeleton identity without downloading raw tables.
