pub mod core;

use wasm_bindgen::prelude::*;

use crate::core::format::{GraphFile, NeuronsFile};
use crate::core::lif::LifParams;
use crate::core::sim::{SimConfig, SimCore};

#[wasm_bindgen]
pub fn sim_abi_version() -> u32 {
    1
}

#[wasm_bindgen]
pub struct Sim {
    inner: SimCore,
}

#[wasm_bindgen]
impl Sim {
    #[wasm_bindgen(constructor)]
    pub fn new(neurons: &[u8], graph: &[u8], seed: u64) -> Result<Sim, JsError> {
        let nf = NeuronsFile::parse(neurons)
            .map_err(|e| JsError::new(&format!("neurons.bin: {e:?}")))?;
        let gf = GraphFile::parse(graph).map_err(|e| JsError::new(&format!("graph.bin: {e:?}")))?;
        if nf.count() != gf.n_nodes {
            return Err(JsError::new("neuron/graph node count mismatch"));
        }
        // `SimConfig { seed, ..default() }` rather than `let mut cfg = ...;
        // cfg.seed = seed;` to satisfy `clippy::field_reassign_with_default`
        // (-D warnings); same house style as `core::sim`'s tests.
        let cfg = SimConfig {
            seed,
            ..SimConfig::default()
        };
        Ok(Sim {
            inner: SimCore::new(&nf, &gf, cfg),
        })
    }

    pub fn set_active_count(&mut self, n: u32) {
        self.inner.set_active_count(n as usize);
    }

    pub fn active_count(&self) -> u32 {
        self.inner.active_count() as u32
    }

    pub fn set_params(
        &mut self,
        dt_ms: f32,
        tau_m_ms: f32,
        v_threshold: f32,
        v_reset: f32,
        refrac_ms: f32,
        noise_sigma: f32,
    ) {
        // `dt_ms` is folded into `leak`/`refrac_ticks` by `from_ms`; also store
        // it verbatim so `dt_ms()` can cross-check the fixed-tick constraint.
        self.inner.set_dt_ms(dt_ms);
        self.inner.set_params(LifParams::from_ms(
            dt_ms,
            tau_m_ms,
            v_threshold,
            v_reset,
            refrac_ms,
            noise_sigma,
        ));
    }

    pub fn dt_ms(&self) -> f32 {
        self.inner.dt_ms()
    }

    pub fn define_input_role(&mut self, name: &str, neurons: &[u32]) -> u32 {
        self.inner.define_input_role(name, neurons)
    }
    pub fn define_readout_role(&mut self, name: &str, neurons: &[u32]) -> u32 {
        self.inner.define_readout_role(name, neurons)
    }
    pub fn inject(&mut self, role_id: u32, value: f32) {
        self.inner.inject(role_id, value);
    }
    pub fn step(&mut self, ticks: u32) {
        self.inner.step(ticks);
    }
    pub fn inject_cells(&mut self, ids: &[u32], value: f32) {
        self.inner.inject_cells(ids, value);
    }
    pub fn set_bias(&mut self, ids: &[u32], value: f32) {
        self.inner.set_bias(ids, value);
    }
    pub fn silence_cells(&mut self, ids: &[u32], value: bool) {
        self.inner.silence_cells(ids, value);
    }
    pub fn clear_interventions(&mut self) {
        self.inner.clear_interventions();
    }
    pub fn reset(&mut self, seed: u64) {
        self.inner.reset(seed);
    }
    pub fn readout(&self, role_id: u32) -> f32 {
        self.inner.readout(role_id)
    }
    pub fn activity_snapshot(&self) -> Vec<f32> {
        self.inner.activity_snapshot()
    }
    pub fn neuron_count(&self) -> u32 {
        self.inner.neuron_count() as u32
    }
    pub fn core_count(&self) -> u32 {
        self.inner.core_count() as u32
    }
}

#[cfg(test)]
mod tests {
    use super::Sim;

    fn fixture_bytes(name: &str) -> Vec<u8> {
        std::fs::read(format!(
            "{}/../../pipeline/out/fixture/{}",
            env!("CARGO_MANIFEST_DIR"),
            name
        ))
        .expect("run `python pipeline/gen_fixture.py` first")
    }

    #[test]
    fn abi_version_is_one() {
        assert_eq!(super::sim_abi_version(), 1);
    }

    #[test]
    fn set_params_stores_dt_ms_and_active_count_round_trips() {
        let nb = fixture_bytes("neurons.bin");
        let gb = fixture_bytes("graph.bin");
        let mut s = Sim::new(&nb, &gb, 42).expect("fixture parses");
        assert_eq!(s.dt_ms(), 5.0, "default dt_ms");
        s.set_params(10.0, 20.0, 1.0, 0.0, 2.0, 0.02);
        assert_eq!(s.dt_ms(), 10.0, "set_params records dt_ms");
        s.set_active_count(120);
        assert_eq!(s.active_count(), 120, "active_count reads back the slider");
    }
}
