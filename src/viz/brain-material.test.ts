import { expect, test } from "vitest";
import * as THREE from "three";
import { makeBrainMaterial } from "./brain-material";

test("brain material is opaque normal-blended ink so dark points read on the light ground", () => {
  const mat = makeBrainMaterial();
  expect(mat.blending).toBe(THREE.NormalBlending);
  expect(mat.transparent).toBe(false);
  expect(mat.depthWrite).toBe(true);
});

test("brain material exposes the size/colour uniforms the shader and per-frame update need", () => {
  const { uniforms } = makeBrainMaterial();
  for (const name of ["uBaseSize", "uCoreSize", "uSwell", "uScale", "uMaxSize", "uCold", "uHot"]) {
    expect(uniforms[name]).toBeDefined();
  }
});
