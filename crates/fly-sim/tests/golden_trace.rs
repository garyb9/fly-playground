//! Locks determinism: a fixed script over the committed fixture must always
//! produce the same trace hash. Regenerate intentionally with `BLESS=1`.
mod fixtures;

use fixtures::*;
use fly_sim::core::format::{GraphFile, NeuronsFile};
use fly_sim::core::sim::{SimConfig, SimCore};

fn fnv1a64(bytes: &[u8]) -> u64 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for &b in bytes {
        h ^= b as u64;
        h = h.wrapping_mul(0x0000_0100_0000_01B3);
    }
    h
}

fn run_trace() -> String {
    let nf = NeuronsFile::parse(&neurons_bytes()).unwrap();
    let gf = GraphFile::parse(&graph_bytes()).unwrap();
    // `SimConfig { seed, ..default() }` rather than a post-construction
    // `cfg.seed = ...` to satisfy `clippy::field_reassign_with_default`
    // (-D warnings); behaviourally identical.
    let cfg = SimConfig {
        seed: FIXTURE_SEED,
        ..SimConfig::default()
    };
    let mut s = SimCore::new(&nf, &gf, cfg);

    let mut roles = std::collections::BTreeMap::new();
    for (name, ids) in fixture_input_roles() {
        roles.insert(name, s.define_input_role(name, &ids));
    }
    let escape = s.define_readout_role("escape", &(24u32..32).collect::<Vec<_>>());
    let wing_l = s.define_readout_role("wing_l", &(32u32..36).collect::<Vec<_>>());

    s.set_active_count(200);

    let mut samples: Vec<f32> = Vec::new();
    for t in 0..2000u32 {
        if (200..1000).contains(&t) {
            s.inject(roles["looming"], 1.5); // looming ramp window
        }
        if (1200..1400).contains(&t) {
            s.inject(roles["light_l"], 1.2);
        }
        s.step(1);
        if t % 100 == 0 {
            samples.push(s.readout(escape));
            samples.push(s.readout(wing_l));
        }
    }

    let mut bytes = Vec::with_capacity(samples.len() * 4);
    for v in samples {
        // quantise to 1e-4 so trivial float noise across platforms doesn't churn the hash
        bytes.extend(((v * 10_000.0).round() as i32).to_le_bytes());
    }
    format!("{:016x}", fnv1a64(&bytes))
}

#[test]
fn golden_trace_is_stable() {
    let got = run_trace();
    let expected_path = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/golden_trace.expected");
    if std::env::var("BLESS").is_ok() {
        std::fs::write(expected_path, format!("{got}\n")).unwrap();
        return;
    }
    let want = std::fs::read_to_string(expected_path)
        .expect("no golden_trace.expected — run once with BLESS=1")
        .trim()
        .to_string();
    assert_eq!(
        got, want,
        "trace changed; if intentional re-run with BLESS=1"
    );
}

#[test]
fn trace_is_reproducible_within_a_run() {
    assert_eq!(run_trace(), run_trace());
}
