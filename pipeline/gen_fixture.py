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
