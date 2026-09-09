// Browser boot: load the synthetic fixture, spin up the sim worker, build the
// brainviz + world + fly, and run the RAF loop. Not unit-tested (DOM + Worker)
// but must `tsc`-compile and `vite build`.

import neuronsUrl from "../pipeline/out/fixture/neurons.bin?url";
import graphUrl from "../pipeline/out/fixture/graph.bin?url";
import groupsJson from "../pipeline/out/fixture/groups.json";
import manifestJson from "../pipeline/out/fixture/manifest.json";

import "./ui/hud.css";

import { createSimBridge, type LifParams } from "./bridge/sim-bridge";
import * as sensing from "./sensing/sensing";
import { Body } from "./body/body";
import type { Vec3 } from "./body/types";
import { v } from "./body/types";
import { SCENE } from "./scene.config";
import { parseNeurons } from "./formats/neurons";
import { parseGraph } from "./formats/graph";
import { buildBrainPoints, buildCoreEdges, buildWorld } from "./viz/builders";
import { createRenderer } from "./viz/renderer";
import { Fly } from "./viz/fly";
import { updateFollowCamera } from "./viz/follow-camera";
import { CONFIG } from "./app/config";
import { worldQuery } from "./app/world-query";
import { Loop, type FrameView } from "./app/loop";
import { Hud } from "./ui/hud";
import type { HudControls, HudModel } from "./ui/controls";
import * as THREE from "three";
import type { BufferAttribute } from "three";

async function fetchBuffer(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to load ${url}: ${res.status}`);
  return res.arrayBuffer();
}

// Trailing-edge debounce — coalesces the LIF sliders' continuous `oninput`
// stream into one worker `setParams` hop after the drag settles.
function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number): (...a: A) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...a: A): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => fn(...a), ms);
  };
}

async function main(): Promise<void> {
  const canvas = document.getElementById("view") as HTMLCanvasElement;

  // 1. Fixture assets.
  const [neurons, graph] = await Promise.all([fetchBuffer(neuronsUrl), fetchBuffer(graphUrl)]);
  const scaleFactor = (manifestJson as { scale_factor?: number }).scale_factor ?? 1;

  // 2. Sim bridge over a module worker.
  const bridge = createSimBridge(
    () => new Worker(new URL("./bridge/sim.worker.ts", import.meta.url), { type: "module" }),
  );

  // 3. Parse the fixture buffers BEFORE init: both transports transfer
  //    `neurons`/`graph` to the worker via the postMessage transfer list, which
  //    detaches the source ArrayBuffers synchronously (byteLength -> 0).
  //    `parseNeurons` builds fresh typed arrays and `parseGraph` uses
  //    `buf.slice(...)`, so neither retains a view — the buffers can still be
  //    transferred unchanged after parsing.
  const neuronsFile = parseNeurons(neurons);
  const graphFile = parseGraph(graph);

  // 4. Init the sim on the fixture (transfers `neurons` + `graph` to the worker).
  const { nNeurons, coreCount, roleTable } = await bridge.init(
    { neurons, graph, groups: groupsJson },
    { seed: CONFIG.sim.seed, snapMax: CONFIG.sim.snapMax },
  );

  // --- Plan 02b: HUD ---
  // Edge-instrument DOM overlay. Only `setActiveCount` / `setPaused` are wired
  // this plan; the rest are no-op stubs until Tasks 8/9/10 implement them.
  const groups = [...new Set(neuronsFile.groupId)].sort((a, b) => a - b);
  let currentActiveCount = nNeurons;
  const savedTheme = (() => {
    try {
      const t = localStorage.getItem("fly-playground.theme");
      return t === "dark" || t === "light" ? t : null;
    } catch {
      return null;
    }
  })();
  const hudModel: HudModel = {
    coreCount,
    nNeurons,
    groups,
    lif: CONFIG.lif,
    scene: SCENE,
    theme: savedTheme ?? CONFIG.aesthetic.theme,
    reservedRect: CONFIG.hud.reservedRect,
  };
  // Plan 2c's docked panel sets `panelHandle.current`; a safe no-op until then.
  // A holder object (not a bare `let`) so the `setGroupVisible` closure keeps the
  // handle branch — an effectively-const `let` narrows its capture to null.
  const panelHandle: { current: { setGroupVisible(g: number, v: boolean): void } | null } = {
    current: null,
  };
  const setParamsDebounced = debounce((p: Partial<LifParams>) => bridge.setParams(p), 50);
  const controls: HudControls = {
    setActiveCount: (n) => {
      currentActiveCount = n;
      bridge.setActiveCount(n);
    },
    setPaused: (p) => (p ? bridge.pause() : bridge.resume()),
    setTheme: (t) => {
      hud.setTheme(t);
      try {
        localStorage.setItem("fly-playground.theme", t);
      } catch {
        /* storage unavailable */
      }
      // renderer.setTheme(t) — wired in Task 11
    },
    setParams: (p) => setParamsDebounced(p),
    setGroupVisible: (g, vis) => panelHandle.current?.setGroupVisible(g, vis),
    setMuted: () => {}, // Task 9
    setVolume: () => {}, // Task 9
    addObject: () => {}, // Task 10
    updateObject: () => {}, // Task 10
    removeObject: () => {}, // Task 10
    updateLight: () => {}, // Task 10
    resetScene: () => {}, // Task 10
  };
  const hud = new Hud(document.getElementById("hud")!, controls, hudModel);
  // --- end Plan 02b: HUD ---

  // 5. Renderer + brainviz + world + fly.
  const renderer = createRenderer(canvas);

  const points = buildBrainPoints(neuronsFile, scaleFactor);
  const edges = buildCoreEdges(graphFile, neuronsFile.coreCount);
  // Constraint #1: buildCoreEdges' geometry is index-only — share the point
  // cloud's position buffer so the LineSegments actually renders.
  edges.geometry.setAttribute("position", points.geometry.getAttribute("position"));

  // Brain point cloud + core edges share one position buffer, so they must
  // inherit one world transform — wrap them in a Group placed as a big fixed
  // object on the fly's cruise line (see CONFIG.aesthetic.brainCenter/Scale).
  const brain = new THREE.Group();
  brain.add(points, edges);
  const { brainCenter, brainScale } = CONFIG.aesthetic;
  brain.position.set(brainCenter.x, brainCenter.y, brainCenter.z);
  brain.scale.setScalar(brainScale);
  // 500 points — never worth culling, and culling was half of why it went missing.
  points.frustumCulled = false;

  const world3d = buildWorld(SCENE);
  const fly = new Fly();
  renderer.scene.add(brain, world3d, fly.object3d);

  const aActivity = points.geometry.getAttribute("aActivity") as BufferAttribute;
  const aActivityArr = aActivity.array as Float32Array;

  // 6. Body + collision world.
  const body = new Body(SCENE.fly.start, SCENE.fly.heading);
  const world = worldQuery(SCENE);

  // 7. Per-frame view sink.
  let camPos: Vec3 = v(
    SCENE.fly.start.x + CONFIG.camera.OFFSET.x,
    SCENE.fly.start.y + CONFIG.camera.OFFSET.y,
    SCENE.fly.start.z + CONFIG.camera.OFFSET.z,
  );
  let lastFrameMs = performance.now();

  // FrameView is frozen — Plan 2c's docked panel consumes { activity, readouts, sensory, paused }
  const onFrame = (view: FrameView): void => {
    const now = performance.now();
    const dt = Math.min((now - lastFrameMs) / 1000, CONFIG.loop.MAX_FRAME_DT);
    lastFrameMs = now;

    // Constraint #3: push per-neuron activity into the shader attribute.
    const n = Math.min(view.activity.length, aActivityArr.length);
    aActivityArr.set(view.activity.subarray(0, n));
    aActivity.needsUpdate = true;

    fly.update(view.readouts, view.pose, dt);

    const cam = updateFollowCamera(camPos, view.pose, dt);
    camPos = cam.position;
    renderer.camera.position.set(cam.position.x, cam.position.y, cam.position.z);
    renderer.camera.lookAt(cam.lookAt.x, cam.lookAt.y, cam.lookAt.z);

    // Plan 02b: HUD sink.
    hud.update({
      readouts: view.readouts,
      sensory: view.sensory,
      simHz: view.simHz,
      activeCount: currentActiveCount,
      paused: view.paused,
    });
    renderer.render();
  };

  const loop = new Loop({ bridge, body, sensing, roleTable, world, onFrame });

  // 8. Size to the viewport.
  const resize = (): void => renderer.resize(window.innerWidth, window.innerHeight);
  window.addEventListener("resize", resize);
  resize();

  // 9. Run the whole cloud.
  bridge.setActiveCount(nNeurons);
  loop.start();
}

main().catch((err) => {
  const hud = document.getElementById("hud");
  if (hud) hud.textContent = `boot failed: ${String(err)}`;
  throw err;
});
