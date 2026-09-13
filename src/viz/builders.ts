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
      return new THREE.BoxGeometry(2, 2, 2);
    case "flower":
      return new THREE.SphereGeometry(1, 12, 8);
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
    if (obj.kind === "flower") {
      const flower = new THREE.Group();
      flower.name = obj.id;
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.065, obj.scale.y, 6),
        new THREE.MeshStandardMaterial({ color: 0x527c67, roughness: 0.85 }),
      );
      stem.position.y = -obj.scale.y / 2;
      flower.add(stem);
      const color = { rose: 0xe797ad, lilac: 0xb5a1ec, gold: 0xefc777 }[obj.material] ?? 0xe797ad;
      for (let p = 0; p < 6; p++) {
        const angle = (p * Math.PI) / 3;
        const petal = new THREE.Mesh(
          new THREE.SphereGeometry(1, 10, 6),
          new THREE.MeshStandardMaterial({
            color,
            emissive: color,
            emissiveIntensity: 0.12,
            roughness: 0.7,
          }),
        );
        petal.scale.set(obj.scale.x * 0.55, obj.scale.x * 0.22, obj.scale.x * 0.32);
        petal.rotation.y = -angle;
        petal.position.set(
          Math.cos(angle) * obj.scale.x * 0.45,
          0,
          Math.sin(angle) * obj.scale.x * 0.45,
        );
        flower.add(petal);
      }
      const center = new THREE.Mesh(
        new THREE.SphereGeometry(obj.scale.x * 0.25, 10, 6),
        new THREE.MeshStandardMaterial({ color: 0xffdf8c }),
      );
      flower.add(center);
      flower.position.set(obj.position.x, obj.position.y, obj.position.z);
      group.add(flower);
      continue;
    }
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

  // Distant cool illumination keeps the habitat readable without a bright lamp.
  const key = new THREE.DirectionalLight(pal.keyLight, 0.6);
  key.position.set(10, 18, 6);
  group.add(key);

  const fill = new THREE.DirectionalLight(pal.keyLight, 0.65);
  fill.name = "distant-fill";
  fill.position.set(-30, 40, -25);
  group.add(fill);
  group.add(new THREE.HemisphereLight(pal.skyLight, pal.groundLight, 0.55));

  group.add(groundDisc(theme));

  // NOTE: the dim `bounds` hairline (§6.6) has no mesh today — `SceneConfig.bounds`
  // is collision-only and was never built as `LineSegments`. Left as a follow-up
  // so the world's child count stays exactly what `builders.test.ts` asserts.

  return group;
}
