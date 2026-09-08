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
