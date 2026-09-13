import "./ui/hud.css";
import * as THREE from "three";
import { loadDataset } from "./data/dataset";
import { AnatomyPanel } from "./viz/brain-panel/anatomy-panel";
import { createSimBridge, type SimBridge } from "./bridge/sim-bridge";
import * as sensing from "./sensing/sensing";
import { Body } from "./body/body";
import { v } from "./body/types";
import { SCENE, type SceneConfig } from "./scene.config";
import { createSceneStore } from "./world/scene-store";
import { loadScene, saveScene } from "./world/scene-persist";
import { buildWorld } from "./viz/builders";
import { createRenderer } from "./viz/renderer";
import { buildComposer } from "./viz/post";
import { Fly } from "./viz/fly";
import { CameraControls } from "./viz/camera-controls";
import { qRotate } from "./body/quat";
import { CONFIG } from "./app/config";
import { worldQuery } from "./app/world-query";
import { Loop, type FrameView } from "./app/loop";
import { Hud } from "./ui/hud";
import type { HudControls, Theme } from "./ui/controls";
import { AudioEngine } from "./audio/audio";
import { ExperimentUi } from "./experiments/experiment-ui";
import { AssayUi } from "./experiments/assay-ui";
import { createSidebar } from "./ui/sidebar";
import { DEFAULT_HABITAT, generateHabitat } from "./world/habitat";
import { flyName } from "./experiments/names";
import { withPeers } from "./experiments/peers";

interface Individual {
  seed: number;
  headingOffset: number;
  name: string;
  color: string;
  bridge: SimBridge;
  body: Body;
  fly: Fly;
  loop: Loop;
  view: FrameView | null;
  active: number;
  trail: THREE.Line;
  history: THREE.Vector3[];
  tonic: boolean;
  drive: number;
  modalities: boolean;
  flow: boolean;
}
const COLORS = ["#f4c887", "#79c9c3", "#b7a0ed", "#dd99b3", "#a8ca79", "#8db9ef"];
function disposeObject(object: THREE.Object3D) {
  object.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.Line || o instanceof THREE.Points) {
      o.geometry.dispose();
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
    }
  });
}

async function main() {
  let disposed = false;
  let cleanup = () => {};
  import.meta.hot?.dispose(() => {
    cleanup();
    disposed = true;
  });
  const banner = document.getElementById("boot-banner")!;
  banner.textContent = "Loading MaleCNS · 166,700 neurons and measured brain anatomy…";
  const data = await loadDataset();
  if (disposed) return;
  const individuals: Individual[] = [];
  let selected = 0,
    paused = false,
    peers = true,
    spawning = false;
  let theme: Theme = "dark";
  try {
    theme = localStorage.getItem("fly-playground.theme") === "light" ? "light" : "dark";
  } catch {
    /* storage unavailable */
  }
  let initialScene: SceneConfig = loadScene() ?? generateHabitat(DEFAULT_HABITAT);
  try {
    worldQuery(initialScene);
  } catch {
    initialScene = SCENE;
  }
  const store = createSceneStore(initialScene);
  let baseWorld = worldQuery(initialScene);
  const canvas = document.getElementById("view") as HTMLCanvasElement;
  const renderer = createRenderer(canvas);
  const composer = buildComposer(renderer.gl, renderer.scene, renderer.camera);
  renderer.setComposer(composer);
  let world3d = buildWorld(initialScene, theme);
  renderer.scene.add(world3d);
  const audio = new AudioEngine();
  const panel = new AnatomyPanel(data, theme);
  const selectedFly = () => individuals[selected]!;
  const cameraTarget = new THREE.Vector3();
  const camera = new CameraControls(
    canvas,
    renderer.camera,
    new THREE.Vector3(initialScene.fly.start.x, initialScene.fly.start.y, initialScene.fly.start.z),
    qRotate(new Body(initialScene.fly.start, initialScene.fly.heading).pose().orientation, {
      x: -7,
      y: 3,
      z: 1,
    }),
    (direction) => {
      if (individuals.length)
        choose((selected + direction + individuals.length) % individuals.length);
    },
  );
  const controls: HudControls = {
    setActiveCount(n) {
      const individual = selectedFly();
      if (individual) {
        individual.active = Math.max(data.nf.coreCount, Math.min(data.nf.count, n));
        individual.bridge.setActiveCount(individual.active);
      }
    },
    setPaused(p) {
      paused = p;
      for (const i of individuals) {
        if (p) i.bridge.pause();
        else i.bridge.resume();
      }
    },
    setTheme(t) {
      theme = t;
      hud.setTheme(t);
      renderer.setTheme(t);
      panel.setTheme(t);
      experiments.root.dataset.theme = t;
      for (const i of individuals) i.fly.setTheme(t);
      try {
        localStorage.setItem("fly-playground.theme", t);
      } catch {
        /* storage unavailable */
      }
    },
    setParams(p) {
      selectedFly()?.bridge.setParams(p);
    },
    setGroupVisible(g, visible) {
      panel.setGroupVisible(g, visible);
    },
    setMuted(b) {
      audio.setMuted(b);
    },
    setVolume(value) {
      audio.setVolume(value);
    },
    addObject(spec) {
      const p = selectedFly().body.pose().position;
      store.addObject({
        ...spec,
        position: { x: p.x + 3, y: p.y, z: p.z },
        rotation: v(),
        scale: v(1, 1, 1),
      });
    },
    updateObject(id, patch) {
      store.updateObject(id, patch);
    },
    removeObject(id) {
      store.removeObject(id);
    },
    updateLight(i, patch) {
      store.updateLight(i, patch);
    },
    resetScene() {
      store.reset();
    },
  };
  const hud = new Hud(document.getElementById("hud")!, controls, {
    coreCount: data.nf.coreCount,
    nNeurons: data.nf.count,
    groups: [...new Set(data.nf.groupId)],
    lif: CONFIG.lif,
    scene: initialScene,
    theme,
    reservedRect: CONFIG.hud.reservedRect,
  });
  hud.syncScene(initialScene);
  function choose(index: number) {
    selected = Math.max(0, Math.min(individuals.length - 1, index));
    experiments.setSelected(selected);
    panel.setFlyName(selectedFly().name);
    camera.update(selectedFly().fly.cameraTarget(cameraTarget));
  }
  const experiments = new ExperimentUi(data, {
    select: choose,
    modalities(enabled) {
      const i = selectedFly();
      i.modalities = enabled;
      if (enabled) controls.setActiveCount(data.nf.count);
      i.loop.setModalities(enabled);
      i.bridge.setInputs?.(enabled, i.flow);
    },
    movement(command) {
      selectedFly().bridge.movement?.(command);
    },
    flow(enabled) {
      const i = selectedFly();
      i.flow = enabled;
      if (enabled) controls.setActiveCount(data.nf.count);
      i.bridge.setInputs?.(i.modalities, enabled);
    },
    depth(n) {
      controls.setActiveCount(n);
    },
    randomize() {
      const i = selectedFly();
      i.fly.randomizeFeatures(i.color);
    },
    add() {
      void addFly()
        .then(() => choose(individuals.length - 1))
        .catch(showError);
    },
    remove() {
      if (individuals.length <= 1) return;
      const [i] = individuals.splice(selected, 1);
      if (!i) return;
      i.bridge.dispose();
      renderer.scene.remove(i.fly.object3d, i.trail);
      i.fly.dispose();
      disposeObject(i.trail);
      choose(Math.min(selected, individuals.length - 1));
    },
    reset() {
      for (let index = 0; index < individuals.length; index++) {
        const i = individuals[index]!;
        i.bridge.setStimulus(
          new Float32Array(
            data.parsedGroups.inputRoles ? Object.keys(data.parsedGroups.inputRoles).length : 0,
          ),
        );
        i.bridge.reset();
        i.loop.reset();
        const start = { ...store.snapshot().fly.start };
        start.z += (index - (individuals.length - 1) / 2) * 1.5;
        i.body.reset(start, store.snapshot().fly.heading + i.headingOffset);
        i.bridge.resetBody?.(start, store.snapshot().fly.heading + i.headingOffset);
        i.history = [];
        i.trail.geometry.setFromPoints([]);
      }
    },
    intervene(command) {
      const individual = selectedFly();
      if (!individual) return;
      const needed = command.cells.reduce((n, i) => Math.max(n, i + 1), individual.active);
      if (needed > individual.active) {
        individual.active = Math.min(data.nf.count, needed);
        individual.bridge.setActiveCount(individual.active);
      }
      if (command.kind === "tonic") {
        individual.tonic = (command.amplitude ?? 0) > 0;
        if (individual.tonic) individual.drive = command.amplitude!;
      }
      individual.bridge.intervene?.(command);
    },
    chooseCells(indices) {
      panel.select(indices, false);
    },
    peers(enabled) {
      peers = enabled;
    },
  });
  const assay = new AssayUi(data, () => selectedFly());
  experiments.root.querySelector(".experiment-console")!.append(assay.root);
  experiments.root.dataset.theme = theme;
  const sidebar = createSidebar(store, () => panel.setViewport());
  panel.onSelection = (indices) => experiments.setCells(indices);
  function showError(error: unknown) {
    banner.textContent = String(error);
    banner.classList.remove("done");
  }
  async function addFly() {
    if (spawning || individuals.length >= 6 || disposed) return;
    spawning = true;
    const seed = crypto.getRandomValues(new Uint32Array(1))[0]!;
    const headingOffset = (Math.random() - 0.5) * Math.PI;
    const bridge = createSimBridge(
      () => new Worker(new URL("./bridge/sim.worker.ts", import.meta.url), { type: "module" }),
    );
    try {
      const { roleTable } = await bridge.init(
        { neurons: data.neurons.slice(0), graph: data.graph.slice(0), groups: data.groups },
        {
          seed,
          snapMax: data.nf.count,
          embodied: {
            start: {
              ...store.snapshot().fly.start,
              z: store.snapshot().fly.start.z + (individuals.length - 1) * 1.5,
            },
            heading: store.snapshot().fly.heading + headingOffset,
            world: baseWorld,
          },
          tonicDrive: {
            cells: data.motors.tonic,
            amplitude: CONFIG.flight.tonicDrive,
          },
        },
      );
      if (disposed) {
        bridge.dispose();
        return;
      }
      const index = individuals.length,
        start = { ...store.snapshot().fly.start };
      start.z += (index - 1) * 1.5;
      const body = new Body(start, store.snapshot().fly.heading + headingOffset, true, seed),
        fly = new Fly(theme);
      fly.update({}, body.pose(), 0);
      renderer.scene.add(fly.object3d);
      const name = flyName(new Set(individuals.map((i) => i.name))),
        color = COLORS.find((c) => !individuals.some((i) => i.color === c)) ?? COLORS[0]!;
      fly.randomizeFeatures(color);
      const trail = new THREE.Line(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.4 }),
      );
      renderer.scene.add(trail);
      const individual: Individual = {
        seed,
        headingOffset,
        name,
        color,
        bridge,
        body,
        fly,
        trail,
        history: [],
        tonic: true,
        drive: CONFIG.flight.tonicDrive,
        modalities: false,
        flow: false,
        active: Math.max(data.nf.coreCount, Math.min(data.nf.count, CONFIG.sim.defaultActiveCount)),
        view: null,
        loop: null!,
      };
      individual.loop = new Loop({
        bridge,
        body,
        sensing,
        nativeEncoders: true,
        simulationClock: true,
        roleTable,
        world: baseWorld,
        onFrame(view) {
          individual.view = view;
          fly.update(view.readouts, view.pose, 0);
        },
      });
      individuals.push(individual);
      bridge.setActiveCount(individual.active);
      if (paused) bridge.pause();
    } catch (error) {
      bridge.dispose();
      throw error;
    } finally {
      spawning = false;
    }
  }
  function releaseResources() {
    for (const i of individuals) {
      i.bridge.dispose();
      i.fly.dispose();
    }
    audio.dispose();
    hud.dispose();
    panel.dispose();
    assay.dispose();
    experiments.dispose();
    sidebar.dispose();
    camera.dispose();
    for (const pass of composer.composer.passes) pass.dispose();
    composer.composer.dispose();
    disposeObject(renderer.scene);
    renderer.gl.dispose();
  }
  cleanup = releaseResources;
  for (let i = 0; i < 3; i++) {
    banner.textContent = `Preparing independent fly ${i + 1} / 3 · full MaleCNS graph`;
    try {
      await addFly();
    } catch (error) {
      releaseResources();
      throw error;
    }
  }
  if (disposed) return;
  choose(0);
  panel.select(data.parsedGroups.inputRoles.looming ?? [], false);
  banner.classList.add("done");
  document.getElementById("hud")!.style.opacity = "1";
  renderer.setTheme(theme);
  const unsubscribe = store.subscribe((s) => {
    renderer.scene.remove(world3d);
    disposeObject(world3d);
    world3d = buildWorld(s, theme);
    renderer.scene.add(world3d);
    baseWorld = worldQuery(s);
    hud.syncScene(s);
    saveScene(s);
  });
  const resize = () => {
    renderer.resize(innerWidth, innerHeight);
    panel.setViewport();
  };
  window.addEventListener("resize", resize);
  resize();
  const abort = new AbortController();
  const pointerDown = new THREE.Vector2();
  canvas.addEventListener(
    "pointerdown",
    (e) => {
      pointerDown.set(e.clientX, e.clientY);
    },
    { signal: abort.signal },
  );
  canvas.addEventListener(
    "pointerup",
    (e) => {
      if (e.button !== 0 || pointerDown.distanceTo(new THREE.Vector2(e.clientX, e.clientY)) > 4)
        return;
      const r = canvas.getBoundingClientRect(),
        ray = new THREE.Raycaster();
      ray.setFromCamera(
        new THREE.Vector2(
          ((e.clientX - r.left) / r.width) * 2 - 1,
          1 - ((e.clientY - r.top) / r.height) * 2,
        ),
        renderer.camera,
      );
      const hits = individuals
        .map((i, index) => ({ index, hit: ray.intersectObject(i.fly.object3d, true)[0] }))
        .filter((h) => h.hit)
        .sort((a, b) => a.hit!.distance - b.hit!.distance);
      if (hits[0]) choose(hits[0].index);
    },
    { signal: abort.signal },
  );
  let raf = 0,
    last = performance.now(),
    time = 0,
    lastUi = 0;
  let renderedFrames = 0;
  const benchmarkHost = globalThis as typeof globalThis & { __flyBenchmark?: () => unknown };
  if (new URLSearchParams(location.search).has("benchmark"))
    benchmarkHost.__flyBenchmark = () => ({
      now: performance.now(),
      renderedFrames,
      cameraPosition: renderer.camera.position.toArray(),
      cameraQuaternion: renderer.camera.quaternion.toArray(),
      renderInfo: renderer.gl.info.render,
      transport: crossOriginIsolated ? "SAB" : "postMessage",
      flies: individuals.map((i) => ({
        name: i.name,
        active: i.active,
        tick: i.bridge.readState().tick,
        hz: i.bridge.readState().simHz,
        pose: i.body.pose(),
        mode: i.view?.movementMode,
      })),
    });
  function frame(now: number) {
    renderedFrames++;
    if (disposed) return;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    time += dt;
    const poses = individuals.map((i) => i.body.pose());
    for (let k = 0; k < individuals.length; k++) {
      const i = individuals[k]!;
      i.loop.setWorld(
        peers
          ? withPeers(
              baseWorld,
              poses.filter((_, j) => j !== k).map((p) => p.position),
            )
          : baseWorld,
      );
      i.loop.frameOnce(now);
      if (i.view)
        i.fly.update(
          i.view.readouts,
          i.view.pose,
          paused ? 0 : dt,
          i.view.movementMode === "grounded",
          Math.hypot(i.body.state().vel.x, i.body.state().vel.z),
        );
      if (!paused && now - lastUi >= 100) {
        i.history.push(
          new THREE.Vector3(
            i.body.pose().position.x,
            i.body.pose().position.y,
            i.body.pose().position.z,
          ),
        );
        if (i.history.length > 100) i.history.shift();
        i.trail.geometry.setFromPoints(i.history);
      }
    }
    const individual = selectedFly(),
      view = individual.view;
    camera.update(individual.fly.cameraTarget(cameraTarget), dt);
    if (view) {
      panel.update(view, time);
      audio.update(view, paused ? 0 : dt);
      hud.update({
        readouts: view.readouts,
        sensory: view.sensory,
        simHz: view.simHz,
        activeCount: individual.active,
        paused,
      });
    }
    if (now - lastUi >= 100) {
      experiments.update(
        individuals.map((i) => ({
          seed: i.seed,
          name: i.name,
          color: i.color,
          escape: i.view?.readouts.escape ?? 0,
          tick: i.bridge.readState().tick,
          active: i.active,
          hz: i.view?.simHz ?? 0,
          tonic: i.tonic,
          drive: i.drive,
          modalities: i.modalities,
          flow: i.flow,
          movementMode: i.view?.movementMode ?? "neural",
        })),
        paused,
      );
      lastUi = now;
    }
    renderer.render(dt);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(raf);
    delete benchmarkHost.__flyBenchmark;
    abort.abort();
    unsubscribe();
    window.removeEventListener("resize", resize);
    window.removeEventListener("pagehide", onPageHide);
    releaseResources();
  }
  function onPageHide(e: PageTransitionEvent) {
    if (!e.persisted) dispose();
  }
  window.addEventListener("pagehide", onPageHide);
  cleanup = dispose;
}
main().catch((err) => {
  const banner = document.getElementById("boot-banner");
  if (banner) {
    banner.classList.remove("done");
    banner.textContent = `Could not load MaleCNS: ${String(err)}`;
  }
  console.error(err);
});
