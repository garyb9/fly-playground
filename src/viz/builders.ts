// Thin `three` wrappers: turn pure geometry data + scene config into renderable
// objects. No `WebGLRenderer` here — construction only.

import * as THREE from "three";
import type { NeuronsFile } from "../formats/neurons";
import type { GraphFile } from "../formats/graph";
import type { SceneConfig } from "../scene.config";
import { brainPositions, coreFlags, coreEdgePairs } from "./geometry";
import { makeBrainMaterial } from "./brain-material";
import { PALETTE, material } from "./palette";

/** Point cloud for the whole brain. `aActivity` starts at zero (driven later). */
export function buildBrainPoints(neurons: NeuronsFile, scaleFactor: number): THREE.Points {
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(brainPositions(neurons, scaleFactor), 3));
  geom.setAttribute("aCore", new THREE.BufferAttribute(coreFlags(neurons), 1));
  geom.setAttribute("aActivity", new THREE.BufferAttribute(new Float32Array(neurons.count), 1));
  return new THREE.Points(geom, makeBrainMaterial());
}

/**
 * Line segments for the core-core subgraph. Geometry carries only the index
 * buffer (endpoint pairs); the position attribute is bound by the consumer that
 * shares the brain point cloud's buffer.
 */
export function buildCoreEdges(graph: GraphFile, coreCount: number): THREE.LineSegments {
  const pairs = coreEdgePairs(graph, coreCount);
  const geom = new THREE.BufferGeometry();
  geom.setIndex(new THREE.BufferAttribute(Uint32Array.from(pairs), 1));
  const mat = new THREE.LineBasicMaterial({
    color: PALETTE.edge,
    transparent: true,
    opacity: 0.35,
  });
  return new THREE.LineSegments(geom, mat);
}

function geometryFor(kind: SceneConfig["objects"][number]["kind"]): THREE.BufferGeometry {
  switch (kind) {
    case "box":
      return new THREE.BoxGeometry(1, 1, 1);
    case "sphere":
      return new THREE.SphereGeometry(0.5, 24, 16);
    case "torus":
      return new THREE.TorusGeometry(0.5, 0.2, 16, 32);
  }
}

/** Build the static world: object meshes, per-light `PointLight` + marker, plus
 * one warm `DirectionalLight` and a `HemisphereLight`. */
export function buildWorld(scene: SceneConfig): THREE.Group {
  const group = new THREE.Group();

  for (const obj of scene.objects) {
    const mesh = new THREE.Mesh(geometryFor(obj.kind), material(obj.material));
    mesh.position.set(obj.position.x, obj.position.y, obj.position.z);
    mesh.rotation.set(obj.rotation.x, obj.rotation.y, obj.rotation.z);
    mesh.scale.set(obj.scale.x, obj.scale.y, obj.scale.z);
    group.add(mesh);
  }

  for (const light of scene.lights) {
    const pl = new THREE.PointLight(light.color, light.intensity);
    pl.position.set(light.position.x, light.position.y, light.position.z);
    group.add(pl);

    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 12, 8),
      new THREE.MeshBasicMaterial({ color: light.color }),
    );
    marker.position.copy(pl.position);
    group.add(marker);
  }

  const sun = new THREE.DirectionalLight(0xfff1d0, 1.1);
  sun.position.set(10, 18, 6);
  group.add(sun);

  group.add(new THREE.HemisphereLight(PALETTE.bg, PALETTE.ground, 0.6));

  return group;
}
