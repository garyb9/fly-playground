# Datasets and prior art for RL / fine-tuning the simulated fly

Research date: 2026-09-13. Scope: web survey only (search engines, GitHub,
arXiv, institutional data repositories, X/Twitter). Nothing was downloaded,
integrated, or run against this repository. This is an inventory to start a
design from, not a design itself.

## What we want to achieve

Every behavior currently in this project is hand-authored: `src/body/wrench.ts`
converts named motor activities to forces with fixed gains, the looming/escape
assay stimulates a fixed set of cells and applies a fixed impulse, and the
opt-in Mi1/Tm3 and JO-E sensory encoders are engineered current proxies (see
`docs/2026-09-10-plan03-continuation.md` and
`docs/2026-09-10-connectome-action-research.md`). Validation so far is causal
(stimulate/silence/restore through the real connectome) but not comparative
against real fly behavior, and nothing in the loop is learned or optimized —
every gain and mapping was picked by hand.

`docs/2026-09-10-connectome-action-research.md` already names the two
highest-value gaps this could address:

1. Directional evasive steering (its #1 priority) needs either a learned
   mapping from spatial looming input to turn direction, or real kinematic
   data to calibrate a hand-built one.
2. Motion-based visual feedback (its #3 priority) needs a real optic-flow
   signal in place of the current brightness-increment placeholder.

This survey asks: are there existing datasets or trained environments that
let us either (a) train a small readout on top of the frozen connectome via
RL for a specific task, the way several community connectome projects
already do, or (b) calibrate/validate the existing hand-tuned encoders and
decoders against measured real-fly kinematics and behavior, instead of
against intuition alone? It does not recommend committing to either path —
it maps candidates to specific gaps so a later plan can pick one deliberately.

## Nearest architectural precedent

| Project | What it is | Relevance here |
| --- | --- | --- |
| [Whole-Brain Connectomic Graph Model Enables Whole-Body Locomotion Control in Fruit Fly](https://arxiv.org/abs/2602.17997) | Instantiates a full fly connectome (MaleCNS/FlyWire) as a graph-structured RL controller for a biomechanical fly body; reports stable gait initiation, walking, turning, and flight. | The closest published blueprint to what this project's architecture could grow into: connectome graph → RL-trained controller → embodied motion. Worth reading its action space, reward shaping, and training curriculum before designing any RL work here. |
| [TuragaLab/flybody](https://github.com/TuragaLab/flybody) ([mujoco_menagerie mirror](https://github.com/google-deepmind/mujoco_menagerie/tree/main/flybody)) | Anatomically detailed MuJoCo fruit-fly body (Google DeepMind + HHMI Janelia), with walking/flight RL task environments, wing aerodynamics, and tarsal adhesion. Apache-2.0. Reference kinematics/data on [Janelia Figshare](https://janelia.figshare.com/articles/dataset/MuJoCo_fruit_fly_body_model_datasets_supporting_Whole-body_simulation_of_realistic_fruit_fly_locomotion_with_deep_reinforcement_learning_/25309105), paper: [Vaxenburg et al., *Nature* 2025](https://www.nature.com/articles/s41586-025-09029-4). | A separately-trained, non-connectome body/RL environment. Not a drop-in replacement for `src/body/*` (different body model, different physics engine), but a source of RL task design and reference trajectories if `movement.ts`/`wrench.ts` ever move from hand-tuned gains toward a trained or imitation-calibrated decoder. |
| [cobanov/awesome-fly](https://github.com/cobanov/awesome-fly) | Curated list of community connectome-to-action projects: **fly-craftax** (PPO-trained descending-neuron readout on a frozen connectome playing Craftax), **Fly Dino** (243-parameter CEM-trained readout on an 80-neuron circuit, with silencing controls), Connectome Fighter, Fly Chess Lab, an embodied FlyWire + NeuroMechFly/MuJoCo repo. | These are small, readable examples of exactly the pattern this project would need: freeze the connectome, train a lightweight readout for one task, validate with silencing — same idea as the existing matched assay in `src/experiments/assay.ts`, but with a trained rather than hand-picked readout. Best starting point for prototyping RL on top of the existing sim before touching real datasets. |

## Datasets for calibration or imitation targets

| Dataset | What it provides | Maps to |
| --- | --- | --- |
| [DeepFly3D (NeLy-EPFL)](https://github.com/NeLy-EPFL/DeepFly3D) ([eLife paper](https://elifesciences.org/articles/48571)) | 7-camera 3D pose tracking of tethered adult *Drosophila*, 38 landmarks, real leg-joint kinematics including walking and grooming. | Directly relevant to `pipeline/build_leg_mappings.py`, which already exists but has no real kinematic reference to validate against. Lowest-effort candidate: compare or calibrate the shipped leg mapping's output angles against this data, no new pipeline stage required. |
| [Multifaceted and extensive behavioral trajectories of genomically diverse Drosophila lines (*Scientific Data*, 2025)](https://www.nature.com/articles/s41597-025-04724-3) | 30,000+ flies across 105 strains, including a 5-minute repeated-looming-stimulus fear/escape protocol, trajectories and strain metadata. | A real-animal baseline for the shipped looming/escape assay (`src/experiments/assay.ts`). Its own recorded numbers (e.g. peak escape 0.871, height-loss figures in `docs/2026-09-10-plan03-continuation.md`) are internally reproducible but have never been compared to measured escape latency/magnitude distributions — this dataset would let us make that comparison. |
| [FlyView (NeurIPS 2022 Datasets & Benchmarks)](https://proceedings.neurips.cc/paper_files/paper/2022/hash/b4005da5affc3ba527dcb992495ecd20-Abstract-Datasets_and_Benchmarks.html) | Bio-informed ground-truth optic flow for panoramic stereo vision, built for training insect-inspired visual networks. | Targets connectome-action-research.md priority #3 directly: the current Mi1/Tm3 encoder is a bounded brightness-increment proxy with "no retinal image, no OFF pathway" by its own documentation (`docs/2026-09-10-plan03-continuation.md`). This is real optic-flow ground truth to train or validate a successor encoder against. |
| [Dryad: sexual dimorphism in optic-flow sensorimotor transformation](https://datadryad.org/dataset/doi:10.5061/dryad.tb2rbp0fd) | Hoverfly wing-beat amplitude/steering, head angle, and fore/hind-leg movement measured against varying optic-flow stimuli. | Different species (hoverfly, not *Drosophila*) — useful only as a cross-check for multisensory (vision + wind) coupling shape, not as a direct calibration source. |
| [Fly v. Fly (Caltech Data / Eyjolfsdottir et al., ECCV 2014)](https://data.caltech.edu/records/zrznw-w7386) | 22 hours of annotated paired-fly video across three social contexts (boy-meets-boy, aggression, courtship), with pose trajectories. | Only relevant if the project pursues "richer social behaviors beyond looming," which `docs/2026-09-10-plan03-continuation.md` lists as open and not started. Not actionable until that scope is chosen. |

## X (Twitter)

X does not host structured datasets for this use case. The activity found
there ([@GoogleDeepMind](https://x.com/GoogleDeepMind/status/1915077101394260382),
[@mertcobanov](https://x.com/mertcobanov)) is commentary and links pointing
back to the same GitHub repos and papers listed above (MaleCNS release
coverage, community connectome-to-game projects). No dataset unique to X was
found.

## Kaggle

General insect datasets exist (species-classification image sets, a
`drosophila_larva_chemotaxis` notebook) but nothing matching MaleCNS,
adult-fly kinematics, or connectome-driven behavior. Kaggle was not a
productive source for this project's specific gaps; the useful material sits
on GitHub, arXiv, and institutional repositories (Figshare, Dryad, Caltech
Data, Zenodo) instead.

## Suggested entry points, ranked by effort

1. **DeepFly3D → validate `build_leg_mappings.py`.** No new architecture,
   just a comparison against real kinematics. Lowest effort, no RL involved.
2. **Scientific Data looming dataset → validate the escape assay's numbers.**
   Also no code change required — a comparison write-up against
   `docs/2026-09-10-plan03-continuation.md`'s recorded escape figures.
3. **awesome-fly's fly-craftax/Fly Dino pattern → prototype a trained readout.**
   Reuses the existing frozen-connectome + matched-assay infrastructure in
   `src/experiments/assay.ts`; the new work is a small trainable readout and
   a training loop (PPO or CEM), not a new simulator. Directly serves
   connectome-action-research.md priority #1 (directional evasive steering).
   Read the connectomic-graph-model paper first for reward/action-space design.
4. **FlyView / Dryad → replace the Mi1/Tm3 placeholder encoder.** Only makes
   sense after (3) gives a task to optimize the encoder against; doing it in
   isolation risks fitting to ground-truth optic flow with no way to validate
   it changes fly behavior usefully.

## Caveats

- Nothing here has been implemented, downloaded, or format-checked against
  this project's assets.
- Licenses were not individually verified beyond what search results stated
  (flybody: Apache-2.0). Check each dataset's license before any integration
  or redistribution.
- FlyWire (used by the connectomic-graph-model paper) is a separate *female*
  fly connectome with its own ID space; it is not interchangeable with the
  MaleCNS assets this project ships without an explicit mapping step.
- Species mismatches (e.g. the Dryad hoverfly dataset) limit some sources to
  qualitative cross-checks rather than direct calibration.
