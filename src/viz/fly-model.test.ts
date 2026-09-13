import { readFile } from "node:fs/promises";
import { beforeAll, expect, test } from "vitest";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { AnatomicalFly } from "./fly-model";

let templates: THREE.Group[];
beforeAll(async () => {
  templates = await Promise.all(
    ["near", "far"].map(async (level) => {
      const bytes = await readFile(
        new URL(`../../public/models/fly/fly-${level}.glb`, import.meta.url),
      );
      return (
        await new GLTFLoader().parseAsync(
          bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
          "",
        )
      ).scene;
    }),
  );
});

test("both LODs load with finite geometry, matching hinges, and bounded complexity", () => {
  const counts: number[] = [];
  for (const template of templates) {
    let triangles = 0;
    template.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const position = o.geometry.getAttribute("position");
      expect(Array.from(position.array).every(Number.isFinite)).toBe(true);
      expect(o.geometry.getAttribute("normal").count).toBe(position.count);
      expect(o.geometry.getAttribute("color").count).toBe(position.count);
      triangles += (o.geometry.index?.count ?? position.count) / 3;
    });
    counts.push(triangles);
    for (const name of ["l_wing", "r_wing", "lf_coxa", "rf_tibia", "lh_tarsus1", "rh_tarsus1"]) {
      expect(template.getObjectByName(name)).toBeDefined();
    }
  }
  expect(counts[0]).toBeLessThan(25000);
  expect(counts[1]).toBeLessThan(6000);
  for (const name of ["l_wing", "r_wing", "lf_coxa", "rh_tarsus1"]) {
    expect(templates[0]!.getObjectByName(name)!.matrix.elements).toEqual(
      templates[1]!.getObjectByName(name)!.matrix.elements,
    );
  }
});

test("flies share geometry but preserve independent color and articulated poses", () => {
  const a = new AnatomicalFly(templates),
    b = new AnatomicalFly(templates);
  const wingA = a.root.getObjectByName("l_wing")!;
  const wingB = b.root.getObjectByName("l_wing")!;
  const meshA = wingA.children.find((c) => c instanceof THREE.Mesh) as THREE.Mesh;
  const meshB = wingB.children.find((c) => c instanceof THREE.Mesh) as THREE.Mesh;
  expect(meshA.geometry).toBe(meshB.geometry);
  expect(meshA.material).not.toBe(meshB.material);
  const rest = wingB.quaternion.clone();
  a.update(0.8, 0.1, { supported: false, speed: 0 });
  expect(wingA.quaternion.angleTo(rest)).toBeGreaterThan(0.1);
  expect(wingB.quaternion.angleTo(rest)).toBeLessThan(1e-7);
  a.setStyle("light", "#00ff00");
  expect(
    (meshA.material as THREE.MeshStandardMaterial).color.equals(
      (meshB.material as THREE.MeshStandardMaterial).color,
    ),
  ).toBe(false);
  let disposed = false;
  meshB.geometry.addEventListener("dispose", () => {
    disposed = true;
  });
  a.dispose();
  expect(disposed).toBe(false);
  b.dispose();
});
test("left front leg neural activity changes that limb without moving the opposite leg or body", () => {
  const driven = new AnatomicalFly(templates),
    control = new AnatomicalFly(templates);
  driven.update(0, 0.1, { supported: true, speed: 0, legs: { leg_lf: 0.8 } });
  control.update(0, 0.1, { supported: true, speed: 0, legs: { leg_lf: 0 } });
  expect(
    driven.root
      .getObjectByName("lf_tibia")!
      .quaternion.angleTo(control.root.getObjectByName("lf_tibia")!.quaternion),
  ).toBeGreaterThan(0.5);
  expect(
    driven.root
      .getObjectByName("rf_tibia")!
      .quaternion.angleTo(control.root.getObjectByName("rf_tibia")!.quaternion),
  ).toBeLessThan(1e-7);
  expect(driven.root.position).toEqual(control.root.position);
  driven.dispose();
  control.dispose();
});

test("perching restores folded wings without shifting the root or camera center", () => {
  const model = new AnatomicalFly(templates);
  const root = model.root.matrix.clone(),
    center = model.center.clone();
  model.update(0.8, 0.1, { supported: false, speed: 0 });
  for (let i = 0; i < 120; i++) model.update(0, 1 / 60, { supported: true, speed: 0 });
  const wing = model.root.getObjectByName("l_wing")!;
  expect(wing.quaternion.angleTo(templates[0]!.getObjectByName("l_wing")!.quaternion)).toBeLessThan(
    1e-5,
  );
  expect(model.center.equals(center)).toBe(true);
  expect(model.root.matrix.equals(root)).toBe(true);
  model.dispose();
});

test("left and right wing surfaces remain mirrored through the flight stroke", () => {
  const model = new AnatomicalFly(templates);
  for (const flap of [-0.8, 0, 0.8]) {
    model.update(flap, 0.1, { supported: false, speed: 0 });
    model.root.updateMatrixWorld(true);
    const left = new THREE.Box3().setFromObject(model.root.getObjectByName("l_wing")!);
    const right = new THREE.Box3().setFromObject(model.root.getObjectByName("r_wing")!);
    expect(left.min.x).toBeCloseTo(right.min.x, 5);
    expect(left.max.y).toBeCloseTo(right.max.y, 5);
    expect(left.min.z).toBeCloseTo(-right.max.z, 5);
    expect(left.max.z).toBeCloseTo(-right.min.z, 5);
  }
  model.dispose();
});
