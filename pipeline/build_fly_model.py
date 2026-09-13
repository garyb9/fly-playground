"""Build the visual NeuroMechFly GLBs, independently of the neural data pipeline.

Python dependencies: numpy, trimesh, fast-simplification, PyYAML.
Run: python pipeline/build_fly_model.py --source /path/to/downloaded/files
Without --source, fetch pinned upstream files into pipeline/raw/fly-body.
"""

import argparse
import concurrent.futures
import hashlib
import json
from pathlib import Path
import struct
import urllib.request

import numpy as np
import trimesh
import yaml

REVISION = "38c8ec61034cd59bc5ba0de20688d4a3c0000d60"
BASE = f"https://raw.githubusercontent.com/NeLy-EPFL/flygym/{REVISION}/"
MODEL = "src/flygym/assets/model/neuromechfly/"
ROOT = Path(__file__).resolve().parents[1]
LINKS = ["coxa", "trochanterfemur", "tibia", *[f"tarsus{i}" for i in range(1, 6)]]


def hierarchy():
    parents = {"c_thorax": None, "c_head": "c_thorax"}

    def chain(parent, parts):
        for part in parts:
            parents[part] = parent
            parent = part

    chain("c_head", ["c_rostrum", "c_haustellum"])
    chain("c_thorax", [f"c_abdomen{i}" for i in [12, 3, 4, 5, 6]])
    for side in "lr":
        parents[f"{side}_eye"] = "c_head"
        chain("c_head", [f"{side}_{s}" for s in ["pedicel", "funiculus", "arista"]])
        for s in ["wing", "haltere"]:
            parents[f"{side}_{s}"] = "c_thorax"
        for leg in "fmh":
            chain("c_thorax", [f"{side}{leg}_{s}" for s in LINKS])
    return parents


def download(source):
    paths = {"LICENSE": "LICENSE", "rigging.yaml": MODEL + "rigging.yaml",
             "yaw_pitch_roll.yaml": MODEL + "pose/neutral/yaw_pitch_roll.yaml"}
    for part in hierarchy():
        part = "l" + part[1:] if part.startswith("r") else part
        paths[part + ".stl"] = MODEL + "meshes/simplified_max2000faces/" + part + ".stl"
    source.mkdir(parents=True, exist_ok=True)

    def fetch(item):
        name, path = item
        target = source / name
        if not target.exists():
            target.write_bytes(urllib.request.urlopen(BASE + path, timeout=60).read())

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(fetch, paths.items()))


def owner(part):
    if part.startswith("c_abdomen") or part.endswith("haltere"):
        return "c_thorax"
    if part in ["c_rostrum", "c_haustellum"] or part.endswith(("eye", "pedicel", "funiculus", "arista")):
        return "c_head"
    if "tarsus" in part:
        return part[:3] + "tarsus1"
    return part


def material(part):
    if part.endswith("eye"):
        return "eye"
    if part.endswith("wing"):
        return "wing"
    return "cuticle"


def importance(part):
    if part == "c_thorax" or part.endswith("eye"):
        return 3
    if part == "c_head" or "abdomen" in part:
        return 2
    if part.endswith("wing"):
        return 1.5
    if "tarsus" in part or part.endswith("arista"):
        return 0.25
    if part.endswith(("rostrum", "haustellum", "pedicel", "funiculus", "haltere")):
        return 0.4
    return 0.8


def normals(mesh):
    # Area-weighted normals without scipy's optional sparse-matrix dependency.
    triangles = mesh.vertices[mesh.faces]
    face = np.cross(triangles[:, 1] - triangles[:, 0], triangles[:, 2] - triangles[:, 0])
    result = np.zeros_like(mesh.vertices)
    for corner in range(3):
        np.add.at(result, mesh.faces[:, corner], face)
    result /= np.maximum(np.linalg.norm(result, axis=1, keepdims=True), 1e-12)
    return result


def wing_membrane(source, detailed):
    """Retain the scanned outline, replace the thick scan with a thin membrane.

    Intersect the source triangles with spanwise planes. This avoids cracks and
    overlapping transparent faces after decimating the original thin solid.
    Veins are authored visual details, not a reconstruction of measured veins.
    """
    triangles = source.vertices[source.faces]
    edges = triangles[:, [[0, 1], [1, 2], [2, 0]], :].reshape(-1, 2, 3)
    lo, hi = source.bounds[:, 1]
    rows = 28 if detailed else 12
    vertices = []
    for y in np.linspace(lo + 1e-5, hi - 1e-5, rows):
        valid = (edges[:, 0, 1] - y) * (edges[:, 1, 1] - y) < 0
        cuts = edges[valid]
        t = (y - cuts[:, 0, 1]) / (cuts[:, 1, 1] - cuts[:, 0, 1])
        points = cuts[:, 0] + t[:, None] * (cuts[:, 1] - cuts[:, 0])
        x0, x1 = points[:, 0].min(), points[:, 0].max()
        # A gentle camber provides highlights while keeping the surface single.
        z = 0.06 * np.sin(np.pi * (y - lo) / (hi - lo))
        vertices.extend([[x0, y, z], [(x0 + x1) / 2, y, z + 0.025], [x1, y, z]])
    faces = []
    for row in range(rows - 1):
        for col in range(2):
            a = row * 3 + col
            faces.extend([[a, a + 1, a + 3], [a + 1, a + 4, a + 3]])
    membrane = trimesh.Trimesh(vertices=vertices, faces=faces, process=False)
    veins = []
    if detailed:
        vertices = np.asarray(vertices).reshape(rows, 3, 3)
        for fraction in [0.18, 0.67]:
            path = vertices[:, 0] * (1 - fraction) + vertices[:, 2] * fraction
            path[:, 2] += 0.012
            for a, b in zip(path[1:-2], path[2:-1]):
                tube = trimesh.creation.cylinder(radius=0.006, sections=4, segment=[a, b])
                veins.append(tube)
        # One cross vein connects the two longitudinal veins.
        row = vertices[rows // 2]
        a, b = row[0] * 0.82 + row[2] * 0.18, row[0] * 0.33 + row[2] * 0.67
        a[2] += 0.012
        b[2] += 0.012
        veins.append(trimesh.creation.cylinder(radius=0.005, sections=4, segment=[a, b]))
    return membrane, trimesh.util.concatenate(veins) if veins else None


def colorize(mesh, part):
    color = np.tile([0.54, 0.32, 0.13, 1.0], (len(mesh.vertices), 1))
    if part.endswith("eye"):
        color[:] = [1, 1, 1, 1]
    elif part.endswith("wing"):
        color[:] = [1, 1, 1, 1]
    elif "abdomen" in part:
        x = mesh.vertices[:, 0]
        along = (x - x.min()) / max(float(np.ptp(x)), 1e-8)
        # Authored pigment bands on measured segment surfaces, not measured color.
        dark = along < (0.5 if part.endswith("6") else 0.26)
        color[dark, :3] = [0.095, 0.053, 0.025]
        color[~dark, :3] = [0.64, 0.39, 0.17]
    elif "_" in part and part.split("_")[0] in [s + l for s in "lr" for l in "fmh"]:
        color[:, :3] = [0.25, 0.13, 0.055]
    elif part.endswith("arista"):
        color[:, :3] = [0.11, 0.065, 0.035]
    # glTF vertex colors are linear; these artist colors above are sRGB.
    rgb = color[:, :3]
    color[:, :3] = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    return color.astype("<f4")


def build(source, output, budget):
    parents = hierarchy()
    rig = yaml.safe_load((source / "rigging.yaml").read_text())
    pose = yaml.safe_load((source / "yaw_pitch_roll.yaml").read_text())["joint_angles"]
    transforms, world, meshes = {}, {}, {}
    for part, parent in parents.items():
        left = "l" + part[1:] if part.startswith("r") else part
        spec = rig[left]
        transform = trimesh.transformations.quaternion_matrix(spec["quat"])
        transform[:3, 3] = spec["pos"] if parent else [0, 0, 0]
        # Upstream convention: yaw=X, pitch=Y, roll=Z, applied in that order.
        left_parent = "l" + parent[1:] if parent and parent.startswith("r") else parent
        for axis, vector in [("yaw", [1, 0, 0]), ("pitch", [0, 1, 0]), ("roll", [0, 0, 1])]:
            angle = pose.get(f"{left_parent}-{left}-{axis}", 0)
            transform = transform @ trimesh.transformations.rotation_matrix(np.deg2rad(angle), vector)
        if part.startswith("r"):
            mirror = np.diag([1, -1, 1, 1])
            transform = mirror @ transform @ mirror
        transforms[part] = transform
        world[part] = world[parent] @ transform if parent else transform
        mesh = trimesh.load(source / (left + ".stl"), force="mesh")
        mesh.apply_scale([1000, -1000 if part.startswith("r") else 1000, 1000])
        meshes[part] = mesh

    core = np.concatenate([trimesh.transform_points(meshes[p].vertices, world[p])
                           for p in parents if p in ["c_thorax", "c_head"] or p.startswith("c_abdomen")])
    all_vertices = np.concatenate([trimesh.transform_points(m.vertices, world[p]) for p, m in meshes.items()])
    scale = 1.5 / float(np.ptp(core[:, 0]))
    root = trimesh.transformations.rotation_matrix(-np.pi / 2, [1, 0, 0])
    root[:3, :3] *= scale
    root[0, 3] = -float(core[:, 0].min() + core[:, 0].max()) * scale / 2 - 0.15
    # Neutral lowest foot meets the existing sphere's support plane at y=-0.25.
    root[1, 3] = -0.25 - float(all_vertices[:, 2].min()) * scale
    center = trimesh.transform_points(np.array([(core.min(axis=0) + core.max(axis=0)) / 2]), root)[0]

    owners = list(dict.fromkeys(owner(p) for p in parents))
    nodes = [{"name": "NeuroMechFly", "matrix": root.T.flatten().tolist(),
              "children": [1], "extras": {"cameraCenter": center.tolist(), "sourceRevision": REVISION}}]
    indices = {p: i + 1 for i, p in enumerate(owners)}
    for part in owners:
        nodes.append({"name": part, "matrix": transforms[part].T.flatten().tolist(), "children": []})
        if parents[part]:
            nodes[indices[owner(parents[part])]]["children"].append(indices[part])

    gltf = {"asset": {"version": "2.0", "generator": "fly-playground build_fly_model.py",
                       "copyright": "NeLy-EPFL / NeuroMechFly, Apache-2.0; see ATTRIBUTION.md"},
            "scene": 0, "scenes": [{"nodes": [0]}], "nodes": nodes, "meshes": [],
            "accessors": [], "bufferViews": [], "materials": [
                {"name": "cuticle", "pbrMetallicRoughness": {"metallicFactor": 0, "roughnessFactor": 0.68}},
                {"name": "eye", "pbrMetallicRoughness": {"baseColorFactor": [0.24, 0.012, 0.018, 1], "metallicFactor": 0, "roughnessFactor": 0.3}},
                {"name": "wing", "doubleSided": True, "alphaMode": "BLEND", "pbrMetallicRoughness": {"baseColorFactor": [0.7, 0.8, 0.9, 0.25], "metallicFactor": 0, "roughnessFactor": 0.35}},
                {"name": "vein", "pbrMetallicRoughness": {"baseColorFactor": [0.12, 0.09, 0.055, 1], "metallicFactor": 0, "roughnessFactor": 0.7}}]}
    binary = bytearray()

    def accessor(data, kind, component=5126):
        data = np.ascontiguousarray(data, dtype="<u4" if component == 5125 else "<f4")
        while len(binary) % 4:
            binary.append(0)
        offset = len(binary)
        binary.extend(data.tobytes())
        view = len(gltf["bufferViews"])
        gltf["bufferViews"].append({"buffer": 0, "byteOffset": offset, "byteLength": data.nbytes})
        item = {"bufferView": view, "componentType": component, "count": len(data), "type": kind}
        if kind == "VEC3":
            item.update(min=data.min(axis=0).tolist(), max=data.max(axis=0).tolist())
        gltf["accessors"].append(item)
        return len(gltf["accessors"]) - 1

    total_source = sum(len(m.faces) * importance(p) for p, m in meshes.items())
    groups = {}
    total = 0
    for part, mesh in meshes.items():
        target = max(24, int(len(mesh.faces) * importance(part) * budget / total_source))
        if part.endswith("wing"):
            # Build the left membrane once in its source frame, then reflect.
            original = trimesh.load(source / "l_wing.stl", force="mesh")
            original.apply_scale(1000)
            reduced, veins = wing_membrane(original, budget > 10000)
            if part.startswith("r"):
                reduced.apply_scale([1, -1, 1])
                if veins is not None:
                    veins.apply_scale([1, -1, 1])
            if veins is not None:
                groups.setdefault((owner(part), "vein"), []).append((veins, np.ones((len(veins.vertices), 4), dtype="<f4")))
        else:
            reduced = mesh.simplify_quadric_decimation(face_count=target)
        colors = colorize(reduced, part)
        reduced.apply_transform(np.linalg.inv(world[owner(part)]) @ world[part])
        groups.setdefault((owner(part), material(part)), []).append((reduced, colors))
    for part in owners:
        primitives = []
        for mat in ["cuticle", "eye", "wing", "vein"]:
            pieces = groups.get((part, mat), [])
            if not pieces:
                continue
            merged = trimesh.util.concatenate([m for m, _ in pieces])
            total += len(merged.faces)
            colors = np.concatenate([c for _, c in pieces])
            primitives.append({"attributes": {"POSITION": accessor(merged.vertices, "VEC3"),
                                                "NORMAL": accessor(normals(merged), "VEC3"),
                                                "COLOR_0": accessor(colors, "VEC4")},
                               "indices": accessor(merged.faces.flatten(), "SCALAR", 5125),
                               "material": ["cuticle", "eye", "wing", "vein"].index(mat)})
        nodes[indices[part]]["mesh"] = len(gltf["meshes"])
        gltf["meshes"].append({"name": part, "primitives": primitives})
    gltf["buffers"] = [{"byteLength": len(binary)}]
    json_bytes = json.dumps(gltf, separators=(",", ":")).encode()
    json_bytes += b" " * (-len(json_bytes) % 4)
    binary += b"\0" * (-len(binary) % 4)
    data = struct.pack("<III", 0x46546C67, 2, 28 + len(json_bytes) + len(binary))
    data += struct.pack("<II", len(json_bytes), 0x4E4F534A) + json_bytes
    data += struct.pack("<II", len(binary), 0x004E4942) + binary
    output.write_bytes(data)
    return {"file": output.name, "triangles": total, "meshes": len(gltf["meshes"]),
            "primitives": sum(len(m["primitives"]) for m in gltf["meshes"]),
            "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(), "cameraCenter": center.tolist()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path)
    args = parser.parse_args()
    source = args.source or ROOT / "pipeline/raw/fly-body"
    if not args.source:
        download(source)
    output = ROOT / "public/models/fly"
    output.mkdir(parents=True, exist_ok=True)
    results = [build(source, output / f"fly-{name}.glb", budget)
               for name, budget in [("near", 22000), ("far", 5000)]]
    (output / "LICENSE-NeuroMechFly.txt").write_bytes((source / "LICENSE").read_bytes())
    (output / "manifest.json").write_text(json.dumps({"revision": REVISION, "assets": results,
        "inputs": {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(source.iterdir())
                   if p.suffix == ".stl" or p.name in ["rigging.yaml", "yaw_pitch_roll.yaml", "LICENSE"]}}, indent=2) + "\n")
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
