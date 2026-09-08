# fly-playground — Plan 01: Foundations + Sim Core

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the repo toolchain and build a tested, deterministic Rust→WASM leaky-integrate-and-fire simulation that steps a committed synthetic connectome fixture and exposes inject / readout / snapshot.

**Architecture:** A Cargo crate `crates/fly-sim` splits into a pure-Rust `SimCore` (natively `cargo test`-able — LIF math, CSR graph propagation, roles) and a thin `#[wasm_bindgen] Sim` wrapper that only delegates. A standalone Python script `pipeline/gen_fixture.py` is the *only* encoder in this plan; Rust and TypeScript both get read-only decoders verified against the same committed fixture bytes. Determinism (fixed tick, seeded PRNG, double-buffered synaptic input) is locked by a golden-trace test.

**Tech Stack:** Rust (edition 2021) + `wasm-bindgen` + `wasm-pack`; Vite + TypeScript + Vitest; Python 3.11 + numpy (fixture generator, dev-only); GitHub Actions CI.

**Spec:** `docs/2026-09-09-design.md` (see also `docs/neuron-model.md`, `docs/architecture.md`, `docs/data-pipeline.md`).

## Global Constraints

- **Endianness:** all binary files are little-endian. Floats are IEEE-754 `f32` unless stated.
- **Determinism:** identical asset bytes + identical `SimConfig` + identical seed + identical `inject()` call sequence ⇒ bit-identical `activity_snapshot()` trace. No wall-clock, no unseeded RNG, no `HashMap` iteration order in the step path (use `Vec` / `BTreeMap`).
- **No JSON in the wasm crate.** `crates/fly-sim` must not depend on `serde`/`serde_json`. Role definitions enter `SimCore` as explicit `(name, &[u32])` calls from the caller (JS in Plan 2, Rust test code here). `groups.json` is parsed only on the TS side.
- **`SimCore` is target-independent.** Everything under `crates/fly-sim/src/core/` compiles and tests on the host target with plain `cargo test`. Only `crates/fly-sim/src/lib.rs` carries `#[wasm_bindgen]`.
- **Fixed sim tick:** default `dt_ms = 5.0` ⇒ 200 Hz. `step(ticks)` advances whole ticks only.
- **Fixture contract (authoritative — Rust and TS tests hardcode these):**
  - `FIXTURE_N_NEURONS = 500`, `FIXTURE_CORE_COUNT = 48`, `FIXTURE_SEED = 42`.
  - Input role neuron index ranges (half-open): `looming = 0..8`, `light_l = 8..12`, `light_r = 12..16`, `proximity = 16..20`, `wind_l = 20..22`, `wind_r = 22..24`.
  - Readout role neuron index ranges: `escape = 24..32`, `wing_l = 32..36`, `wing_r = 36..40`, `thrust = 40..44`, `yaw_torque = 44..48`.
  - The fixture graph wires every `looming` neuron onto every `escape` neuron with a strong positive weight, so a sustained `inject("looming", …)` drives `readout("escape")` above `0.5` within 400 ticks.
  - The fixture generator writes **no timestamp** into `manifest.json` (byte-reproducible output).
- **TDD:** every task is failing-test → run-and-see-it-fail → minimal impl → run-and-see-it-pass → commit. Commit at the end of every task at minimum.
- **Commit messages:** Conventional Commits (`feat:`, `test:`, `chore:`, `ci:`). End every commit body with:

  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01WWFyPyecfodagnpH1T5E9y
  ```

## Binary formats (as implemented by this plan)

Supersedes the header padding sketched in `docs/neuron-model.md` §2 — update that doc to match when Task 3 lands.

### `neurons.bin` — 16-byte header, then `count` × 24-byte records

| Off | Type | Field |
| --- | --- | --- |
| 0 | `u32` | magic `0x4E594C46` ("FLYN") |
| 4 | `u32` | version (`1`) |
| 8 | `u32` | `count` |
| 12 | `u32` | `core_count` |

Record (repeats `count` times, first record is neuron index 0):

| Off | Type | Field |
| --- | --- | --- |
| 0 | `u64` | `id` (MaleCNS body id; arbitrary but unique in the fixture) |
| 8 | `f32`×3 | `pos_x, pos_y, pos_z` (world-scaled) |
| 20 | `u16` | `group_id` |
| 22 | `u8` | `flags`: bit0 core, bit1 inhibitory, bit2 sensory-input, bit3 motor-readout |
| 23 | `u8` | padding (`0`) |

### `graph.bin` — 32-byte header, then three arrays

| Off | Type | Field |
| --- | --- | --- |
| 0 | `u32` | magic `0x47594C46` ("FLYG") |
| 4 | `u32` | version (`1`) |
| 8 | `u32` | `n_nodes` (== `neurons.bin` count) |
| 12 | `u32` | padding (`0`) |
| 16 | `u64` | `n_edges` |
| 24 | `f32` | `w_norm` (dequant scale: `w_sim = weight_i16 * w_norm`) |
| 28 | `u32` | padding (`0`) |

Then, contiguous: `offsets: u32[n_nodes + 1]`, `targets: u32[n_edges]`, `weights: i16[n_edges]`.
CSR: outgoing edges of neuron `i` are `targets[offsets[i] .. offsets[i+1]]` with matching `weights`. `offsets` is non-decreasing, `offsets[n_nodes] == n_edges`, every `target < n_nodes`.

### `groups.json` (parsed only by TS, Task 8)

```jsonc
{
  "scale_factor": 1.0,
  "groups": ["g0", "g1", "..."],
  "roles": {
    "input":   { "looming": [0,1,2,3,4,5,6,7], "light_l": [...], "light_r": [...], "proximity": [...], "wind_l": [...], "wind_r": [...] },
    "readout": { "escape": [...], "wing_l": [...], "wing_r": [...], "thrust": [...], "yaw_torque": [...] }
  }
}
```

### `manifest.json`

```jsonc
{ "version": 1, "dataset": "fixture", "n_neurons": 500, "core_count": 48, "n_edges": <int>, "w_norm": <float>, "scale_factor": 1.0 }
```

---

## Task 1: Repo scaffold + CI

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `index.html`, `.gitignore`, `.nvmrc`
- Create: `src/version.ts`, `src/version.test.ts`
- Create: `crates/fly-sim/Cargo.toml`, `crates/fly-sim/src/lib.rs`
- Create: `Cargo.toml` (workspace), `rust-toolchain.toml`
- Create: `.github/workflows/ci.yml`
- Create: `pipeline/pyproject.toml`

**Interfaces:**
- Consumes: nothing.
- Produces: a green multi-toolchain CI; `src/version.ts` exports `export const VERSION = "0.1.0";`; `crates/fly-sim` exports a `#[wasm_bindgen] pub fn sim_abi_version() -> u32 { 1 }`.

- [ ] **Step 1: Write the failing TS test**

`src/version.test.ts`:
```ts
import { expect, test } from "vitest";
import { VERSION } from "./version";

test("VERSION is semver-ish", () => {
  expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
});
```

- [ ] **Step 2: Scaffold the JS toolchain and run the test to see it fail**

`package.json`:
```json
{
  "name": "fly-playground",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  }
}
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "types": ["vitest/globals"],
    "lib": ["ES2022", "DOM", "DOM.Iterable", "WebWorker"]
  },
  "include": ["src"]
}
```

`vite.config.ts`:
```ts
import { defineConfig } from "vite";
export default defineConfig({ build: { target: "es2022" } });
```

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node" } });
```

`index.html`:
```html
<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>fly-playground</title></head>
  <body><div id="app">fly-playground — foundations</div><script type="module" src="/src/main.ts"></script></body>
</html>
```

`src/main.ts` (stub so `vite build` succeeds):
```ts
import { VERSION } from "./version";
document.getElementById("app")!.textContent = `fly-playground ${VERSION}`;
```

Run: `npm install && npx vitest run src/version.test.ts`
Expected: FAIL — `Cannot find module './version'`.

- [ ] **Step 3: Add the module**

`src/version.ts`:
```ts
export const VERSION = "0.1.0";
```

- [ ] **Step 4: Run TS test + typecheck + build**

Run: `npx vitest run && npx tsc --noEmit && npx vite build`
Expected: test PASS, typecheck clean, `dist/` produced.

- [ ] **Step 5: Scaffold the Rust workspace + crate**

`Cargo.toml` (workspace root):
```toml
[workspace]
members = ["crates/fly-sim"]
resolver = "2"
```

`rust-toolchain.toml`:
```toml
[toolchain]
channel = "stable"
targets = ["wasm32-unknown-unknown"]
```

`crates/fly-sim/Cargo.toml`:
```toml
[package]
name = "fly-sim"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib", "rlib"]

[dependencies]
wasm-bindgen = "0.2"

[dev-dependencies]
```

`crates/fly-sim/src/lib.rs`:
```rust
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn sim_abi_version() -> u32 {
    1
}

#[cfg(test)]
mod tests {
    #[test]
    fn abi_version_is_one() {
        assert_eq!(super::sim_abi_version(), 1);
    }
}
```

- [ ] **Step 6: Run Rust test + wasm build**

Run: `cargo test -p fly-sim && wasm-pack build crates/fly-sim --target web --dev`
Expected: 1 test PASS; `crates/fly-sim/pkg/` produced.

- [ ] **Step 7: `.gitignore`, python stub, CI**

`.gitignore`:
```
node_modules/
dist/
target/
crates/fly-sim/pkg/
pipeline/.venv/
pipeline/out/*
!pipeline/out/fixture/
__pycache__/
.vitest/
```

`pipeline/pyproject.toml`:
```toml
[project]
name = "fly-playground-pipeline"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = ["numpy>=2.0"]

[dependency-groups]
dev = ["pytest>=8.0"]
```

`.github/workflows/ci.yml`:
```yaml
name: ci
on: [push, pull_request]
jobs:
  js:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20" }
      - run: npm ci
      - run: npm run test
      - run: npm run typecheck
      - run: npm run build
  rust:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with: { targets: wasm32-unknown-unknown }
      - uses: taiki-e/install-action@v2
        with: { tool: wasm-pack }
      - run: cargo test -p fly-sim
      - run: cargo fmt --check
      - run: cargo clippy -p fly-sim -- -D warnings
      - run: wasm-pack build crates/fly-sim --target web --dev
  python:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.11" }
      - run: pip install -e "pipeline[dev]" || pip install numpy pytest
      - run: python -m pytest pipeline -q
```

Run locally: `npm run test && cargo test -p fly-sim && cargo fmt --check && cargo clippy -p fly-sim -- -D warnings`
Expected: all PASS. (`pytest pipeline` may report "no tests ran" — acceptable until Task 2.)

- [ ] **Step 8: Commit**

```bash
git init
git add -A
git commit -m "chore: scaffold Vite/TS + Rust wasm crate + CI"
```

---

## Task 2: Synthetic fixture generator (`pipeline/gen_fixture.py`)

**Files:**
- Create: `pipeline/gen_fixture.py`
- Create: `pipeline/tests/test_gen_fixture.py`
- Create (committed output): `pipeline/out/fixture/neurons.bin`, `graph.bin`, `groups.json`, `manifest.json`

**Interfaces:**
- Consumes: the Global Constraints "Fixture contract".
- Produces: the four committed fixture files. Module-level constants `N_NEURONS=500`, `CORE_COUNT=48`, `SEED=42`, `INPUT_ROLES` and `READOUT_ROLES` dicts mapping name → `range`, and `W_NORM` (float). `main()` writes all four files under `pipeline/out/fixture/`.

- [ ] **Step 1: Write the failing test**

`pipeline/tests/test_gen_fixture.py`:
```python
import json
import struct
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "pipeline" / "out" / "fixture"


def _regen():
    subprocess.run([sys.executable, str(ROOT / "pipeline" / "gen_fixture.py")], check=True)


def _read_neurons(b: bytes):
    magic, version, count, core = struct.unpack_from("<IIII", b, 0)
    assert magic == 0x4E594C46
    recs = []
    for k in range(count):
        o = 16 + k * 24
        _id, x, y, z, gid, flags, _pad = struct.unpack_from("<Qfffh B B", b, o)
        recs.append((flags,))
    return version, count, core, recs


def _read_graph(b: bytes):
    magic, version, n_nodes, _p0, n_edges, w_norm, _p1 = struct.unpack_from("<IIIIQfI", b, 0)
    assert magic == 0x47594C46
    base = 32
    offsets = list(struct.unpack_from(f"<{n_nodes + 1}I", b, base))
    tbase = base + (n_nodes + 1) * 4
    targets = list(struct.unpack_from(f"<{n_edges}I", b, tbase))
    wbase = tbase + n_edges * 4
    weights = list(struct.unpack_from(f"<{n_edges}h", b, wbase))
    return n_nodes, n_edges, w_norm, offsets, targets, weights


def test_deterministic_bytes():
    _regen()
    first = (OUT / "graph.bin").read_bytes(), (OUT / "neurons.bin").read_bytes()
    _regen()
    second = (OUT / "graph.bin").read_bytes(), (OUT / "neurons.bin").read_bytes()
    assert first == second


def test_csr_invariants():
    _regen()
    n_nodes, n_edges, w_norm, offsets, targets, weights = _read_graph((OUT / "graph.bin").read_bytes())
    assert n_nodes == 500
    assert offsets[0] == 0 and offsets[-1] == n_edges
    assert all(offsets[i] <= offsets[i + 1] for i in range(n_nodes))
    assert all(t < n_nodes for t in targets)
    assert len(weights) == n_edges
    assert 4000 <= n_edges <= 20000
    assert w_norm > 0.0


def test_core_and_manifest():
    _regen()
    version, count, core, recs = _read_neurons((OUT / "neurons.bin").read_bytes())
    assert (count, core) == (500, 48)
    assert all(recs[i][0] & 0b1 for i in range(48))          # first 48 flagged core
    assert not any(recs[i][0] & 0b1 for i in range(48, 500)) # none after
    m = json.loads((OUT / "manifest.json").read_text())
    assert m["n_neurons"] == 500 and m["core_count"] == 48


def test_looming_drives_escape_path():
    _regen()
    n_nodes, n_edges, w_norm, offsets, targets, weights = _read_graph((OUT / "graph.bin").read_bytes())
    # every looming neuron (0..8) has an edge into every escape neuron (24..32)
    for src in range(0, 8):
        row = set(targets[offsets[src]:offsets[src + 1]])
        assert set(range(24, 32)).issubset(row)
```

- [ ] **Step 2: Run it to see it fail**

Run: `python -m pytest pipeline/tests/test_gen_fixture.py -q`
Expected: FAIL — `gen_fixture.py` does not exist (subprocess raises `CalledProcessError` / file not found).

- [ ] **Step 3: Implement the generator**

`pipeline/gen_fixture.py`:
```python
"""Deterministic synthetic connectome fixture for fly-sim tests.

Layout is the authoritative "Fixture contract" from
docs/superpowers/plans/2026-09-09-fly-playground-01-foundations.md.
No timestamps are written, so output is byte-reproducible.
"""
import json
import struct
from pathlib import Path

import numpy as np

N_NEURONS = 500
CORE_COUNT = 48
SEED = 42
W_NORM = 0.01  # weight_i16 * W_NORM == w_sim

INPUT_ROLES = {
    "looming": range(0, 8),
    "light_l": range(8, 12),
    "light_r": range(12, 16),
    "proximity": range(16, 20),
    "wind_l": range(20, 22),
    "wind_r": range(22, 24),
}
READOUT_ROLES = {
    "escape": range(24, 32),
    "wing_l": range(32, 36),
    "wing_r": range(36, 40),
    "thrust": range(40, 44),
    "yaw_torque": range(44, 48),
}

OUT = Path(__file__).resolve().parent / "out" / "fixture"

FLAG_CORE = 0b0001
FLAG_INHIB = 0b0010
FLAG_INPUT = 0b0100
FLAG_READOUT = 0b1000


def build():
    rng = np.random.default_rng(SEED)

    pos = rng.uniform(-0.5, 0.5, size=(N_NEURONS, 3)).astype(np.float32)
    group_id = rng.integers(0, 8, size=N_NEURONS).astype(np.uint16)

    flags = np.zeros(N_NEURONS, dtype=np.uint8)
    flags[:CORE_COUNT] |= FLAG_CORE
    for r in INPUT_ROLES.values():
        flags[list(r)] |= FLAG_INPUT
    for r in READOUT_ROLES.values():
        flags[list(r)] |= FLAG_READOUT
    # ~20% inhibitory, but never the readout neurons (keep motor output positive)
    inhib = rng.random(N_NEURONS) < 0.2
    for r in READOUT_ROLES.values():
        inhib[list(r)] = False
    flags[inhib] |= FLAG_INHIB

    # --- edges as (src, dst, weight_i16) ---
    edges: dict[tuple[int, int], int] = {}

    # deterministic strong looming -> escape wiring
    for s in INPUT_ROLES["looming"]:
        for d in READOUT_ROLES["escape"]:
            edges[(s, d)] = 40  # 40 * 0.01 = 0.40 w_sim

    # light -> contralateral wing (weak phototaxis flavour)
    for s in INPUT_ROLES["light_l"]:
        for d in READOUT_ROLES["wing_r"]:
            edges[(s, d)] = 20
    for s in INPUT_ROLES["light_r"]:
        for d in READOUT_ROLES["wing_l"]:
            edges[(s, d)] = 20

    # sparse random background: ~15 out-edges per neuron, small weights
    for s in range(N_NEURONS):
        dsts = rng.choice(N_NEURONS, size=15, replace=False)
        w = rng.integers(1, 8, size=15)
        for d, wi in zip(dsts, w):
            if int(d) == s:
                continue
            edges.setdefault((s, int(d)), int(wi))

    # --- CSR ---
    rows: list[list[tuple[int, int]]] = [[] for _ in range(N_NEURONS)]
    for (s, d), w in edges.items():
        rows[s].append((d, w))
    for r in rows:
        r.sort()

    offsets = np.zeros(N_NEURONS + 1, dtype=np.uint32)
    targets: list[int] = []
    weights: list[int] = []
    for i, r in enumerate(rows):
        for d, w in r:
            targets.append(d)
            weights.append(w)
        offsets[i + 1] = len(targets)
    n_edges = len(targets)

    return dict(
        pos=pos, group_id=group_id, flags=flags,
        offsets=offsets,
        targets=np.asarray(targets, dtype=np.uint32),
        weights=np.asarray(weights, dtype=np.int16),
        n_edges=n_edges,
    )


def write(data):
    OUT.mkdir(parents=True, exist_ok=True)

    with open(OUT / "neurons.bin", "wb") as f:
        f.write(struct.pack("<IIII", 0x4E594C46, 1, N_NEURONS, CORE_COUNT))
        for i in range(N_NEURONS):
            x, y, z = (float(v) for v in data["pos"][i])
            f.write(struct.pack("<Qfff", i + 1, x, y, z))
            f.write(struct.pack("<HBB", int(data["group_id"][i]), int(data["flags"][i]), 0))

    with open(OUT / "graph.bin", "wb") as f:
        f.write(struct.pack("<IIII", 0x47594C46, 1, N_NEURONS, 0))
        f.write(struct.pack("<QfI", data["n_edges"], W_NORM, 0))
        f.write(data["offsets"].tobytes())
        f.write(data["targets"].tobytes())
        f.write(data["weights"].tobytes())

    groups = {
        "scale_factor": 1.0,
        "groups": [f"g{i}" for i in range(8)],
        "roles": {
            "input": {k: list(v) for k, v in INPUT_ROLES.items()},
            "readout": {k: list(v) for k, v in READOUT_ROLES.items()},
        },
    }
    (OUT / "groups.json").write_text(json.dumps(groups, indent=2, sort_keys=True) + "\n")

    manifest = {
        "version": 1, "dataset": "fixture",
        "n_neurons": N_NEURONS, "core_count": CORE_COUNT,
        "n_edges": data["n_edges"], "w_norm": W_NORM, "scale_factor": 1.0,
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")


def main():
    write(build())
    print(f"wrote fixture to {OUT}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest pipeline/tests/test_gen_fixture.py -q`
Expected: 5 PASS. If `test_csr_invariants` reports `n_edges` outside `4000..20000`, adjust the per-neuron background fan-out (`size=15`) and re-run — do not widen the assertion.

- [ ] **Step 5: Commit (including the generated fixture)**

```bash
git add pipeline/gen_fixture.py pipeline/tests/test_gen_fixture.py pipeline/out/fixture
git commit -m "feat: deterministic synthetic connectome fixture generator"
```

---

## Task 3: Rust binary decoders (`core/format.rs`)

**Files:**
- Create: `crates/fly-sim/src/core/mod.rs`
- Create: `crates/fly-sim/src/core/format.rs`
- Modify: `crates/fly-sim/src/lib.rs` (add `mod core;`)
- Create: `crates/fly-sim/tests/fixtures.rs` (shared test helper)
- Modify: `docs/neuron-model.md` §2 (header padding now 16 / 32 bytes as in this plan)

**Interfaces:**
- Consumes: committed `pipeline/out/fixture/*.bin`.
- Produces:
  - `pub enum FormatError { TooShort { need: usize, got: usize }, BadMagic { expected: u32, got: u32 }, BadOffsets }`
  - `pub struct NeuronsFile { pub version: u32, pub core_count: u32, pub ids: Vec<u64>, pub pos: Vec<[f32;3]>, pub group_id: Vec<u16>, pub flags: Vec<u8> }` with `fn parse(&[u8]) -> Result<Self, FormatError>`, `fn count(&self) -> usize`, `fn is_core(&self, usize) -> bool`, `fn is_inhibitory(&self, usize) -> bool`, `fn is_input(&self, usize) -> bool`, `fn is_readout(&self, usize) -> bool`.
  - `pub struct GraphFile { pub version: u32, pub n_nodes: usize, pub w_norm: f32, pub offsets: Vec<u32>, pub targets: Vec<u32>, pub weights: Vec<i16> }` with `fn parse(&[u8]) -> Result<Self, FormatError>`, `fn n_edges(&self) -> usize`, `fn row(&self, i: usize) -> RowIter<'_>` yielding `(u32 target, i16 weight)`.
  - `crates/fly-sim/tests/fixtures.rs`: `pub const FIXTURE_N: usize = 500; pub const FIXTURE_CORE: u32 = 48; pub const FIXTURE_SEED: u64 = 42;` plus `pub fn neurons_bytes() -> Vec<u8>` / `pub fn graph_bytes() -> Vec<u8>` reading `env!("CARGO_MANIFEST_DIR")/../../pipeline/out/fixture/*.bin`, and `pub fn fixture_input_roles()` / `fixture_readout_roles()` returning `Vec<(&'static str, Vec<u32>)>` matching the contract.

- [ ] **Step 1: Write the failing tests**

`crates/fly-sim/src/core/format.rs` (tests at bottom):
```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn neurons() -> Vec<u8> {
        std::fs::read(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../pipeline/out/fixture/neurons.bin"
        ))
        .expect("run `python pipeline/gen_fixture.py` first")
    }
    fn graph() -> Vec<u8> {
        std::fs::read(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../pipeline/out/fixture/graph.bin"
        ))
        .unwrap()
    }

    #[test]
    fn parses_fixture_neurons() {
        let n = NeuronsFile::parse(&neurons()).unwrap();
        assert_eq!(n.count(), 500);
        assert_eq!(n.core_count, 48);
        assert!((0..48).all(|i| n.is_core(i)));
        assert!(!(48..500).any(|i| n.is_core(i)));
        assert!((0..8).all(|i| n.is_input(i)));
        assert!((24..32).all(|i| n.is_readout(i)));
        assert!(n.pos.iter().all(|p| p.iter().all(|v| v.is_finite())));
    }

    #[test]
    fn parses_fixture_graph_csr() {
        let g = GraphFile::parse(&graph()).unwrap();
        assert_eq!(g.n_nodes, 500);
        assert_eq!(g.offsets.len(), 501);
        assert_eq!(*g.offsets.last().unwrap() as usize, g.n_edges());
        assert!(g.offsets.windows(2).all(|w| w[0] <= w[1]));
        assert!(g.targets.iter().all(|&t| (t as usize) < g.n_nodes));
        assert!(g.w_norm > 0.0);
    }

    #[test]
    fn row_iter_matches_offsets() {
        let g = GraphFile::parse(&graph()).unwrap();
        for src in 0..8usize {
            let targets: Vec<u32> = g.row(src).map(|(t, _)| t).collect();
            for esc in 24u32..32 {
                assert!(targets.contains(&esc), "looming {src} -> escape {esc} missing");
            }
        }
    }

    #[test]
    fn rejects_bad_magic() {
        let mut b = neurons();
        b[0] ^= 0xFF;
        assert!(matches!(NeuronsFile::parse(&b), Err(FormatError::BadMagic { .. })));
    }

    #[test]
    fn rejects_truncated() {
        let b = graph();
        assert!(matches!(
            GraphFile::parse(&b[..40]),
            Err(FormatError::TooShort { .. })
        ));
    }
}
```

`crates/fly-sim/src/core/mod.rs`:
```rust
pub mod format;
```

`crates/fly-sim/src/lib.rs` — add near the top:
```rust
mod core;
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test -p fly-sim format::`
Expected: FAIL — `NeuronsFile` / `GraphFile` undefined.

- [ ] **Step 3: Implement `format.rs`**

At the top of `crates/fly-sim/src/core/format.rs`:
```rust
use std::convert::TryInto;

const NEURONS_MAGIC: u32 = 0x4E59_4C46; // "FLYN" LE
const GRAPH_MAGIC: u32 = 0x4759_4C46; // "FLYG" LE
const NEURON_REC: usize = 24;

#[derive(Debug, PartialEq, Eq)]
pub enum FormatError {
    TooShort { need: usize, got: usize },
    BadMagic { expected: u32, got: u32 },
    BadOffsets,
}

#[inline]
fn u32_at(b: &[u8], o: usize) -> u32 {
    u32::from_le_bytes(b[o..o + 4].try_into().unwrap())
}
#[inline]
fn u64_at(b: &[u8], o: usize) -> u64 {
    u64::from_le_bytes(b[o..o + 8].try_into().unwrap())
}
#[inline]
fn f32_at(b: &[u8], o: usize) -> f32 {
    f32::from_le_bytes(b[o..o + 4].try_into().unwrap())
}
#[inline]
fn u16_at(b: &[u8], o: usize) -> u16 {
    u16::from_le_bytes(b[o..o + 2].try_into().unwrap())
}

pub struct NeuronsFile {
    pub version: u32,
    pub core_count: u32,
    pub ids: Vec<u64>,
    pub pos: Vec<[f32; 3]>,
    pub group_id: Vec<u16>,
    pub flags: Vec<u8>,
}

impl NeuronsFile {
    pub fn count(&self) -> usize {
        self.ids.len()
    }
    pub fn is_core(&self, i: usize) -> bool {
        self.flags[i] & 0b0001 != 0
    }
    pub fn is_inhibitory(&self, i: usize) -> bool {
        self.flags[i] & 0b0010 != 0
    }
    pub fn is_input(&self, i: usize) -> bool {
        self.flags[i] & 0b0100 != 0
    }
    pub fn is_readout(&self, i: usize) -> bool {
        self.flags[i] & 0b1000 != 0
    }

    pub fn parse(b: &[u8]) -> Result<Self, FormatError> {
        if b.len() < 16 {
            return Err(FormatError::TooShort { need: 16, got: b.len() });
        }
        let magic = u32_at(b, 0);
        if magic != NEURONS_MAGIC {
            return Err(FormatError::BadMagic { expected: NEURONS_MAGIC, got: magic });
        }
        let version = u32_at(b, 4);
        let count = u32_at(b, 8) as usize;
        let core_count = u32_at(b, 12);
        let need = 16 + count * NEURON_REC;
        if b.len() < need {
            return Err(FormatError::TooShort { need, got: b.len() });
        }
        let mut ids = Vec::with_capacity(count);
        let mut pos = Vec::with_capacity(count);
        let mut group_id = Vec::with_capacity(count);
        let mut flags = Vec::with_capacity(count);
        for k in 0..count {
            let o = 16 + k * NEURON_REC;
            ids.push(u64_at(b, o));
            pos.push([f32_at(b, o + 8), f32_at(b, o + 12), f32_at(b, o + 16)]);
            group_id.push(u16_at(b, o + 20));
            flags.push(b[o + 22]);
        }
        Ok(Self { version, core_count, ids, pos, group_id, flags })
    }
}

pub struct GraphFile {
    pub version: u32,
    pub n_nodes: usize,
    pub w_norm: f32,
    pub offsets: Vec<u32>,
    pub targets: Vec<u32>,
    pub weights: Vec<i16>,
}

pub struct RowIter<'a> {
    t: &'a [u32],
    w: &'a [i16],
    i: usize,
}
impl<'a> Iterator for RowIter<'a> {
    type Item = (u32, i16);
    fn next(&mut self) -> Option<Self::Item> {
        if self.i >= self.t.len() {
            return None;
        }
        let out = (self.t[self.i], self.w[self.i]);
        self.i += 1;
        Some(out)
    }
}

impl GraphFile {
    pub fn n_edges(&self) -> usize {
        self.targets.len()
    }

    pub fn row(&self, i: usize) -> RowIter<'_> {
        let s = self.offsets[i] as usize;
        let e = self.offsets[i + 1] as usize;
        RowIter { t: &self.targets[s..e], w: &self.weights[s..e], i: 0 }
    }

    pub fn parse(b: &[u8]) -> Result<Self, FormatError> {
        if b.len() < 32 {
            return Err(FormatError::TooShort { need: 32, got: b.len() });
        }
        let magic = u32_at(b, 0);
        if magic != GRAPH_MAGIC {
            return Err(FormatError::BadMagic { expected: GRAPH_MAGIC, got: magic });
        }
        let version = u32_at(b, 4);
        let n_nodes = u32_at(b, 8) as usize;
        let n_edges = u64_at(b, 16) as usize;
        let w_norm = f32_at(b, 24);

        let off_bytes = (n_nodes + 1) * 4;
        let tgt_bytes = n_edges * 4;
        let wt_bytes = n_edges * 2;
        let need = 32 + off_bytes + tgt_bytes + wt_bytes;
        if b.len() < need {
            return Err(FormatError::TooShort { need, got: b.len() });
        }

        let mut offsets = Vec::with_capacity(n_nodes + 1);
        for k in 0..=n_nodes {
            offsets.push(u32_at(b, 32 + k * 4));
        }
        if offsets[0] != 0
            || offsets[n_nodes] as usize != n_edges
            || offsets.windows(2).any(|w| w[0] > w[1])
        {
            return Err(FormatError::BadOffsets);
        }

        let tbase = 32 + off_bytes;
        let mut targets = Vec::with_capacity(n_edges);
        for k in 0..n_edges {
            let t = u32_at(b, tbase + k * 4);
            if t as usize >= n_nodes {
                return Err(FormatError::BadOffsets);
            }
            targets.push(t);
        }

        let wbase = tbase + tgt_bytes;
        let mut weights = Vec::with_capacity(n_edges);
        for k in 0..n_edges {
            weights.push(i16::from_le_bytes(b[wbase + k * 2..wbase + k * 2 + 2].try_into().unwrap()));
        }

        Ok(Self { version, n_nodes, w_norm, offsets, targets, weights })
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test -p fly-sim format:: && cargo clippy -p fly-sim -- -D warnings`
Expected: 5 PASS, clippy clean.

- [ ] **Step 5: Add the shared fixtures helper**

`crates/fly-sim/tests/fixtures.rs`:
```rust
//! Shared constants + loaders for integration tests. Mirrors the "Fixture
//! contract" in the Plan 01 doc and pipeline/gen_fixture.py.
#![allow(dead_code)]

pub const FIXTURE_N: usize = 500;
pub const FIXTURE_CORE: u32 = 48;
pub const FIXTURE_SEED: u64 = 42;

fn read(name: &str) -> Vec<u8> {
    let p = format!("{}/../../pipeline/out/fixture/{}", env!("CARGO_MANIFEST_DIR"), name);
    std::fs::read(&p).unwrap_or_else(|_| panic!("missing {p}; run python pipeline/gen_fixture.py"))
}
pub fn neurons_bytes() -> Vec<u8> {
    read("neurons.bin")
}
pub fn graph_bytes() -> Vec<u8> {
    read("graph.bin")
}

pub fn fixture_input_roles() -> Vec<(&'static str, Vec<u32>)> {
    vec![
        ("looming", (0..8).collect()),
        ("light_l", (8..12).collect()),
        ("light_r", (12..16).collect()),
        ("proximity", (16..20).collect()),
        ("wind_l", (20..22).collect()),
        ("wind_r", (22..24).collect()),
    ]
}
pub fn fixture_readout_roles() -> Vec<(&'static str, Vec<u32>)> {
    vec![
        ("escape", (24..32).collect()),
        ("wing_l", (32..36).collect()),
        ("wing_r", (36..40).collect()),
        ("thrust", (40..44).collect()),
        ("yaw_torque", (44..48).collect()),
    ]
}
```

(This file has no `#[test]` of its own yet; it is `mod`-included by later tasks. `cargo test` will note "0 tests" for it — fine.)

- [ ] **Step 6: Update the format doc + commit**

In `docs/neuron-model.md` §2, change the `neurons.bin` header to the 16-byte form and the `graph.bin` header to the 32-byte padded form exactly as in this plan's "Binary formats" section. Add a line: "Header padding authoritative in `docs/superpowers/plans/2026-09-09-fly-playground-01-foundations.md`."

```bash
git add crates/fly-sim/src/core crates/fly-sim/src/lib.rs crates/fly-sim/tests/fixtures.rs docs/neuron-model.md
git commit -m "feat: Rust decoders for neurons.bin / graph.bin"
```

---

## Task 4: LIF neuron integration (`core/lif.rs`)

**Files:**
- Create: `crates/fly-sim/src/core/lif.rs`
- Modify: `crates/fly-sim/src/core/mod.rs` (`pub mod lif;`)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `pub struct LifParams { pub leak: f32, pub v_threshold: f32, pub v_reset: f32, pub refrac_ticks: u16, pub noise_sigma: f32 }`
  - `impl LifParams { pub fn from_ms(dt_ms: f32, tau_m_ms: f32, v_threshold: f32, v_reset: f32, refrac_ms: f32, noise_sigma: f32) -> Self }` where `leak = (-dt_ms / tau_m_ms).exp()` and `refrac_ticks = (refrac_ms / dt_ms).round() as u16`.
  - `impl Default for LifParams` → `from_ms(5.0, 20.0, 1.0, 0.0, 2.0, 0.02)`.
  - `pub struct LifState { pub v: Vec<f32>, pub refrac: Vec<u16>, pub spike: Vec<u8> }` with `pub fn new(n: usize) -> Self`.
  - `pub fn integrate_one(v: f32, refrac: u16, input: f32, p: &LifParams) -> (f32, bool, u16)` — pure, no RNG: applies `v' = leak*v + input`, then fire/reset/refractory logic. Returns `(new_v, fired, new_refrac)`.

- [ ] **Step 1: Write the failing tests**

`crates/fly-sim/src/core/lif.rs` (tests at bottom):
```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn p() -> LifParams {
        LifParams::from_ms(5.0, 20.0, 1.0, 0.0, 2.0, 0.0)
    }

    #[test]
    fn leak_decays_toward_zero_with_no_input() {
        let params = p();
        let (v1, fired, _) = integrate_one(0.5, 0, 0.0, &params);
        assert!(!fired);
        assert!((v1 - 0.5 * params.leak).abs() < 1e-6);
        assert!(v1 < 0.5);
    }

    #[test]
    fn fires_and_resets_when_input_crosses_threshold() {
        let params = p();
        let (v1, fired, refrac) = integrate_one(0.0, 0, 1.5, &params);
        assert!(fired);
        assert_eq!(v1, params.v_reset);
        assert_eq!(refrac, params.refrac_ticks);
    }

    #[test]
    fn refractory_blocks_firing_and_counts_down() {
        let params = p();
        // big input but still refractory -> no spike, refrac decremented, v held at reset
        let (v1, fired, refrac) = integrate_one(0.0, 2, 10.0, &params);
        assert!(!fired);
        assert_eq!(refrac, 1);
        assert_eq!(v1, params.v_reset);
    }

    #[test]
    fn from_ms_computes_leak_and_refrac() {
        let params = LifParams::from_ms(5.0, 20.0, 1.0, 0.0, 2.0, 0.02);
        assert!((params.leak - (-0.25f32).exp()).abs() < 1e-6);
        assert_eq!(params.refrac_ticks, 0); // 2.0 / 5.0 = 0.4 -> rounds to 0
    }

    #[test]
    fn default_matches_from_ms_defaults() {
        assert_eq!(LifParams::default().leak, LifParams::from_ms(5.0, 20.0, 1.0, 0.0, 2.0, 0.02).leak);
    }

    #[test]
    fn state_new_is_zeroed() {
        let s = LifState::new(4);
        assert_eq!(s.v, vec![0.0; 4]);
        assert_eq!(s.refrac, vec![0u16; 4]);
        assert_eq!(s.spike, vec![0u8; 4]);
    }
}
```

`crates/fly-sim/src/core/mod.rs`:
```rust
pub mod format;
pub mod lif;
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test -p fly-sim lif::`
Expected: FAIL — `LifParams` undefined.

- [ ] **Step 3: Implement `lif.rs`**

Top of `crates/fly-sim/src/core/lif.rs`:
```rust
#[derive(Clone, Copy, Debug)]
pub struct LifParams {
    pub leak: f32,
    pub v_threshold: f32,
    pub v_reset: f32,
    pub refrac_ticks: u16,
    pub noise_sigma: f32,
}

impl LifParams {
    pub fn from_ms(
        dt_ms: f32,
        tau_m_ms: f32,
        v_threshold: f32,
        v_reset: f32,
        refrac_ms: f32,
        noise_sigma: f32,
    ) -> Self {
        Self {
            leak: (-dt_ms / tau_m_ms).exp(),
            v_threshold,
            v_reset,
            refrac_ticks: (refrac_ms / dt_ms).round() as u16,
            noise_sigma,
        }
    }
}

impl Default for LifParams {
    fn default() -> Self {
        Self::from_ms(5.0, 20.0, 1.0, 0.0, 2.0, 0.02)
    }
}

pub struct LifState {
    pub v: Vec<f32>,
    pub refrac: Vec<u16>,
    pub spike: Vec<u8>,
}

impl LifState {
    pub fn new(n: usize) -> Self {
        Self { v: vec![0.0; n], refrac: vec![0; n], spike: vec![0; n] }
    }
}

/// Pure single-neuron update. `input` already includes synaptic drive + injected
/// stimulus + noise for this tick. Order-independent across neurons because the
/// caller double-buffers `input`.
pub fn integrate_one(v: f32, refrac: u16, input: f32, p: &LifParams) -> (f32, bool, u16) {
    if refrac > 0 {
        return (p.v_reset, false, refrac - 1);
    }
    let v_new = p.leak * v + input;
    if v_new >= p.v_threshold {
        (p.v_reset, true, p.refrac_ticks)
    } else {
        (v_new, false, 0)
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test -p fly-sim lif:: && cargo clippy -p fly-sim -- -D warnings`
Expected: 6 PASS, clippy clean.

- [ ] **Step 5: Commit**

```bash
git add crates/fly-sim/src/core/lif.rs crates/fly-sim/src/core/mod.rs
git commit -m "feat: LIF neuron params and pure integrate step"
```

---

## Task 5: `SimCore` — CSR propagation + stepping (`core/sim.rs`)

**Files:**
- Create: `crates/fly-sim/src/core/sim.rs`
- Create: `crates/fly-sim/src/core/rng.rs`
- Modify: `crates/fly-sim/src/core/mod.rs`

**Interfaces:**
- Consumes: `format::{NeuronsFile, GraphFile}`, `lif::{LifParams, LifState, integrate_one}`.
- Produces:
  - `crates/fly-sim/src/core/rng.rs`: `pub struct SplitMix64(u64); impl SplitMix64 { pub fn new(seed: u64) -> Self; pub fn next_u64(&mut self) -> u64; pub fn next_gaussian(&mut self) -> f32 }` (Box–Muller, no cached spare, so a fixed call count ⇒ fixed stream).
  - `pub struct SimConfig { pub params: LifParams, pub seed: u64, pub activity_tau_ticks: f32 }` with `Default` (`params: default`, `seed: 0x0DDB1A5E, activity_tau_ticks: 40.0`).
  - `pub struct SimCore { /* private */ }` with:
    - `pub fn new(neurons: &NeuronsFile, graph: &GraphFile, cfg: SimConfig) -> SimCore` — panics if `neurons.count() != graph.n_nodes`.
    - `pub fn neuron_count(&self) -> usize`
    - `pub fn core_count(&self) -> usize`
    - `pub fn active_count(&self) -> usize`
    - `pub fn set_active_count(&mut self, n: usize)` — clamped to `core_count()..=neuron_count()`; freezes state of now-inactive neurons (does not zero).
    - `pub fn set_params(&mut self, p: LifParams)`
    - `pub fn add_input(&mut self, i: usize, amount: f32)` — queued into the next tick's input buffer (accumulates).
    - `pub fn step(&mut self, ticks: u32)`
    - `pub fn activity(&self) -> &[f32]` — per-neuron EMA firing rate, length `neuron_count()`, updated each tick as `a = a + (spike - a) / activity_tau_ticks`.
    - `pub fn spikes(&self) -> &[u8]` — last tick's spike flags.

- [ ] **Step 1: Write the failing tests**

`crates/fly-sim/src/core/sim.rs` (tests at bottom):
```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::format::{GraphFile, NeuronsFile};

    // Build a tiny hand-made pair of files: 3 neurons, edge 0->1 (+w), edge 0->2 (-w via inhib flag on 0).
    fn tiny() -> (Vec<u8>, Vec<u8>) {
        // neurons.bin: count=3, core_count=1
        let mut n = Vec::new();
        n.extend(0x4E59_4C46u32.to_le_bytes());
        n.extend(1u32.to_le_bytes());
        n.extend(3u32.to_le_bytes());
        n.extend(1u32.to_le_bytes());
        for (idx, flags) in [(1u64, 0b0110u8 /*core+inhib*/), (2, 0), (3, 0)] {
            n.extend(idx.to_le_bytes());
            n.extend(0f32.to_le_bytes());
            n.extend(0f32.to_le_bytes());
            n.extend(0f32.to_le_bytes());
            n.extend(0u16.to_le_bytes());
            n.push(flags);
            n.push(0);
        }
        // graph.bin: n_nodes=3, edges: 0->1 w=100, 0->2 w=100 ; w_norm=0.01
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
        for w in [100i16, 100] {
            g.extend(w.to_le_bytes());
        }
        (n, g)
    }

    fn core_from(nb: &[u8], gb: &[u8], seed: u64) -> SimCore {
        let nf = NeuronsFile::parse(nb).unwrap();
        let gf = GraphFile::parse(gb).unwrap();
        let mut cfg = SimConfig::default();
        cfg.seed = seed;
        cfg.params.noise_sigma = 0.0;
        SimCore::new(&nf, &gf, cfg)
    }

    #[test]
    fn injected_input_makes_source_fire_then_propagates_with_sign() {
        let (nb, gb) = tiny();
        let mut s = core_from(&nb, &gb, 1);
        s.add_input(0, 2.0); // above threshold
        s.step(1); // tick A: neuron 0 fires, writes into next buffer
        assert_eq!(s.spikes()[0], 1);
        s.step(1); // tick B: neuron 1 gets +100*0.01, neuron 2 gets -100*0.01 (source 0 is inhibitory)
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
        assert_eq!(s.debug_v(1), 0.0, "edge into inactive neuron must be skipped");
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
        let mut bad = _gb_with_nodes(4);
        let _ = &mut bad;
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
```

Note: tests call `s.debug_v(i)`. Add a `#[cfg(test)] pub fn debug_v(&self, i: usize) -> f32 { self.state.v[i] }` accessor to `SimCore`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test -p fly-sim sim::`
Expected: FAIL — `SimCore` / `SimConfig` undefined.

- [ ] **Step 3: Implement `rng.rs`**

`crates/fly-sim/src/core/rng.rs`:
```rust
/// SplitMix64 — tiny, fast, fully deterministic. Used for membrane noise only.
pub struct SplitMix64(u64);

impl SplitMix64 {
    pub fn new(seed: u64) -> Self {
        Self(seed)
    }
    pub fn next_u64(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }
    fn next_f32_unit(&mut self) -> f32 {
        // 24 random bits -> [0, 1)
        (self.next_u64() >> 40) as f32 / (1u32 << 24) as f32
    }
    /// Box–Muller, no cached spare (so call count fully determines the stream).
    pub fn next_gaussian(&mut self) -> f32 {
        let u1 = self.next_f32_unit().max(1e-7);
        let u2 = self.next_f32_unit();
        (-2.0 * u1.ln()).sqrt() * (std::f32::consts::TAU * u2).cos()
    }
}
```

- [ ] **Step 4: Implement `sim.rs`**

Top of `crates/fly-sim/src/core/sim.rs`:
```rust
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
        Self { params: LifParams::default(), seed: 0x0DDB_1A5E, activity_tau_ticks: 40.0 }
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
        assert_eq!(neurons.count(), graph.n_nodes, "neuron/graph node count mismatch");
        let n = neurons.count();
        let sign: Vec<f32> =
            (0..n).map(|i| if neurons.is_inhibitory(i) { -1.0 } else { 1.0 }).collect();
        let weights_sim: Vec<f32> =
            graph.weights.iter().map(|&w| w as f32 * graph.w_norm).collect();
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
                let sp = if i < self.active { self.state.spike[i] as f32 } else { 0.0 };
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
```

`crates/fly-sim/src/core/mod.rs`:
```rust
pub mod format;
pub mod lif;
pub mod rng;
pub mod sim;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cargo test -p fly-sim && cargo clippy -p fly-sim -- -D warnings`
Expected: all PASS (format + lif + sim), clippy clean.

- [ ] **Step 6: Commit**

```bash
git add crates/fly-sim/src/core
git commit -m "feat: SimCore CSR propagation, double-buffered input, seeded noise"
```

---

## Task 6: Roles — inject / readout / snapshot (`core/roles.rs` + `SimCore` methods)

**Files:**
- Create: `crates/fly-sim/src/core/roles.rs`
- Modify: `crates/fly-sim/src/core/sim.rs` (embed a `Roles` field + public methods)
- Modify: `crates/fly-sim/src/core/mod.rs`

**Interfaces:**
- Consumes: `SimCore` from Task 5.
- Produces:
  - `roles.rs`: `pub struct Roles { input: Vec<(String, Vec<u32>)>, readout: Vec<(String, Vec<u32>)> }` with `pub fn new() -> Self`, `pub fn define_input(&mut self, name: &str, ids: &[u32]) -> u32`, `pub fn define_readout(&mut self, name: &str, ids: &[u32]) -> u32`, `pub fn input_neurons(&self, id: u32) -> &[u32]`, `pub fn readout_neurons(&self, id: u32) -> &[u32]`. Role ids are the insertion index (`u32`).
  - New `SimCore` methods:
    - `pub fn define_input_role(&mut self, name: &str, neurons: &[u32]) -> u32`
    - `pub fn define_readout_role(&mut self, name: &str, neurons: &[u32]) -> u32`
    - `pub fn inject(&mut self, role_id: u32, value: f32)` — adds `value` to `input_cur[i]` for each neuron `i` in that input role (per-neuron, not split).
    - `pub fn readout(&self, role_id: u32) -> f32` — mean of `activity[i]` over that readout role's neurons (0.0 if empty).
    - `pub fn activity_snapshot(&self) -> Vec<f32>` — `self.activity[..self.active].to_vec()`.

- [ ] **Step 1: Write the failing tests**

`crates/fly-sim/src/core/sim.rs` — add to the existing `mod tests`:
```rust
    use crate::core::format::{GraphFile as GF, NeuronsFile as NF};

    fn fixture_core() -> SimCore {
        let nb = std::fs::read(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../pipeline/out/fixture/neurons.bin"
        ))
        .expect("run python pipeline/gen_fixture.py");
        let gb = std::fs::read(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../pipeline/out/fixture/graph.bin"
        ))
        .unwrap();
        let nf = NF::parse(&nb).unwrap();
        let gf = GF::parse(&gb).unwrap();
        let mut cfg = SimConfig::default();
        cfg.params.noise_sigma = 0.0;
        SimCore::new(&nf, &gf, cfg)
    }

    #[test]
    fn snapshot_length_tracks_active_count() {
        let mut s = fixture_core();
        s.set_active_count(120);
        s.step(1);
        assert_eq!(s.activity_snapshot().len(), 120);
    }

    #[test]
    fn readout_is_zero_before_any_activity() {
        let mut s = fixture_core();
        let escape = s.define_readout_role("escape", &(24u32..32).collect::<Vec<_>>());
        s.step(5);
        assert_eq!(s.readout(escape), 0.0);
    }

    #[test]
    fn sustained_looming_injection_drives_escape_readout() {
        let mut s = fixture_core();
        let looming = s.define_input_role("looming", &(0u32..8).collect::<Vec<_>>());
        let escape = s.define_readout_role("escape", &(24u32..32).collect::<Vec<_>>());
        for _ in 0..400 {
            s.inject(looming, 1.5);
            s.step(1);
        }
        assert!(s.readout(escape) > 0.5, "escape readout was {}", s.readout(escape));
    }

    #[test]
    fn injection_into_role_not_addressed_is_ignored() {
        let mut s = fixture_core();
        let _looming = s.define_input_role("looming", &(0u32..8).collect::<Vec<_>>());
        s.inject(99, 5.0); // no such role
        s.step(1);
        assert!(s.activity_snapshot().iter().all(|&a| a == 0.0));
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test -p fly-sim sim::tests`
Expected: FAIL — `define_input_role` etc. undefined.

- [ ] **Step 3: Implement `roles.rs`**

`crates/fly-sim/src/core/roles.rs`:
```rust
#[derive(Default)]
pub struct Roles {
    input: Vec<(String, Vec<u32>)>,
    readout: Vec<(String, Vec<u32>)>,
}

impl Roles {
    pub fn new() -> Self {
        Self::default()
    }
    pub fn define_input(&mut self, name: &str, ids: &[u32]) -> u32 {
        self.input.push((name.to_string(), ids.to_vec()));
        (self.input.len() - 1) as u32
    }
    pub fn define_readout(&mut self, name: &str, ids: &[u32]) -> u32 {
        self.readout.push((name.to_string(), ids.to_vec()));
        (self.readout.len() - 1) as u32
    }
    pub fn input_neurons(&self, id: u32) -> &[u32] {
        self.input.get(id as usize).map(|r| r.1.as_slice()).unwrap_or(&[])
    }
    pub fn readout_neurons(&self, id: u32) -> &[u32] {
        self.readout.get(id as usize).map(|r| r.1.as_slice()).unwrap_or(&[])
    }
}
```

- [ ] **Step 4: Wire `Roles` into `SimCore`**

In `sim.rs`: add `use crate::core::roles::Roles;`, add field `roles: Roles,` to `SimCore`, initialise `roles: Roles::new(),` in `new()`, and add:
```rust
    pub fn define_input_role(&mut self, name: &str, neurons: &[u32]) -> u32 {
        self.roles.define_input(name, neurons)
    }
    pub fn define_readout_role(&mut self, name: &str, neurons: &[u32]) -> u32 {
        self.roles.define_readout(name, neurons)
    }
    pub fn inject(&mut self, role_id: u32, value: f32) {
        for &i in self.roles.input_neurons(role_id) {
            let i = i as usize;
            if i < self.n {
                self.input_cur[i] += value;
            }
        }
    }
    pub fn readout(&self, role_id: u32) -> f32 {
        let ids = self.roles.readout_neurons(role_id);
        if ids.is_empty() {
            return 0.0;
        }
        let sum: f32 = ids.iter().map(|&i| self.activity[i as usize]).sum();
        sum / ids.len() as f32
    }
    pub fn activity_snapshot(&self) -> Vec<f32> {
        self.activity[..self.active].to_vec()
    }
```

`crates/fly-sim/src/core/mod.rs`: add `pub mod roles;`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cargo test -p fly-sim && cargo clippy -p fly-sim -- -D warnings`
Expected: all PASS. If `sustained_looming_injection_drives_escape_readout` fails (`readout` too low), the fixture's `looming→escape` weight (`40`) or `W_NORM` (`0.01`) in `pipeline/gen_fixture.py` needs a bump; raise the weight to `60`, re-run `python pipeline/gen_fixture.py`, re-commit the fixture, re-run. Keep the assertion at `> 0.5`.

- [ ] **Step 6: Commit**

```bash
git add crates/fly-sim/src/core pipeline/out/fixture
git commit -m "feat: input/readout roles, inject, readout, activity snapshot"
```

---

## Task 7: `#[wasm_bindgen] Sim` wrapper + golden-trace lock

**Files:**
- Modify: `crates/fly-sim/src/lib.rs`
- Create: `crates/fly-sim/tests/golden_trace.rs`
- Create: `crates/fly-sim/tests/golden_trace.expected` (checked-in hash string)

**Interfaces:**
- Consumes: `core::sim::{SimCore, SimConfig}`, `core::format`, `core::lif::LifParams`, `crates/fly-sim/tests/fixtures.rs`.
- Produces: `#[wasm_bindgen] pub struct Sim` with:
  - `#[wasm_bindgen(constructor)] pub fn new(neurons: &[u8], graph: &[u8], seed: u64) -> Result<Sim, JsError>`
  - `pub fn set_active_count(&mut self, n: u32)`
  - `pub fn set_params(&mut self, dt_ms: f32, tau_m_ms: f32, v_threshold: f32, v_reset: f32, refrac_ms: f32, noise_sigma: f32)`
  - `pub fn define_input_role(&mut self, name: &str, neurons: &[u32]) -> u32`
  - `pub fn define_readout_role(&mut self, name: &str, neurons: &[u32]) -> u32`
  - `pub fn inject(&mut self, role_id: u32, value: f32)`
  - `pub fn step(&mut self, ticks: u32)`
  - `pub fn readout(&self, role_id: u32) -> f32`
  - `pub fn activity_snapshot(&self) -> Vec<f32>` (→ `Float32Array`)
  - `pub fn neuron_count(&self) -> u32`, `pub fn core_count(&self) -> u32`

- [ ] **Step 1: Write the failing golden-trace test**

`crates/fly-sim/tests/golden_trace.rs`:
```rust
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
    let mut cfg = SimConfig::default();
    cfg.seed = FIXTURE_SEED;
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
    assert_eq!(got, want, "trace changed; if intentional re-run with BLESS=1");
}

#[test]
fn trace_is_reproducible_within_a_run() {
    assert_eq!(run_trace(), run_trace());
}
```

Also make `core` modules reachable from integration tests — in `crates/fly-sim/src/lib.rs` change `mod core;` to `pub mod core;`.

- [ ] **Step 2: Run to verify it fails**

Run: `cargo test -p fly-sim --test golden_trace`
Expected: FAIL — `Sim`/paths or missing `golden_trace.expected`. (Compilation may fail first because `pub mod core;` / `Sim` not yet wired — that counts as red.)

- [ ] **Step 3: Implement the `Sim` wrapper**

Replace the body of `crates/fly-sim/src/lib.rs`:
```rust
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
        let gf = GraphFile::parse(graph)
            .map_err(|e| JsError::new(&format!("graph.bin: {e:?}")))?;
        if nf.count() != gf.n_nodes {
            return Err(JsError::new("neuron/graph node count mismatch"));
        }
        let mut cfg = SimConfig::default();
        cfg.seed = seed;
        Ok(Sim { inner: SimCore::new(&nf, &gf, cfg) })
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
            dt_ms, tau_m_ms, v_threshold, v_reset, refrac_ms, noise_sigma,
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
```

- [ ] **Step 4: Bless the golden trace, then verify it locks**

Run: `BLESS=1 cargo test -p fly-sim --test golden_trace golden_trace_is_stable`
Then: `cargo test -p fly-sim --test golden_trace`
Expected: both golden-trace tests PASS; `crates/fly-sim/tests/golden_trace.expected` now contains one 16-hex-digit line.

- [ ] **Step 5: Full gate**

Run:
```
cargo test -p fly-sim && \
cargo fmt --check && \
cargo clippy -p fly-sim --all-targets -- -D warnings && \
wasm-pack build crates/fly-sim --target web --dev && \
npm run test && npm run typecheck && npm run build && \
python -m pytest pipeline -q
```
Expected: everything green. `crates/fly-sim/pkg/fly_sim.d.ts` should list `Sim`, `sim_abi_version`.

- [ ] **Step 6: Commit**

```bash
git add crates/fly-sim/src/lib.rs crates/fly-sim/tests/golden_trace.rs crates/fly-sim/tests/golden_trace.expected
git commit -m "feat: wasm-bindgen Sim wrapper + golden-trace determinism lock"
```

---

## Task 8: TypeScript decoders (`src/formats/`)

**Files:**
- Create: `src/formats/neurons.ts`, `src/formats/graph.ts`, `src/formats/groups.ts`, `src/formats/index.ts`
- Create: `src/formats/formats.test.ts`
- Create: `src/formats/fixture.ts` (test loader)

**Interfaces:**
- Consumes: committed `pipeline/out/fixture/*` (read from disk in the vitest node env).
- Produces:
  - `neurons.ts`: `interface NeuronsFile { version: number; coreCount: number; count: number; ids: BigUint64Array; pos: Float32Array; groupId: Uint16Array; flags: Uint8Array }`, `function parseNeurons(buf: ArrayBuffer): NeuronsFile`, helpers `isCore(f: NeuronsFile, i: number): boolean` (bit0), `isInhibitory` (bit1), `isInput` (bit2), `isReadout` (bit3).
  - `graph.ts`: `interface GraphFile { version: number; nNodes: number; nEdges: number; wNorm: number; offsets: Uint32Array; targets: Uint32Array; weights: Int16Array }`, `function parseGraph(buf: ArrayBuffer): GraphFile`, `function* row(g: GraphFile, i: number): Generator<[number, number]>` yielding `[target, weight]`.
  - `groups.ts`: `interface GroupsFile { scaleFactor: number; groups: string[]; inputRoles: Record<string, number[]>; readoutRoles: Record<string, number[]> }`, `function parseGroups(json: unknown): GroupsFile`.
  - `index.ts` re-exports all three.
  - Parsers throw `Error` with a `code` property (`"BAD_MAGIC" | "TOO_SHORT" | "BAD_OFFSETS"`) on malformed input.

- [ ] **Step 1: Write the failing tests**

`src/formats/fixture.ts`:
```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("../../pipeline/out/fixture/", import.meta.url));

export function fixtureBuf(name: string): ArrayBuffer {
  const b = readFileSync(dir + name);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}
export function fixtureJson(name: string): unknown {
  return JSON.parse(readFileSync(dir + name, "utf8"));
}
```

`src/formats/formats.test.ts`:
```ts
import { expect, test } from "vitest";
import { parseNeurons, isCore, isInput, isReadout } from "./neurons";
import { parseGraph, row } from "./graph";
import { parseGroups } from "./groups";
import { fixtureBuf, fixtureJson } from "./fixture";

test("parseNeurons matches the fixture contract", () => {
  const n = parseNeurons(fixtureBuf("neurons.bin"));
  expect(n.count).toBe(500);
  expect(n.coreCount).toBe(48);
  for (let i = 0; i < 48; i++) expect(isCore(n, i)).toBe(true);
  for (let i = 48; i < 500; i++) expect(isCore(n, i)).toBe(false);
  for (let i = 0; i < 8; i++) expect(isInput(n, i)).toBe(true);
  for (let i = 24; i < 32; i++) expect(isReadout(n, i)).toBe(true);
  expect(n.pos.length).toBe(1500);
  expect([...n.pos].every(Number.isFinite)).toBe(true);
});

test("parseGraph yields valid CSR and the looming->escape wiring", () => {
  const g = parseGraph(fixtureBuf("graph.bin"));
  expect(g.nNodes).toBe(500);
  expect(g.offsets.length).toBe(501);
  expect(g.offsets[500]).toBe(g.nEdges);
  expect(g.wNorm).toBeGreaterThan(0);
  for (let i = 0; i < 500; i++) expect(g.offsets[i]! <= g.offsets[i + 1]!).toBe(true);
  expect([...g.targets].every((t) => t < 500)).toBe(true);
  for (let src = 0; src < 8; src++) {
    const tgts = new Set([...row(g, src)].map(([t]) => t));
    for (let esc = 24; esc < 32; esc++) expect(tgts.has(esc)).toBe(true);
  }
});

test("parseGroups reads roles", () => {
  const gr = parseGroups(fixtureJson("groups.json"));
  expect(gr.inputRoles.looming).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  expect(gr.readoutRoles.escape).toEqual([24, 25, 26, 27, 28, 29, 30, 31]);
  expect(gr.groups.length).toBeGreaterThan(0);
});

test("bad magic is rejected with a coded error", () => {
  const buf = fixtureBuf("neurons.bin");
  new Uint8Array(buf)[0] ^= 0xff;
  expect(() => parseNeurons(buf)).toThrowError(/magic/i);
});

test("truncated graph is rejected", () => {
  const buf = fixtureBuf("graph.bin").slice(0, 40);
  expect(() => parseGraph(buf)).toThrow();
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/formats/formats.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the parsers**

`src/formats/neurons.ts`:
```ts
const MAGIC = 0x464c594e; // "FLYN" little-endian read as u32 -> 0x4E594C46; DataView getUint32(le) gives 0x464c594e
const REC = 24;

export interface NeuronsFile {
  version: number;
  coreCount: number;
  count: number;
  ids: BigUint64Array;
  pos: Float32Array;
  groupId: Uint16Array;
  flags: Uint8Array;
}

function coded(message: string, code: string): Error {
  const e = new Error(message) as Error & { code: string };
  e.code = code;
  return e;
}

export function parseNeurons(buf: ArrayBuffer): NeuronsFile {
  if (buf.byteLength < 16) throw coded("neurons.bin too short", "TOO_SHORT");
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x4e594c46) throw coded("neurons.bin bad magic", "BAD_MAGIC");
  const version = dv.getUint32(4, true);
  const count = dv.getUint32(8, true);
  const coreCount = dv.getUint32(12, true);
  const need = 16 + count * REC;
  if (buf.byteLength < need) throw coded("neurons.bin truncated", "TOO_SHORT");

  const ids = new BigUint64Array(count);
  const pos = new Float32Array(count * 3);
  const groupId = new Uint16Array(count);
  const flags = new Uint8Array(count);
  for (let k = 0; k < count; k++) {
    const o = 16 + k * REC;
    ids[k] = dv.getBigUint64(o, true);
    pos[k * 3] = dv.getFloat32(o + 8, true);
    pos[k * 3 + 1] = dv.getFloat32(o + 12, true);
    pos[k * 3 + 2] = dv.getFloat32(o + 16, true);
    groupId[k] = dv.getUint16(o + 20, true);
    flags[k] = dv.getUint8(o + 22);
  }
  return { version, coreCount, count, ids, pos, groupId, flags };
}

export const isCore = (n: NeuronsFile, i: number) => (n.flags[i]! & 0b0001) !== 0;
export const isInhibitory = (n: NeuronsFile, i: number) => (n.flags[i]! & 0b0010) !== 0;
export const isInput = (n: NeuronsFile, i: number) => (n.flags[i]! & 0b0100) !== 0;
export const isReadout = (n: NeuronsFile, i: number) => (n.flags[i]! & 0b1000) !== 0;
```
(Delete the stray `MAGIC`/`coded`-duplicate const if clippy-of-TS, i.e. `tsc`, complains about the unused `MAGIC` — keep only the inline `0x4e594c46` check.)

`src/formats/graph.ts`:
```ts
export interface GraphFile {
  version: number;
  nNodes: number;
  nEdges: number;
  wNorm: number;
  offsets: Uint32Array;
  targets: Uint32Array;
  weights: Int16Array;
}

function coded(message: string, code: string): Error {
  const e = new Error(message) as Error & { code: string };
  e.code = code;
  return e;
}

export function parseGraph(buf: ArrayBuffer): GraphFile {
  if (buf.byteLength < 32) throw coded("graph.bin too short", "TOO_SHORT");
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x47594c46) throw coded("graph.bin bad magic", "BAD_MAGIC");
  const version = dv.getUint32(4, true);
  const nNodes = dv.getUint32(8, true);
  const nEdges = Number(dv.getBigUint64(16, true));
  const wNorm = dv.getFloat32(24, true);

  const offBytes = (nNodes + 1) * 4;
  const tgtBytes = nEdges * 4;
  const wtBytes = nEdges * 2;
  if (buf.byteLength < 32 + offBytes + tgtBytes + wtBytes)
    throw coded("graph.bin truncated", "TOO_SHORT");

  const offsets = new Uint32Array(buf.slice(32, 32 + offBytes));
  const targets = new Uint32Array(buf.slice(32 + offBytes, 32 + offBytes + tgtBytes));
  const weights = new Int16Array(buf.slice(32 + offBytes + tgtBytes, 32 + offBytes + tgtBytes + wtBytes));

  if (offsets[0] !== 0 || offsets[nNodes] !== nEdges) throw coded("graph.bin bad offsets", "BAD_OFFSETS");
  for (let i = 0; i < nNodes; i++)
    if (offsets[i]! > offsets[i + 1]!) throw coded("graph.bin non-monotonic offsets", "BAD_OFFSETS");

  return { version, nNodes, nEdges, wNorm, offsets, targets, weights };
}

export function* row(g: GraphFile, i: number): Generator<[number, number]> {
  const s = g.offsets[i]!;
  const e = g.offsets[i + 1]!;
  for (let k = s; k < e; k++) yield [g.targets[k]!, g.weights[k]!];
}
```
Note: `buf.slice(...)` copies; `new Uint32Array` needs a 4-byte-aligned start — offset 32 and the derived offsets are all multiples of 4, and `weights` at `32 + offBytes + tgtBytes` is a multiple of 2, so `Int16Array` is fine. Keep the `.slice()` copies (simplest correct thing).

`src/formats/groups.ts`:
```ts
export interface GroupsFile {
  scaleFactor: number;
  groups: string[];
  inputRoles: Record<string, number[]>;
  readoutRoles: Record<string, number[]>;
}

export function parseGroups(json: unknown): GroupsFile {
  const j = json as any;
  if (!j || typeof j !== "object") throw new Error("groups.json not an object");
  return {
    scaleFactor: Number(j.scale_factor ?? 1),
    groups: Array.isArray(j.groups) ? j.groups.map(String) : [],
    inputRoles: (j.roles?.input ?? {}) as Record<string, number[]>,
    readoutRoles: (j.roles?.readout ?? {}) as Record<string, number[]>,
  };
}
```

`src/formats/index.ts`:
```ts
export * from "./neurons";
export * from "./graph";
export * from "./groups";
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run src/formats && npx tsc --noEmit`
Expected: 5 tests PASS, typecheck clean. (If `tsc` flags the unused `MAGIC` const in `neurons.ts`, remove it.)

- [ ] **Step 5: Commit**

```bash
git add src/formats
git commit -m "feat: TypeScript decoders for neurons.bin / graph.bin / groups.json"
```

---

## Task 9: Plan-close — README status, doc sync, full green

**Files:**
- Modify: `README.md` (Status section)
- Create: `docs/manual-checklist.md` (stub for Plan 03)
- Modify: `docs/architecture.md` (note the Plan 01 module paths that now exist)

**Interfaces:** none.

- [ ] **Step 1: Update `README.md` Status**

Replace the Status section body with:
```md
Plan 01 (foundations + sim core) complete: repo toolchain, synthetic fixture,
Rust + TypeScript decoders, and a deterministic Rust→WASM LIF `Sim`
(`crates/fly-sim`) that steps the fixture with inject / readout / snapshot and a
golden-trace lock. Next: Plan 02 (app shell — worker bridge, brainviz, body,
world, sensing, UI, audio).
```

- [ ] **Step 2: Add the manual-checklist stub**

`docs/manual-checklist.md`:
```md
# Manual verification checklist

Filled in during Plan 02 / Plan 03. Target checks:

- [ ] Fly hovers stably with no stimulus (wing readout ≈ hover level).
- [ ] Neuron-count slider visibly changes reported sim Hz.
- [ ] An object placed in the flight path triggers a giant-fiber escape burst.
- [ ] A one-sided light induces a sustained turn toward / away from it.
```

- [ ] **Step 3: Sync `docs/architecture.md`**

Under the module map, add a line: "Implemented in Plan 01: `crates/fly-sim/src/core/{format,lif,rng,sim,roles}.rs`, `crates/fly-sim/src/lib.rs` (`Sim`), `src/formats/*.ts`, `pipeline/gen_fixture.py`."

- [ ] **Step 4: Full green gate**

Run:
```
cargo test -p fly-sim && cargo fmt --check && cargo clippy -p fly-sim --all-targets -- -D warnings && \
wasm-pack build crates/fly-sim --target web --dev && \
npm run test && npm run typecheck && npm run build && \
python -m pytest pipeline -q
```
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/manual-checklist.md docs/architecture.md
git commit -m "docs: close out Plan 01 foundations"
```

---

## Self-Review

**1. Spec coverage (against `docs/2026-09-09-design.md`):**
- §2 approach A "core + expandable shell" → `SimCore::set_active_count` clamps to `core_count`, edge traversal skips inactive targets (Task 5). ✅
- §3 system overview / offline→assets→browser → fixture generator (Task 2) + decoders (Tasks 3, 8). ✅ (real pipeline is Plan 03, explicitly out of scope here.)
- §5 sim core: LIF discrete step, leak factor, double-buffered input, seeded PRNG, exc/inh sign bit, determinism, WASM API surface → Tasks 4–7. ✅
- §5 `groups.json` role lists feeding `inject`/`readout` → Tasks 6, 8. ✅
- §11 testing: Rust LIF/CSR/exc-inh/golden-trace, TS binary parsers, determinism → Tasks 4–8. ✅
- §11 "looming ramp → escape crosses threshold" end-to-end test → `sustained_looming_injection_drives_escape_readout` (Task 6) + golden trace script (Task 7). ✅ (Full physics-level integration test lives in Plan 02 where `body/` exists.)
- §12 risk 4 "full-slider perf" / snapshot decimation → snapshot is `active`-length here; decimation deferred to the Plan 02 bridge (noted in Task 6 interface). ✅ acceptable — no behavioural impact.
- Out of scope by design: pipeline `fetch/filter/tier/core_circuit/emit_bin`, `SimBridge`/worker/ring buffer, `body/world/sensing/brainviz/audio/ui`, asset hosting, deploy. All assigned to Plans 02–03.

**2. Placeholder scan:** No "TBD"/"TODO"/"handle edge cases"/"similar to Task N". Every code step has literal code. Tuning fallbacks (fixture weight, `n_edges` fan-out) give exact values to change and exact commands to re-run. ✅

**3. Type consistency:**
- `integrate_one(v, refrac, input, &LifParams) -> (f32, bool, u16)` — same signature in Task 4 definition, Task 5 call site. ✅
- `SimCore::new(&NeuronsFile, &GraphFile, SimConfig)` — Task 5 def, Tasks 6/7 call sites match. ✅
- `SimConfig` fields `{ params, seed, activity_tau_ticks }` — set as `cfg.seed = …` in Tasks 5/6/7. ✅
- `define_input_role(&str, &[u32]) -> u32` / `define_readout_role` / `inject(u32, f32)` / `readout(u32) -> f32` / `activity_snapshot() -> Vec<f32>` — identical across `SimCore` (Task 6) and `Sim` wrapper (Task 7). ✅
- Rust `is_core/is_inhibitory/is_input/is_readout` bit0..bit3 ↔ TS `isCore/isInhibitory/isInput/isReadout` bit0..bit3 ↔ `gen_fixture.py` `FLAG_CORE=1/INHIB=2/INPUT=4/READOUT=8`. ✅
- Header layouts (16-byte neurons, 32-byte graph) identical in the "Binary formats" section, `gen_fixture.py` `struct.pack`, Rust `format.rs`, TS `neurons.ts`/`graph.ts`. ✅
- Magic: Rust `NEURONS_MAGIC = 0x4E594C46`; TS reads `dv.getUint32(0, true) === 0x4e594c46`; Python packs `struct.pack("<I", 0x4E594C46)`. Consistent (same LE u32). ✅
- `fixtures.rs` is `mod`-included by `golden_trace.rs` (`mod fixtures;`) — path `crates/fly-sim/tests/fixtures.rs` is a sibling, correct. ✅

No issues found requiring a fix.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-09-fly-playground-01-foundations.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
