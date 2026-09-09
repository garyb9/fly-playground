// WebGL renderer shell. Everything is constructed inside `createRenderer` — the
// module has zero import-time side effects, so it is safe to import anywhere
// (including under vitest, though nothing here runs without a real canvas).

import * as THREE from "three";
import { activePalette, applyTheme } from "./palette";
import { CONFIG } from "../app/config";
import type { Theme } from "../ui/controls";
import type { PostStack } from "./post";

const FOG_NEAR = 24;
const FOG_FAR = 90;

export interface Renderer {
  /** The underlying `WebGLRenderer` — only `buildComposer` needs it. */
  gl: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Draws through the composer when one is set, else straight to the canvas. */
  render(dt?: number): void;
  resize(w: number, h: number): void;
  /** Route rendering through a post-FX stack (`buildComposer`). */
  setComposer(c: PostStack): void;
  /** Swap background/fog and recolour every `userData.themeKey`-tagged material. */
  setTheme(theme: Theme): void;
  three: typeof THREE;
}

export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = CONFIG.aesthetic.EXPOSURE;
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
  renderer.setSize(canvas.clientWidth || 1, canvas.clientHeight || 1, false);

  const pal = activePalette(CONFIG.aesthetic.theme);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(pal.bg);
  scene.fog = new THREE.Fog(pal.abyss, FOG_NEAR, FOG_FAR);

  const aspect = (canvas.clientWidth || 1) / (canvas.clientHeight || 1);
  const camera = new THREE.PerspectiveCamera(55, aspect, 0.1, 500);
  camera.position.set(-6, 3, 0);
  camera.lookAt(0, 0, 0);

  let composer: PostStack | undefined;

  function render(dt?: number): void {
    if (composer) composer.render(dt);
    else renderer.render(scene, camera);
  }

  function resize(w: number, h: number): void {
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
    composer?.setSize(w, h);
  }

  function setComposer(c: PostStack): void {
    composer = c;
  }

  function setTheme(theme: Theme): void {
    const p = activePalette(theme);
    scene.background = new THREE.Color(p.bg);
    scene.fog = new THREE.Fog(p.abyss, FOG_NEAR, FOG_FAR);
    applyTheme(scene, theme);
    composer?.setTheme(theme);
  }

  return { gl: renderer, scene, camera, render, resize, setComposer, setTheme, three: THREE };
}
