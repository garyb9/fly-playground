# Neuron model, graph format, determinism

All of this lives in the Rust crate `crates/fly-sim`. The crate has no DOM and no
Three.js dependency — it is pure compute compiled to WASM.

## 1. Leaky integrate-and-fire (LIF), discrete fixed-step

We use the simplest standard spiking model (EPFL *Neuronal Dynamics* Ch. 1.3),
discretised to a fixed tick `Δt`. Each neuron `i` holds a membrane potential
`v[i]`, a spike flag `spike[i]`, and a refractory countdown `refrac[i]`.

### Continuous form (reference)

The leaky integrator:

```
τ_m · dv/dt = −(v − v_rest) + R · I(t)
```

with the fire-and-reset rule: when `v` reaches `v_th`, emit a spike and clamp
`v ← v_reset` for a refractory period `t_ref`.

### Discrete update (what the code runs)

Per tick, we work in normalised units (`v_rest = 0`, `R = 1`) and fold `τ_m` and
`Δt` into a single per-tick **leak factor**:

```
leak = exp(−Δt / τ_m)              # precomputed once, 0 < leak < 1
```

For every **active** neuron `i` (index `< active_count`, see §3):

```
# 1. integrate
v[i] = leak · v[i] + input[i] + bias[i]

# 2. fire / reset
if refrac[i] == 0 and v[i] >= v_th:
    spike[i]  = 1
    v[i]      = v_reset
    refrac[i] = refrac_ticks
    for (t, w) in graph.row(i):
        input_next[t] += w · sign[i]        # sign[i] ∈ {+1, −1}
else:
    spike[i]  = 0

# 3. decay refractory
if refrac[i] > 0:
    refrac[i] -= 1
```

`input` is **double-buffered**: the current tick reads `input[]` (this tick's
accumulated synaptic drive plus injected sensory drive), writes spikes into
`input_next[]`, then the buffers swap and `input_next` is zeroed. This makes the
update order-independent within a tick.

### Default parameters (config, tunable at runtime)

| Symbol | Field | Default | Meaning |
| --- | --- | --- | --- |
| `Δt` | `dt_ms` | `5.0` ms | tick length → 200 Hz sim |
| `τ_m` | `tau_m_ms` | `20.0` ms | membrane time constant → `leak ≈ 0.779` |
| `v_th` | `v_threshold` | `1.0` | firing threshold (normalised) |
| `v_reset` | `v_reset` | `0.0` | post-spike potential |
| `t_ref` | `refrac_ms` | `2.0` ms | → `refrac_ticks = 1` (rounded) |
| `bias` | `bias[i]` | `0.0` | tonic drive; small positive on a few core neurons for spontaneous activity |
| — | `noise_sigma` | `0.02` | per-tick Gaussian added to `input[i]` (seeded RNG) |

### Synaptic weight scaling

Raw MaleCNS edge weights are synapse counts (roughly 1–1000+). The pipeline
rescales them so that a plausible number of coincident presynaptic spikes brings
a postsynaptic neuron to threshold:

```
w_sim = w_raw / W_NORM        # W_NORM chosen in pipeline, ~= median in-degree-weighted value
```

`w_sim` is quantised for storage (see §2) and de-quantised on load.

## 2. Connectome storage — CSR sparse graph

### `neurons.bin`

Header (`manifest.json` carries the authoritative counts; header is a
cross-check):

```
magic      u32   "FLYN" = 0x4E594C46
version    u32
count      u32   number of neurons N
core_count u32   neurons [0, core_count) are the behavioural core
```

Then `count` records, **sorted**: core neurons first (in a fixed curated order),
then non-core neurons by descending importance rank:

```
id        u64   MaleCNS body id (for debugging / neuPrint cross-ref)
pos_x     f32   scaled world coordinates (~1 unit = whole brain)
pos_y     f32
pos_z     f32
group_id  u16   index into groups.json "groups"
flags     u8    bit0 = core, bit1 = inhibitory (sign = −1), bit2 = sensory-input, bit3 = motor-readout
_pad      u8
```

### `graph.bin` — CSR, rows aligned to `neurons.bin` order

```
magic     u32   "FLYG" = 0x47594C46
version   u32
n_nodes   u32   == neurons.bin count
n_edges   u64
w_norm    f32   dequant scale: w_sim = w_q * w_norm
offsets   u32[n_nodes + 1]      # row i is targets[offsets[i] .. offsets[i+1]]
targets   u32[n_edges]          # postsynaptic neuron index (into neurons.bin order)
weights   i16[n_edges]          # quantised; w_sim = weights * w_norm
```

Edges are pruned in the pipeline: below a confidence threshold
(`minconf-0.5` source already applied) and below a weight floor, dropped. Target
survivor count ≈ 15–25 M edges. Rows are truncated to `active_count` lazily —
edges whose *target* index ≥ `active_count` are simply skipped during traversal
(cheap branch), so no re-indexing is needed when the slider moves.

### `groups.json`

```jsonc
{
  "scale_factor": 1.0e-6,           // multiply raw 8nm coords by this for world space
  "groups": ["ME(R)", "LO(R)", "GNG", "descending", "wing_motor", ...],
  "roles": {
    "input": {
      "looming":   [12, 13, 14, ...],   // neuron indices (neurons.bin order)
      "light_l":   [...],
      "light_r":   [...],
      "proximity": [...],
      "wind_l":    [...],
      "wind_r":    [...]
    },
    "readout": {
      "wing_l":     [...],
      "wing_r":     [...],
      "thrust":     [...],
      "yaw_torque": [...],
      "escape":     [...]              // giant-fiber / TTMn-adjacent
    }
  }
}
```

Role neuron lists are produced by `pipeline/core_circuit.py` from published
MaleCNS / FlyWire type names (see §5 risks in the design doc).

## 3. The neuron-count slider

`Sim::set_active_count(n)` clamps `n` to `[core_count, N]`. The step loop iterates
neurons `0 .. n`. Core neurons are always in range. Because edge traversal skips
targets `≥ n`, raising or lowering the slider is O(1) — no reallocation, no
re-sort. Membrane state of newly-deactivated neurons is left as-is (frozen) and
resumes if they are re-activated; optionally `set_active_count` can zero the
newly-excluded range (config `freeze_inactive`, default `true` = freeze).

## 4. Excitatory / inhibitory sign

The MaleCNS release includes per-tbar neurotransmitter predictions
(`tbar-neurotransmitters…feather`, `body-neurotransmitters…feather`). The
pipeline aggregates to one dominant transmitter per neuron and maps:

| Predicted transmitter | `sign` |
| --- | --- |
| acetylcholine | `+1` (excitatory) |
| glutamate | `−1` (inhibitory — *Drosophila* GluClα heuristic) |
| GABA | `−1` (inhibitory) |
| dopamine / serotonin / octopamine / tyramine | `+1` (modulatory, approximated as weak excitatory) |
| unknown / low-confidence | `+1` (default) |

This is a **known approximation**. Dale's principle is assumed (one sign per
neuron). Documented as a limitation.

## 5. Determinism

- Fixed `Δt`, fixed integer tick counter.
- All randomness (`noise_sigma`, spontaneous drive) comes from a single seeded
  PRNG (`SplitMix64` / `rand_pcg`), seed in config.
- Double-buffered `input` removes intra-tick order dependence.
- Given the same asset files, same config, same seed, and the same sequence of
  `inject()` calls, `step()` produces a bit-identical `activity_snapshot()`
  trace.

This is verified by `crates/fly-sim/tests/golden_trace.rs`: a small fixed
synthetic graph, a scripted input sequence, and a checked-in expected trace.

## 6. Motor readout

`Sim::readout(role_id) -> f32` returns a smoothed firing rate for a readout
group: the fraction of that group's neurons that spiked in the last `K` ticks
(exponential moving average, `K` from config). The shell maps these to flight
forces — see `docs/architecture.md` and the design doc §3a.
