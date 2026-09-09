// WebGL renderer shell. Everything is constructed inside `createRenderer` — the
// module has zero import-time side effects, so it is safe to import anywhere
// (including under vitest, though nothing here runs without a real canvas).

import * as THREE from "three";
import { PALETTE } from "./palette";

export interface Renderer {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  render(): void;
  resize(w: number, h: number): void;
  three: typeof THREE;
}

export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
  renderer.setSize(canvas.clientWidth || 1, canvas.clientHeight || 1, false);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.bg);
  scene.fog = new THREE.Fog(PALETTE.bg, 24, 90);

  const aspect = (canvas.clientWidth || 1) / (canvas.clientHeight || 1);
  const camera = new THREE.PerspectiveCamera(55, aspect, 0.1, 500);
  camera.position.set(-6, 3, 0);
  camera.lookAt(0, 0, 0);

  function render(): void {
    renderer.render(scene, camera);
  }

  function resize(w: number, h: number): void {
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
  }

  return { scene, camera, render, resize, three: THREE };
}
