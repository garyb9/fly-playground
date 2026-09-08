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

    pub fn set_params(
        &mut self,
        dt_ms: f32,
        tau_m_ms: f32,
        v_threshold: f32,
        v_reset: f32,
        refrac_ms: f32,
        noise_sigma: f32,
    ) {
        self.inner.set_params(LifParams::from_ms(
            dt_ms,
            tau_m_ms,
            v_threshold,
            v_reset,
            refrac_ms,
            noise_sigma,
        ));
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
    #[test]
    fn abi_version_is_one() {
        assert_eq!(super::sim_abi_version(), 1);
    }
}
