// Thin `three` wrappers: turn pure geometry data + scene config into renderable
// objects. No `WebGLRenderer` here — construction only.

import * as THREE from "three";
import type { NeuronsFile } from "../formats/neurons";
import type { GraphFile } from "../formats/graph";
import type { SceneConfig } from "../scene.config";
import { brainPositions, coreFlags, coreEdgePairs } from "./geometry";
import { makeBrainMaterial } from "./brain-material";
import { PALETTE, activePalette, material } from "./palette";
import { CONFIG } from "../app/config";
import type { Theme } from "../ui/controls";

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

/**
 * Ground plane: a radial disc that fades to nothing at the rim (§6.6 — this
 * replaces the reference grid, which the direction rejects on sight). The
 * falloff is baked as per-vertex alpha — `CircleGeometry` vertex 0 is the
 * centre, every other vertex sits on the rim — so no shader patch is needed.
 */
function groundDisc(theme: Theme): THREE.Mesh {
  const geom = new THREE.CircleGeometry(40, 64);
  const n = geom.getAttribute("position").count;
  const colors = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    colors[i * 4] = 1;
    colors[i * 4 + 1] = 1;
    colors[i * 4 + 2] = 1;
    colors[i * 4 + 3] = i === 0 ? 1 : 0;
  }
  geom.setAttribute("color", new THREE.BufferAttribute(colors, 4));

  const mat = new THREE.MeshBasicMaterial({
    color: activePalette(theme).ground,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  mat.userData.themeKey = "ground";

  const ground = new THREE.Mesh(geom, mat);
  ground.name = "ground-disc";
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  return ground;
}

/** Build the static world: object meshes, per-light `PointLight` + marker, a
 * radial ground disc, plus one **cool** `DirectionalLight` key and a
 * `HemisphereLight`. No grid — see `docs/2026-09-09-visual-direction.md` §6.6. */
export function buildWorld(scene: SceneConfig, theme: Theme = CONFIG.aesthetic.theme): THREE.Group {
  const group = new THREE.Group();
  const pal = activePalette(theme);

  for (const obj of scene.objects) {
    const mesh = new THREE.Mesh(geometryFor(obj.kind), material(obj.material, theme));
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

  // One cool key light, high up — the warm "sun" is gone; the only warm source
  // in the frame is the fly's ember (§6.5/§6.6).
  const key = new THREE.DirectionalLight(pal.keyLight, 0.6);
  key.position.set(10, 18, 6);
  group.add(key);

  group.add(new THREE.HemisphereLight(pal.bg, pal.ground, 0.4));

  group.add(groundDisc(theme));

  // NOTE: the dim `bounds` hairline (§6.6) has no mesh today — `SceneConfig.bounds`
  // is collision-only and was never built as `LineSegments`. Left as a follow-up
  // so the world's child count stays exactly what `builders.test.ts` asserts.

  return group;
}
