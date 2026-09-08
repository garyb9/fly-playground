# Architecture

```
                          main thread (60 fps)                    worker thread (200 Hz sim)
 ┌──────────────────────────────────────────────────┐      ┌─────────────────────────────────┐
 │  main.ts  — orchestrator, RAF loop               │      │  sim.worker.ts                   │
 │    ├─ sensing/   pose → scalar stimuli           │      │    └─ fly-sim (WASM)             │
 │    ├─ body/      readouts → 6DOF forces → pose    │◄────►│         Sim::step() loop        │
 │    ├─ world/     scene, objects, lights, walls    │ ring │         LIF over CSR graph      │
 │    ├─ brainviz/  Points + core LineSegments       │ buf  │                                 │
 │    ├─ audio/     ambient bed + reactive one-shots │      │  owns: v[], spike[], refrac[],  │
 │    └─ ui/        slider, camera, meters, audio    │      │        input double-buffer      │
 └──────────────────────────────────────────────────┘      └─────────────────────────────────┘
                         │                                              │
                         └───────── assets: neurons.bin, graph.bin, groups.json, manifest.json
```

## Threads

- **Main thread** runs `requestAnimationFrame`. Each frame: compute sensory
  scalars from the fly's pose, write them to the shared input region; read the
  latest motor readouts + activity snapshot from the shared output region;
  advance the fly's rigid body by real `dt`; update Three.js.
- **Worker** runs its own `setInterval`/timer at 200 Hz (accumulator pattern so
  it catches up or drops ticks rather than drifting). Each sim tick: pull
  injected stimuli from the shared input region, `Sim::step(1)`, publish
  readouts + a decimated activity snapshot to the shared output region.
- The two never block each other. A slow sim (slider cranked up) just lowers the
  effective tick rate; rendering stays at 60 fps and the fly moves more
  sluggishly / reflexively.

## Shared state — ring buffer

Preferred: one `SharedArrayBuffer` viewed as `Float32Array` + `Int32Array`,
lock-free, single-producer / single-consumer per region:

```
[ control  Int32Array ]  seq counters, active_count, sim_hz, paused
[ input    Float32Array ] one slot per sensory role (looming, light_l, ...)
[ output   Float32Array ] one slot per motor role + [activity: Float32Array(n_snapshot)]
```

Writers bump a seq counter before and after writing; readers retry on a torn
read. `activity` is decimated (e.g. every Kth neuron, or per-group means at high
slider settings) so the snapshot stays a few KB.

**Fallback** when `SharedArrayBuffer` is unavailable (no COOP/COEP headers on the
host): `postMessage` with transferable `ArrayBuffer`s, one round trip per render
frame. `protocol.ts` abstracts both behind the same `SimBridge` interface; the
app picks the implementation at boot based on `crossOriginIsolated`.

## Worker protocol (`worker/protocol.ts`)

| Message → worker | Payload |
| --- | --- |
| `init` | asset buffers (transferred), config |
| `set_active_count` | `n` |
| `set_params` | partial LIF config (live tuning from a debug panel) |
| `pause` / `resume` | — |
| `reset` | reseed, zero state |

| Message ← worker | Payload |
| --- | --- |
| `ready` | `{ n_neurons, core_count }` |
| `tick_stats` | `{ sim_hz, tick }` (throttled, ~4/s) |

Per-frame stimulus/readout traffic goes through the ring buffer, **not**
messages.

## Modules (main thread)

### `body/`
6DOF rigid body: `position: Vec3`, `orientation: Quat`, `vel: Vec3`,
`angVel: Vec3`. Per frame maps readouts → wrench:

- `wing_l`, `wing_r` → symmetric part = thrust along body-forward + lift along
  body-up (lift tuned so `wing ≈ hover_level` cancels gravity → **hovering is
  neutral**); asymmetric part = roll torque + yaw torque.
- `thrust`, `yaw_torque` → direct trims on axial force / yaw torque.
- `escape` crossing `ESCAPE_TH` → one impulse (`ESCAPE_IMPULSE` along
  body-up+forward) and a short `controlLockout` during which readouts are
  ignored — models the giant-fiber takeoff jump.
- Linear + angular drag every frame for stability; low-frequency Perlin noise on
  the readouts for lifelike jitter.
- Collision: sphere vs world AABBs; hard contact writes a spike into the
  `proximity` stimulus (startle) and applies a restitution impulse.

### `world/`
`scene.config.ts` defines everything: bounds (soft walls that push back),
ground plane, an array of primitive objects (`box | sphere | torus`, each with
transform + material), and 2–3 point lights (position, colour, intensity) that
are *also* the light stimuli. Adding an object = one array entry.

### `sensing/`
Pure functions `pose + world → stimulus scalars`, each smoothed (one-pole) and
scaled to a firing-rate-ish range before injection:

- `proximity` — `1 / min(raycast distance along ±forward, ±up, ±right)`.
- `looming` — `d(θ)/dt` where `θ` is the angular diameter of the nearest object
  in the forward 60° cone (positive = approaching). Drives `escape`.
- `light_l`, `light_r` — per-eye `Σ intensity · max(0, eyeDir · toLight)` for a
  left / right steering gradient (phototaxis).
- `wind_l`, `wind_r` — optional slow vector field projected onto each antenna.

### `brainviz/`
- `THREE.Points`, one vertex per loaded neuron, positions from `neurons.bin`.
  Per-vertex colour updated each frame from the activity snapshot (dark → hot).
  Core neurons get a larger point size (per-vertex attribute).
- Core edges (`≤ a few thousand`) as `THREE.LineSegments`, low opacity, so the
  loom → GF → motor pathway visibly lights up.
- Camera modes: **follow** (chase cam on the fly; brain rendered in a docked
  corner panel by default, or co-located with the fly via a config flag) and
  **brain** (OrbitControls through the connectome; fly shown as a moving marker).
  Toggle key.

### `audio/`
Web Audio graph: an ambient bed (looped sample *or* 2–3 detuned oscillators
through a lowpass) + reactive one-shots — escape blip, wingbeat hum whose
frequency tracks `(wing_l + wing_r)`. Master gain + mute from the HUD. Starts
muted until first user gesture (autoplay policy).

### `ui/`
DOM overlay: neuron-count slider (log scale, `core_count … N`, shows live
`sim_hz`), region/class filter checkboxes (stretch — toggles groups within the
active range), camera toggle, audio controls, readout meters
(thrust / yaw / escape) and sensory meters (proximity / looming / light L·R).

## Boot sequence

1. `main.ts` fetches `manifest.json`, checks IndexedDB cache for
   `neurons.bin` / `graph.bin` at that version, downloads if missing.
2. Spawn worker, `init` with transferred buffers + config.
3. On `ready`, build `brainviz` point cloud, build `world`, start RAF loop and
   the audio context (deferred to first gesture).
4. Slider starts at `core_count` (instant, real-time). User drags up as desired.
