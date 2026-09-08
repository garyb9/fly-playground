//! `SimCore` — the simulation heart. Owns all neural state and steps a LIF
//! network over the CSR graph: double-buffered synaptic input, per-neuron
//! excitatory/inhibitory sign, an EMA activity trace, and the `active_count`
//! slider (edges to targets `>= active_count` are skipped during traversal).
//! Private to the crate until the wasm wrapper task, so dead code is allowed.
#![allow(dead_code)]

use crate::core::format::{GraphFile, NeuronsFile};
use crate::core::lif::{integrate_one, LifParams, LifState};
use crate::core::rng::SplitMix64;

#[derive(Clone, Copy, Debug)]
pub struct SimConfig {
    pub params: LifParams,
    pub seed: u64,
    pub activity_tau_ticks: f32,
}

impl Default for SimConfig {
    fn default() -> Self {
        Self {
            params: LifParams::default(),
            seed: 0x0DDB_1A5E,
            activity_tau_ticks: 40.0,
        }
    }
}

pub struct SimCore {
    n: usize,
    core_count: usize,
    active: usize,
    params: LifParams,
    activity_tau: f32,
    rng: SplitMix64,

    // CSR (owned copies from GraphFile)
    offsets: Vec<u32>,
    targets: Vec<u32>,
    weights_sim: Vec<f32>, // pre-multiplied by w_norm

    sign: Vec<f32>, // +1.0 or -1.0 per neuron
    bias: Vec<f32>, // tonic drive per neuron (0 for now)

    state: LifState,
    input_cur: Vec<f32>,
    input_next: Vec<f32>,
    activity: Vec<f32>,
}

impl SimCore {
    pub fn new(neurons: &NeuronsFile, graph: &GraphFile, cfg: SimConfig) -> Self {
        assert_eq!(
            neurons.count(),
            graph.n_nodes,
            "neuron/graph node count mismatch"
        );
        let n = neurons.count();
        let sign: Vec<f32> = (0..n)
            .map(|i| if neurons.is_inhibitory(i) { -1.0 } else { 1.0 })
            .collect();
        let weights_sim: Vec<f32> = graph
            .weights
            .iter()
            .map(|&w| w as f32 * graph.w_norm)
            .collect();
        Self {
            n,
            core_count: neurons.core_count as usize,
            active: n,
            params: cfg.params,
            activity_tau: cfg.activity_tau_ticks.max(1.0),
            rng: SplitMix64::new(cfg.seed),
            offsets: graph.offsets.clone(),
            targets: graph.targets.clone(),
            weights_sim,
            sign,
            bias: vec![0.0; n],
            state: LifState::new(n),
            input_cur: vec![0.0; n],
            input_next: vec![0.0; n],
            activity: vec![0.0; n],
        }
    }

    pub fn neuron_count(&self) -> usize {
        self.n
    }
    pub fn core_count(&self) -> usize {
        self.core_count
    }
    pub fn active_count(&self) -> usize {
        self.active
    }
    pub fn set_params(&mut self, p: LifParams) {
        self.params = p;
    }
    pub fn set_active_count(&mut self, n: usize) {
        self.active = n.clamp(self.core_count, self.n);
    }
    pub fn add_input(&mut self, i: usize, amount: f32) {
        if i < self.n {
            self.input_cur[i] += amount;
        }
    }
    pub fn activity(&self) -> &[f32] {
        &self.activity
    }
    pub fn spikes(&self) -> &[u8] {
        &self.state.spike
    }

    #[cfg(test)]
    pub fn debug_v(&self, i: usize) -> f32 {
        self.state.v[i]
    }

    pub fn step(&mut self, ticks: u32) {
        let inv_tau = 1.0 / self.activity_tau;
        for _ in 0..ticks {
            for i in 0..self.active {
                let noise = if self.params.noise_sigma > 0.0 {
                    self.rng.next_gaussian() * self.params.noise_sigma
                } else {
                    0.0
                };
                let input = self.input_cur[i] + self.bias[i] + noise;
                let (v_new, fired, refrac_new) =
                    integrate_one(self.state.v[i], self.state.refrac[i], input, &self.params);
                self.state.v[i] = v_new;
                self.state.refrac[i] = refrac_new;
                self.state.spike[i] = fired as u8;

                if fired {
                    let s = self.offsets[i] as usize;
                    let e = self.offsets[i + 1] as usize;
                    let sgn = self.sign[i];
                    for k in s..e {
                        let t = self.targets[k] as usize;
                        if t < self.active {
                            self.input_next[t] += self.weights_sim[k] * sgn;
                        }
                    }
                }
            }
            // activity EMA over ALL neurons (inactive ones decay toward 0)
            for i in 0..self.n {
                let sp = if i < self.active {
                    self.state.spike[i] as f32
                } else {
                    0.0
                };
                self.activity[i] += (sp - self.activity[i]) * inv_tau;
            }
            // swap buffers, clear next
            std::mem::swap(&mut self.input_cur, &mut self.input_next);
            for x in self.input_next.iter_mut() {
                *x = 0.0;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::format::{GraphFile, NeuronsFile};

    // Build a tiny hand-made pair of files: 3 neurons, edge 0->1 (+w), edge 0->2 (-w).
    fn tiny() -> (Vec<u8>, Vec<u8>) {
        // neurons.bin: count=3, core_count=1
        let mut n = Vec::new();
        n.extend(0x4E59_4C46u32.to_le_bytes());
        n.extend(1u32.to_le_bytes());
        n.extend(3u32.to_le_bytes());
        n.extend(1u32.to_le_bytes());
        for (idx, flags) in [
            (1u64, 0b0100u8 /*sensory-input, excitatory*/),
            (2, 0),
            (3, 0),
        ] {
            n.extend(idx.to_le_bytes());
            n.extend(0f32.to_le_bytes());
            n.extend(0f32.to_le_bytes());
            n.extend(0f32.to_le_bytes());
            n.extend(0u16.to_le_bytes());
            n.push(flags);
            n.push(0);
        }
        // graph.bin: n_nodes=3, edges: 0->1 w=+60, 0->2 w=-60 ; w_norm=0.01
        let mut g = Vec::new();
        g.extend(0x4759_4C46u32.to_le_bytes());
        g.extend(1u32.to_le_bytes());
        g.extend(3u32.to_le_bytes());
        g.extend(0u32.to_le_bytes());
        g.extend(2u64.to_le_bytes());
        g.extend(0.01f32.to_le_bytes());
        g.extend(0u32.to_le_bytes());
        for o in [0u32, 2, 2, 2] {
            g.extend(o.to_le_bytes());
        } // offsets[4]
        for t in [1u32, 2] {
            g.extend(t.to_le_bytes());
        }
        for w in [60i16, -60] {
            g.extend(w.to_le_bytes());
        }
        (n, g)
    }

    fn core_from(nb: &[u8], gb: &[u8], seed: u64) -> SimCore {
        let nf = NeuronsFile::parse(nb).unwrap();
        let gf = GraphFile::parse(gb).unwrap();
        // Same effect as `let mut cfg = SimConfig::default(); cfg.seed = seed;
        // cfg.params.noise_sigma = 0.0;` from the task brief, written as struct
        // literals to satisfy `clippy::field_reassign_with_default` (-D warnings).
        let cfg = SimConfig {
            seed,
            params: LifParams {
                noise_sigma: 0.0,
                ..LifParams::default()
            },
            ..SimConfig::default()
        };
        SimCore::new(&nf, &gf, cfg)
    }

    #[test]
    fn injected_input_makes_source_fire_then_propagates_with_sign() {
        let (nb, gb) = tiny();
        let mut s = core_from(&nb, &gb, 1);
        s.add_input(0, 2.0); // above threshold
        s.step(1); // tick A: neuron 0 fires, writes into next buffer
        assert_eq!(s.spikes()[0], 1);
        s.step(1); // tick B: neuron 1 gets +60*0.01, neuron 2 gets -60*0.01
                   // neuron 1 should have positive v, neuron 2 negative
        assert!(s.debug_v(1) > 0.0);
        assert!(s.debug_v(2) < 0.0);
    }

    #[test]
    fn active_count_gates_integration_and_edges() {
        let (nb, gb) = tiny();
        let mut s = core_from(&nb, &gb, 1);
        s.set_active_count(1); // only neuron 0 active (core_count is 1)
        s.add_input(0, 2.0);
        s.step(2);
        assert_eq!(
            s.debug_v(1),
            0.0,
            "edge into inactive neuron must be skipped"
        );
        assert_eq!(s.debug_v(2), 0.0);
    }

    #[test]
    fn set_active_count_clamps_to_core_min() {
        let (nb, gb) = tiny();
        let mut s = core_from(&nb, &gb, 1);
        s.set_active_count(0);
        assert_eq!(s.active_count(), 1); // == core_count
        s.set_active_count(999);
        assert_eq!(s.active_count(), 3);
    }

    #[test]
    fn deterministic_for_equal_seed_and_inputs() {
        let (nb, gb) = tiny();
        let run = |seed| {
            let mut s = core_from(&nb, &gb, seed);
            for t in 0..50 {
                if t % 7 == 0 {
                    s.add_input(0, 1.2);
                }
                s.step(1);
            }
            s.activity().to_vec()
        };
        assert_eq!(run(42), run(42));
    }

    #[test]
    #[should_panic]
    fn new_panics_on_node_count_mismatch() {
        let (nb, _gb) = tiny();
        let bad = _gb_with_nodes(4);
        let nf = NeuronsFile::parse(&nb).unwrap();
        let gf = GraphFile::parse(&bad).unwrap();
        SimCore::new(&nf, &gf, SimConfig::default());
    }

    fn _gb_with_nodes(n: u32) -> Vec<u8> {
        let mut g = Vec::new();
        g.extend(0x4759_4C46u32.to_le_bytes());
        g.extend(1u32.to_le_bytes());
        g.extend(n.to_le_bytes());
        g.extend(0u32.to_le_bytes());
        g.extend(0u64.to_le_bytes());
        g.extend(0.01f32.to_le_bytes());
        g.extend(0u32.to_le_bytes());
        for _ in 0..=n {
            g.extend(0u32.to_le_bytes());
        }
        g
    }
}
