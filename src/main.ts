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
import { SCENE, type SceneConfig } from "./scene.config";
import { createSceneStore } from "./world/scene-store";
import { loadScene, saveScene } from "./world/scene-persist";
import { parseNeurons } from "./formats/neurons";
import { parseGraph } from "./formats/graph";
import { buildBrainPoints, buildCoreEdges, buildWorld } from "./viz/builders";
import { createRenderer } from "./viz/renderer";
import { buildComposer } from "./viz/post";
import { Fly } from "./viz/fly";
import { updateFollowCamera } from "./viz/follow-camera";
import { bob, idleSway, escapeKick, loadEnvelope } from "./viz/motion";
import { detectEscapeOnset } from "./audio/mapping";
import { CONFIG } from "./app/config";
import { worldQuery } from "./app/world-query";
import { Loop, type FrameView } from "./app/loop";
import { Hud } from "./ui/hud";
import type { HudControls, HudModel, Theme } from "./ui/controls";
import { AudioEngine } from "./audio/audio";
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

  // --- Plan 02b: world editing ---
  // The static `SCENE` is now runtime-mutable. A persisted scene (localStorage)
  // wins over the compiled default; `store` mutations flow through `subscribe`
  // below (rebuild world3d + collision query + HUD editor, then debounced save).
  // A malformed persisted scene (an object missing `position` / `scale`) throws
  // inside `buildWorld` / `worldQuery` at boot, and the store re-persists on
  // every edit so there is no self-heal — the app stays bricked until site data
  // is cleared. Validate the persisted scene with the cheap, pure `worldQuery`
  // pass; on any throw, fall back to the compiled `SCENE` and drop the bad blob.
  const persistedScene = loadScene();
  let initialScene: SceneConfig = persistedScene ?? SCENE;
  if (persistedScene) {
    try {
      worldQuery(persistedScene);
    } catch (err) {
      console.warn("fly-playground: discarding malformed persisted scene", err);
      initialScene = SCENE;
      try {
        localStorage.removeItem("fly-playground.scene.v1");
      } catch {
        /* storage unavailable */
      }
    }
  }
  const store = createSceneStore(initialScene);
  const saveDebounced = debounce((s: SceneConfig) => saveScene(s), 300);
  // --- end Plan 02b: world editing ---

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
  // Plan 02b aesthetic: the live theme — seeded from localStorage, swapped by
  // `controls.setTheme`, and read whenever the world is rebuilt.
  let currentTheme: Theme = savedTheme ?? CONFIG.aesthetic.theme;
  const hudModel: HudModel = {
    coreCount,
    nNeurons,
    groups,
    lif: CONFIG.lif,
    scene: initialScene,
    theme: currentTheme,
    reservedRect: CONFIG.hud.reservedRect,
  };
  // Plan 2c's docked panel sets `panelHandle.current`; a safe no-op until then.
  // A holder object (not a bare `let`) so the `setGroupVisible` closure keeps the
  // handle branch — an effectively-const `let` narrows its capture to null.
  const panelHandle: { current: { setGroupVisible(g: number, v: boolean): void } | null } = {
    current: null,
  };
  const setParamsDebounced = debounce((p: Partial<LifParams>) => bridge.setParams(p), 50);
  // --- Plan 02b: audio --- lazily builds its AudioContext on the first
  // setMuted(false) (unchecking the HUD mute box is the required user gesture).
  const audio = new AudioEngine();
  const controls: HudControls = {
    setActiveCount: (n) => {
      currentActiveCount = n;
      bridge.setActiveCount(n);
    },
    setPaused: (p) => (p ? bridge.pause() : bridge.resume()),
    setTheme: (t) => {
      currentTheme = t;
      hud.setTheme(t);
      renderer.setTheme(t);
      fly.setTheme(t);
      try {
        localStorage.setItem("fly-playground.theme", t);
      } catch {
        /* storage unavailable */
      }
    },
    setParams: (p) => setParamsDebounced(p),
    setGroupVisible: (g, vis) => panelHandle.current?.setGroupVisible(g, vis),
    setMuted: (b) => audio.setMuted(b),
    setVolume: (v) => audio.setVolume(v),
    addObject: (spec) => {
      const p = body.pose().position;
      store.addObject({
        ...spec,
        position: { x: p.x, y: p.y, z: p.z },
        rotation: v(0, 0, 0),
        scale: v(1, 1, 1),
      });
    },
    updateObject: (id, patch) => store.updateObject(id, patch),
    removeObject: (id) => store.removeObject(id),
    updateLight: (i, patch) => store.updateLight(i, patch),
    resetScene: () => {
      store.reset();
      try {
        localStorage.removeItem("fly-playground.scene.v1");
      } catch {
        /* storage unavailable */
      }
    },
  };
  const hud = new Hud(document.getElementById("hud")!, controls, hudModel);
  hud.syncScene(initialScene);
  // --- end Plan 02b: HUD ---

  // 5. Renderer + brainviz + world + fly.
  const renderer = createRenderer(canvas);

  // --- Plan 02b: aesthetic ---
  // "Deep Field" post-FX (§6.2): render → bloom → vignette → grain. Tone
  // mapping + exposure live on the WebGLRenderer itself (`createRenderer`).
  // Bloom selectivity rides on the luminance THRESHOLD for now — matte buoys and
  // the ground stay well below it; a bloom layer is Task 12's call if needed.
  const composer = buildComposer(renderer.gl, renderer.scene, renderer.camera);
  renderer.setComposer(composer);
  // --- end Plan 02b: aesthetic ---

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

  let world3d = buildWorld(initialScene, currentTheme);
  const fly = new Fly(currentTheme);
  renderer.scene.add(brain, world3d, fly.object3d);

  const aActivity = points.geometry.getAttribute("aActivity") as BufferAttribute;
  const aActivityArr = aActivity.array as Float32Array;

  // 6. Body + collision world.
  const body = new Body(initialScene.fly.start, initialScene.fly.heading);
  const world = worldQuery(initialScene);

  // 7. Per-frame view sink.
  let camPos: Vec3 = v(
    initialScene.fly.start.x + CONFIG.camera.OFFSET.x,
    initialScene.fly.start.y + CONFIG.camera.OFFSET.y,
    initialScene.fly.start.z + CONFIG.camera.OFFSET.z,
  );
  let lastFrameMs = performance.now();

  // --- Plan 02b: motion + load ---
  // Render-only motion (§5) + the boot load sequence. Nothing here touches
  // `body` or the sim — every offset is applied to the three.js transforms after
  // the physics step, so pausing or reduced-motion changes nothing but looks.
  const reduced =
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  const bannerEl = document.getElementById("boot-banner");
  const bannerText = bannerEl?.textContent ?? "";
  const hudRoot = document.getElementById("hud");
  // The ember's constructed intensity is the "fully lit" reference — read once
  // so the ignite ramp and the escape spike stay relative to `fly.ts`'s value.
  const emberBase = fly.emberLight.intensity;
  // Peak escape bloom = emberBase * (1 + ESCAPE_EMBER_GAIN); decays with the kick.
  const ESCAPE_EMBER_GAIN = 1.5;
  // Collision shudder: the same curve, half the shove and half the window.
  const COLLISION_KICK = {
    posShove: CONFIG.aesthetic.ESCAPE_KICK.posShove * 0.5,
    rollDeg: CONFIG.aesthetic.ESCAPE_KICK.rollDeg * 0.5,
    decayS: CONFIG.aesthetic.ESCAPE_KICK.decayS * 0.5,
  };

  let bootT = 0;
  let bannerShown = -1; // last rendered character count, so we only touch the DOM on change
  let bannerDone = false;
  let hudFaded = false; // stop rewriting #hud opacity once it has settled at 1
  let firstFrame = true; // no collision shudder off the seed frame (prevProx starts at 0)
  // One kick slot: an escape outranks a collision shudder while it is running.
  let kickCfg: { posShove: number; rollDeg: number; decayS: number } | null = null;
  let kickElapsed = 0;
  let kickIsEscape = false;
  let escapeArmed = true;
  let prevEscape = 0;
  let prevProx = 0;
  // --- end Plan 02b: motion + load ---

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

    // --- Plan 02b: motion + load (per frame) ---
    bootT += dt;
    const env = loadEnvelope(bootT, CONFIG.aesthetic.LOAD);

    // Banner types in, then fades once the HUD has finished arriving.
    if (bannerEl && !bannerDone) {
      const chars = reduced ? bannerText.length : Math.round(env.banner * bannerText.length);
      if (chars !== bannerShown) {
        bannerEl.textContent = bannerText.slice(0, chars);
        bannerShown = chars;
      }
      // Reduced motion shows the banner whole this same frame — dismiss it at
      // once rather than leaving it hanging until the HUD envelope finishes.
      if (env.hud >= 1 || reduced) {
        bannerEl.classList.add("done");
        bannerDone = true;
      }
    }

    // HUD fades in last (CSS transition eases it). Once it reaches full opacity
    // — immediately, under reduced motion — stop touching the property.
    if (hudRoot && !hudFaded) {
      const o = reduced ? 1 : env.hud;
      hudRoot.style.opacity = String(o);
      if (o >= 1) hudFaded = true;
    }

    // Escape rising edge — the same pure detector the audio blip uses, so the
    // camera kick, the blip and the ember spike all fire on one frame.
    const esc = view.readouts.escape ?? 0;
    const edge = detectEscapeOnset(
      prevEscape,
      esc,
      CONFIG.physics.ESCAPE_TH,
      CONFIG.physics.ESCAPE_HYST,
    );
    prevEscape = esc;
    if (edge.onset && escapeArmed) {
      kickCfg = CONFIG.aesthetic.ESCAPE_KICK;
      kickElapsed = 0;
      kickIsEscape = true;
      escapeArmed = false;
    } else if (edge.armed) {
      escapeArmed = true;
    }

    // Collision shudder — a hard jump in proximity means the fly just clipped
    // something (the loop's contact startle fires on the same frame).
    const prox = view.sensory.proximity ?? 0;
    if (!firstFrame && !kickIsEscape && prox - prevProx >= CONFIG.physics.CONTACT_STARTLE * 0.8) {
      kickCfg = COLLISION_KICK;
      kickElapsed = 0;
    }
    prevProx = prox;
    firstFrame = false;

    // Ember: ignite ramp during boot, spiking on an escape.
    const lit = emberBase * (reduced ? 1 : env.ignite);
    const glow = kickIsEscape && kickCfg ? Math.exp(-kickElapsed / (kickCfg.decayS / 3)) : 0;
    fly.emberLight.intensity = Math.max(lit, emberBase * (1 + ESCAPE_EMBER_GAIN) * glow);

    // Fly bob — render-only, applied after `fly.update` wrote the pose.
    if (!reduced)
      fly.object3d.position.y += bob(bootT, CONFIG.aesthetic.BOB_HZ, CONFIG.aesthetic.BOB_AMP);

    const sway = reduced
      ? undefined
      : idleSway(bootT, CONFIG.camera.IDLE_SWAY_HZ, CONFIG.camera.IDLE_SWAY_AMP);
    const kick = kickCfg && !reduced ? escapeKick(kickElapsed, kickCfg) : undefined;
    if (kickCfg) {
      kickElapsed += dt;
      if (kickElapsed > kickCfg.decayS) {
        kickCfg = null;
        kickIsEscape = false;
      }
    }
    // --- end Plan 02b: motion + load (per frame) ---

    const cam = updateFollowCamera(camPos, view.pose, dt, { sway, kick });
    // The offsets ride on the returned position, so they feed back into the
    // spring next frame — that re-damps them, which is the point: the kick
    // shoves and the spring eases the camera home.
    camPos = cam.position;
    renderer.camera.position.set(cam.position.x, cam.position.y, cam.position.z);
    renderer.camera.lookAt(cam.lookAt.x, cam.lookAt.y, cam.lookAt.z);
    if (cam.roll !== 0) renderer.camera.rotateZ(cam.roll);

    // Plan 02b: audio + HUD sinks.
    audio.update(view, dt);
    hud.update({
      readouts: view.readouts,
      sensory: view.sensory,
      simHz: view.simHz,
      activeCount: currentActiveCount,
      paused: view.paused,
    });
    renderer.render(dt);
  };

  const loop = new Loop({ bridge, body, sensing, roleTable, world, onFrame });

  // --- Plan 02b: world editing (live rebuild) ---
  // Every store mutation: swap world3d (disposing the old geometry/materials),
  // recompute the collision query, refresh the HUD editor, debounce-persist.
  store.subscribe((s) => {
    renderer.scene.remove(world3d);
    world3d.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
      }
    });
    world3d = buildWorld(s, currentTheme);
    renderer.scene.add(world3d);
    loop.setWorld(worldQuery(s));
    hud.syncScene(s);
    saveDebounced(s);
  });
  // --- end Plan 02b: world editing (live rebuild) ---

  // 8. Size to the viewport.
  const resize = (): void => renderer.resize(window.innerWidth, window.innerHeight);
  window.addEventListener("resize", resize);
  resize();

  // Plan 02b aesthetic: apply the seeded theme once, now that the scene, the
  // world and the fly all exist (recolours every `userData.themeKey` material).
  renderer.setTheme(currentTheme);

  // 9. Run the whole cloud.
  bridge.setActiveCount(nNeurons);
  loop.start();
}

main().catch((err) => {
  // `#hud` is the DOM overlay div now (Plan 02b) — writing text into it would
  // wipe the whole HUD tree. The boot banner is the right place for this.
  const banner = document.getElementById("boot-banner");
  if (banner) {
    banner.classList.remove("done");
    banner.textContent = `boot failed: ${String(err)}`;
  }
  throw err;
});
