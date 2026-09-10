// DOM overlay HUD — declarative glue, NOT unit-tested (vitest env is `node`, no
// DOM). Covered by `tsc` + `eslint` + `vite build` + the manual checklist.
//
// Zero business logic here: the HUD reads `scale.ts` outputs and sets element
// properties, nothing more. Framework-free — no `three`, no `body/` or `bridge/`
// internals beyond the type-only `HudControls`/`HudModel`/`HudFrame` contract.

import type { HudControls, HudFrame, HudModel, Theme } from "./controls";
import type { SceneConfig, SceneObject } from "../scene.config";
import type { LifParams } from "../bridge/sim-bridge";
import { v } from "../body/types";
import {
  countToSlider,
  lifSlider,
  lifSliderPos,
  loomingWarnColour,
  meterFraction,
  sliderToCount,
  type MeterKind,
} from "./scale";

type MeterSource = "readouts" | "sensory";

interface MeterSpec {
  label: string;
  source: MeterSource;
  key: string;
  kind: MeterKind;
}

// Declarative meter table — `key` is the role name in `frame.readouts` /
// `frame.sensory`; `kind` selects the `meterFraction` mapping in `scale.ts`.
const METERS: readonly MeterSpec[] = [
  { label: "looming", source: "sensory", key: "looming", kind: "looming" },
  { label: "escape", source: "readouts", key: "escape", kind: "escape" },
  { label: "thrust", source: "readouts", key: "thrust", kind: "thrust" },
  { label: "yaw", source: "readouts", key: "yaw_torque", kind: "yaw" },
  { label: "proximity", source: "sensory", key: "proximity", kind: "proximity" },
  { label: "light L", source: "sensory", key: "light_l", kind: "light" },
  { label: "light R", source: "sensory", key: "light_r", kind: "light" },
  { label: "wind L", source: "sensory", key: "wind_l", kind: "wind" },
  { label: "wind R", source: "sensory", key: "wind_r", kind: "wind" },
];

// Slider order for the LIF tuning panel — one row per `keyof LifParams`.
const LIF_KEYS = [
  "dtMs",
  "tauMMs",
  "vThreshold",
  "vReset",
  "refracMs",
  "noiseSigma",
] as const satisfies readonly (keyof LifParams)[];

// Trailing-edge debounce — the LIF range inputs fire `oninput` continuously; the
// sim only needs the settled value. main.ts debounces again before the worker
// hop; both layers are cheap and harmless.
function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): (...args: A) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: A): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// Compact readout for a LIF value span. Display only — the value actually sent
// to the sim stays the raw `lifSlider` output, never this rounded string.
function fmtLif(value: number): string {
  return value >= 10 ? value.toFixed(1) : value.toFixed(3);
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function isFormField(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

interface MeterRefs {
  fill: HTMLElement;
  value: HTMLElement;
  spec: MeterSpec;
}

export class Hud {
  private readonly root: HTMLElement;
  private readonly body: HTMLElement;
  private readonly hzSpan: HTMLElement;
  private readonly depthLabel: HTMLElement;
  private readonly pauseButton: HTMLButtonElement;
  private readonly meters: MeterRefs[] = [];
  private readonly onKeyDown: (e: KeyboardEvent) => void;
  private readonly controls: HudControls;
  private readonly sceneEditor: HTMLFieldSetElement;
  private readonly sceneLegend: HTMLLegendElement;
  private paused = false;
  private collapsed = false;
  // --- scene-editor reconcile state (F1) --------------------------------------
  // Structural signature of the last `syncScene` build: the object-id list and
  // the light count. When both are unchanged we DON'T tear down the DOM — we
  // just refresh idle (non-focused) slider positions via `sceneReconcile`.
  private sceneObjIds: readonly string[] = [];
  private sceneLightCount = -1;
  private sceneReconcile: ((scene: SceneConfig) => void) | null = null;
  private objSel: HTMLSelectElement | null = null;
  private lightSel: HTMLSelectElement | null = null;

  constructor(root: HTMLElement, controls: HudControls, model: HudModel) {
    this.root = root;
    this.controls = controls;
    root.id = "hud";
    root.dataset.theme = model.theme;

    // Plan 2c reservedRect (viewport fractions) → CSS custom props the left-edge
    // stacks anchor against, so they track the docked-card region instead of a
    // 1080p pixel literal (`top: 384px`). `hud.css` reads these with a 384px
    // fallback.
    const rr = model.reservedRect;
    root.style.setProperty("--reserved-bottom", `${(rr.y + rr.h) * 100}vh`);
    root.style.setProperty("--reserved-right", `${(rr.x + rr.w) * 100}vw`);

    const body = el("div", "hud-body");
    this.body = body;

    // --- top-right header: project name + live sim_hz --------------------
    const header = el("div", "hud-header");
    header.append(el("span", "hud-header__name", "fly-playground"));
    const hz = el("span", "hud-header__hz");
    hz.append(document.createTextNode("sim "));
    this.hzSpan = el("span");
    this.hzSpan.dataset.role = "simhz";
    this.hzSpan.textContent = "0 hz";
    hz.append(this.hzSpan);
    header.append(hz);

    // --- left-edge vertical "depth" control (log scale via scale.ts) ----
    const depth = el("div", "hud-depth");
    depth.append(el("span", "hud-depth__caption", "depth"));
    this.depthLabel = el("span", "hud-depth__label", String(model.nNeurons));
    const depthInput = el("input", "hud-depth__input");
    depthInput.type = "range";
    depthInput.min = "0";
    depthInput.max = "1";
    depthInput.step = "0.001";
    depthInput.value = String(countToSlider(model.nNeurons, model.coreCount, model.nNeurons));
    depthInput.setAttribute("aria-label", "connectome depth (active neuron count)");
    depthInput.addEventListener("input", () => {
      controls.setActiveCount(
        sliderToCount(Number(depthInput.value), model.coreCount, model.nNeurons),
      );
    });
    depth.append(this.depthLabel, depthInput);

    // --- bottom meter row ----------------------------------------------------
    const meters = el("div", "hud-meters");
    for (const spec of METERS) {
      const meter = el("div", "hud-meter");
      const track = el("div", "hud-meter__track");
      const fill = el("div", "hud-meter__fill");
      track.append(fill);
      const value = el("span", "hud-meter__value", "0.00");
      meter.append(el("span", "hud-meter__label", spec.label), track, value);
      meters.append(meter);
      this.meters.push({ fill, value, spec });
    }

    // --- pause toggle (Space + button) ------------------------------------
    const pauseButton = el("button", "hud-pause", "pause");
    pauseButton.type = "button";
    pauseButton.dataset.paused = "false";
    pauseButton.addEventListener("click", () => this.togglePause(controls));
    this.pauseButton = pauseButton;

    // --- keyboard: Space = pause, H = collapse --------------------------
    this.onKeyDown = (e: KeyboardEvent): void => {
      if (isFormField(e.target)) return;
      if (e.code === "Space") {
        e.preventDefault();
        this.togglePause(controls);
      } else if (e.key === "h" || e.key === "H") {
        this.collapsed = !this.collapsed;
        this.body.hidden = this.collapsed;
      }
    };
    window.addEventListener("keydown", this.onKeyDown);

    // --- left-edge tuning stack: LIF panel + (empty) scene editor -----------
    // Placed right of the thin depth slider, below the Plan 2c reservedRect
    // card region and clear of the centre. Both fieldsets start collapsed.
    const leftStack = el("div", "hud-left-stack");

    // LIF tuning panel. Zero math here: `lifSlider` / `lifSliderPos` own every
    // number; each row only forwards the mapped value through a 50 ms trailing
    // debounce and paints its span.
    const setParamsDebounced = debounce((p: Partial<LifParams>) => controls.setParams(p), 50);

    const lifPanel = el("fieldset", "hud-lif");
    lifPanel.dataset.collapsed = "true";
    const lifLegend = el("legend", "hud-lif__legend", "lif tuning");
    lifLegend.addEventListener("click", () => {
      lifPanel.dataset.collapsed = lifPanel.dataset.collapsed === "true" ? "false" : "true";
    });
    lifPanel.append(lifLegend);

    interface LifRow {
      input: HTMLInputElement;
      value: HTMLElement;
      param: (typeof LIF_KEYS)[number];
    }
    const lifRows: LifRow[] = [];

    for (const param of LIF_KEYS) {
      const row = el("div", "hud-lif__row");
      const label = el("label", "hud-lif__label", param);
      const input = el("input", "hud-lif__input");
      input.type = "range";
      input.min = "0";
      input.max = "1";
      input.step = "0.001";
      input.value = String(lifSliderPos(param, model.lif.defaults[param], model.lif.ranges));
      input.setAttribute("aria-label", `LIF ${param}`);
      const value = el("span", "hud-lif__value", fmtLif(model.lif.defaults[param]));
      input.addEventListener("input", () => {
        const mapped = lifSlider(param, Number(input.value), model.lif.ranges);
        value.textContent = fmtLif(mapped);
        setParamsDebounced({ [param]: mapped });
      });
      row.append(label, input, value);
      lifPanel.append(row);
      lifRows.push({ input, value, param });
    }

    const lifReset = el("button", "hud-lif__reset", "reset");
    lifReset.type = "button";
    lifReset.addEventListener("click", () => {
      for (const { input, value, param } of lifRows) {
        input.value = String(lifSliderPos(param, model.lif.defaults[param], model.lif.ranges));
        value.textContent = fmtLif(model.lif.defaults[param]);
      }
      controls.setParams({ ...model.lif.defaults });
    });
    lifPanel.append(lifReset);

    // Scene editor — legend + collapse wiring here; `syncScene` (re)builds the
    // body on every store mutation. main.ts calls it once at boot.
    const sceneEditor = el("fieldset", "hud-scene");
    sceneEditor.dataset.role = "scene-editor";
    sceneEditor.dataset.collapsed = "true";
    const sceneLegend = el("legend", "hud-scene__legend", "scene");
    sceneLegend.addEventListener("click", () => {
      sceneEditor.dataset.collapsed = sceneEditor.dataset.collapsed === "true" ? "false" : "true";
    });
    sceneEditor.append(sceneLegend, el("div", "hud-scene__body"));
    this.sceneEditor = sceneEditor;
    this.sceneLegend = sceneLegend;

    leftStack.append(lifPanel, sceneEditor);

    // --- bottom-right toggle cluster: theme / mute / volume ----------------
    const cluster = el("div", "hud-cluster");

    let currentTheme: Theme = model.theme;
    const themeButton = el("button", "hud-cluster__theme", currentTheme);
    themeButton.type = "button";
    themeButton.addEventListener("click", () => {
      currentTheme = currentTheme === "dark" ? "light" : "dark";
      themeButton.textContent = currentTheme;
      controls.setTheme(currentTheme);
      this.setTheme(currentTheme);
    });

    const muteLabel = el("label", "hud-cluster__mute");
    const muteBox = el("input");
    muteBox.type = "checkbox";
    muteBox.checked = true; // audio starts muted
    muteBox.addEventListener("change", () => controls.setMuted(muteBox.checked));
    muteLabel.append(muteBox, document.createTextNode("mute"));

    const volume = el("input", "hud-cluster__volume");
    volume.type = "range";
    volume.min = "0";
    volume.max = "1";
    volume.step = "0.01";
    volume.value = "0.6";
    volume.setAttribute("aria-label", "master volume");
    volume.addEventListener("input", () => controls.setVolume(Number(volume.value)));

    cluster.append(themeButton, muteLabel, volume);

    body.append(header, depth, meters, pauseButton, leftStack, cluster);
    root.append(body);
  }

  private togglePause(controls: HudControls): void {
    this.setPaused(!this.paused);
    controls.setPaused(this.paused);
  }

  private setPaused(next: boolean): void {
    this.paused = next;
    this.pauseButton.dataset.paused = String(next);
    this.pauseButton.textContent = next ? "paused" : "pause";
  }

  update(frame: HudFrame): void {
    // `worker-core.frame(0)` skips the Hz EMA while paused, so `frame.simHz`
    // freezes at its last live value — show "paused" instead of a stale number.
    this.hzSpan.textContent = frame.paused ? "paused" : `${frame.simHz.toFixed(0)} hz`;
    this.depthLabel.textContent = String(frame.activeCount);
    for (const { fill, value, spec } of this.meters) {
      const src = spec.source === "readouts" ? frame.readouts : frame.sensory;
      const raw = src[spec.key] ?? 0;
      const frac = meterFraction(raw, spec.kind);
      fill.style.inlineSize = `${frac * 100}%`;
      // The looming meter warns as the fraction climbs toward ESCAPE_TH
      // (spec §5.1 / §12.4); every other meter keeps the static --hud-fill.
      if (spec.kind === "looming") fill.style.backgroundColor = loomingWarnColour(frac);
      value.textContent = raw.toFixed(2);
    }
    if (this.paused !== frame.paused) this.setPaused(frame.paused);
  }

  setTheme(theme: Theme): void {
    this.root.dataset.theme = theme;
  }

  // Sync the scene-editor body to `scene`. main.ts calls this once at boot and
  // again on EVERY store mutation, so a full teardown-and-rebuild here would
  // (a) replace the range/select under the pointer mid-drag and (b) reset every
  // <select> to option 0. So: if the object-id list and light count are
  // structurally unchanged, DON'T touch the DOM tree — just refresh the idle
  // (non-focused) slider positions. Only an id-list change forces a rebuild, and
  // that captures + restores the <select> values.
  syncScene(scene: SceneConfig): void {
    const objIds = scene.objects.map((o) => o.id);
    const lightCount = scene.lights.length;

    const structuralMatch =
      this.sceneReconcile !== null &&
      objIds.length === this.sceneObjIds.length &&
      objIds.every((id, i) => id === this.sceneObjIds[i]) &&
      lightCount === this.sceneLightCount;
    if (structuralMatch && this.sceneReconcile) {
      this.sceneReconcile(scene);
      return;
    }

    // Rebuild required — remember the current selections to restore them after.
    const prevObj = this.objSel?.value;
    const prevLight = this.lightSel?.value;

    for (const child of [...this.sceneEditor.children]) {
      if (child !== this.sceneLegend) child.remove();
    }
    this.objSel = null;
    this.lightSel = null;
    this.sceneReconcile = null;

    const wrap = el("div", "hud-scene__body");
    // Re-pointed by `sceneReconcile` so the load closures always read the latest
    // store snapshot without needing a rebuild.
    let curScene = scene;

    const bmin = scene.bounds.min;
    const bmax = scene.bounds.max;

    const range = (min: number, max: number, step: number, value: number): HTMLInputElement => {
      const r = el("input", "hud-scene__range");
      r.type = "range";
      r.min = String(min);
      r.max = String(max);
      r.step = String(step);
      r.value = String(value);
      return r;
    };
    const field = (label: string, control: HTMLElement): HTMLElement => {
      const row = el("label", "hud-scene__field");
      row.append(el("span", "hud-scene__field-label", label), control);
      return row;
    };
    const select = (options: string[]): HTMLSelectElement => {
      const s = el("select", "hud-scene__select");
      for (const opt of options) {
        const o = el("option");
        o.value = opt;
        o.textContent = opt;
        s.append(o);
      }
      return s;
    };
    // Write an <input> value ONLY when it is not the focused element — never
    // yank a control out from under an in-flight drag/selection.
    const setIdle = (input: HTMLInputElement, value: string): void => {
      if (input !== document.activeElement && input.value !== value) input.value = value;
    };

    // Per-section refreshers run by `sceneReconcile` on a structural-match sync.
    const refreshers: (() => void)[] = [];

    // --- add row: kind + material + "add at fly" -------------------------------
    const kindSel = select(["box", "sphere", "torus"]);
    const matSel = select(["buoy-a", "buoy-b", "buoy-c"]);
    const addBtn = el("button", "hud-scene__btn", "add at fly");
    addBtn.type = "button";
    addBtn.addEventListener("click", () => {
      this.controls.addObject({
        kind: kindSel.value as SceneObject["kind"],
        material: matSel.value,
      });
    });
    const addRow = el("div", "hud-scene__row");
    addRow.append(field("kind", kindSel), field("mat", matSel), addBtn);
    wrap.append(addRow);

    // --- object editor: pick an id, drag position / uniform scale, delete ------
    if (scene.objects.length > 0) {
      const objSel = select(objIds);
      this.objSel = objSel;
      if (prevObj !== undefined && objIds.includes(prevObj)) objSel.value = prevObj;
      const ox = range(bmin.x - 2, bmax.x + 2, 0.1, 0);
      const oy = range(bmin.y - 2, bmax.y + 2, 0.1, 0);
      const oz = range(bmin.z - 2, bmax.z + 2, 0.1, 0);
      const os = range(0.1, 5, 0.1, 1);
      const delBtn = el("button", "hud-scene__btn", "delete");
      delBtn.type = "button";

      const currentObj = (): SceneObject | undefined =>
        curScene.objects.find((x) => x.id === objSel.value);
      const loadObj = (): void => {
        const o = currentObj();
        if (!o) return;
        setIdle(ox, String(o.position.x));
        setIdle(oy, String(o.position.y));
        setIdle(oz, String(o.position.z));
        // Uniform slider tracks the LARGEST axis so a non-uniform object keeps a
        // meaningful handle (F5).
        setIdle(os, String(Math.max(o.scale.x, o.scale.y, o.scale.z)));
      };
      loadObj();
      objSel.addEventListener("change", loadObj);

      const pushPos = debounce(() => {
        this.controls.updateObject(objSel.value, {
          position: v(Number(ox.value), Number(oy.value), Number(oz.value)),
        });
      }, 120);
      // Multiply every axis by newMax/currentMax so a non-uniform object (e.g.
      // scale 1,0.35,1) keeps its ratio instead of flattening to v(s,s,s) (F5).
      const pushScale = debounce(() => {
        const o = currentObj();
        if (!o) return;
        const curMax = Math.max(o.scale.x, o.scale.y, o.scale.z);
        const k = curMax > 0 ? Number(os.value) / curMax : 1;
        this.controls.updateObject(objSel.value, {
          scale: v(o.scale.x * k, o.scale.y * k, o.scale.z * k),
        });
      }, 120);
      for (const r of [ox, oy, oz]) r.addEventListener("input", pushPos);
      os.addEventListener("input", pushScale);
      delBtn.addEventListener("click", () => this.controls.removeObject(objSel.value));

      const objRow = el("div", "hud-scene__row");
      objRow.append(
        field("obj", objSel),
        field("x", ox),
        field("y", oy),
        field("z", oz),
        field("scale", os),
        delBtn,
      );
      wrap.append(objRow);
      refreshers.push(loadObj);
    }

    // --- light editor: pick an index, drag position / intensity / colour ------
    if (scene.lights.length > 0) {
      const lightSel = select(scene.lights.map((_, i) => String(i)));
      this.lightSel = lightSel;
      if (prevLight !== undefined && Number(prevLight) < lightCount) lightSel.value = prevLight;
      const lx = range(bmin.x - 2, bmax.x + 2, 0.1, 0);
      const ly = range(bmin.y - 2, bmax.y + 2, 0.1, 0);
      const lz = range(bmin.z - 2, bmax.z + 2, 0.1, 0);
      const li = range(0, 200, 1, 0);
      const colour = el("input", "hud-scene__colour");
      colour.type = "color";

      const loadLight = (): void => {
        const l = curScene.lights[Number(lightSel.value)];
        if (!l) return;
        setIdle(lx, String(l.position.x));
        setIdle(ly, String(l.position.y));
        setIdle(lz, String(l.position.z));
        setIdle(li, String(l.intensity));
        setIdle(colour, `#${l.color.toString(16).padStart(6, "0")}`);
      };
      loadLight();
      lightSel.addEventListener("change", loadLight);

      const pushLight = debounce(() => {
        this.controls.updateLight(Number(lightSel.value), {
          position: v(Number(lx.value), Number(ly.value), Number(lz.value)),
          intensity: Number(li.value),
          color: parseInt(colour.value.slice(1), 16),
        });
      }, 120);
      for (const r of [lx, ly, lz, li]) r.addEventListener("input", pushLight);
      colour.addEventListener("input", pushLight);

      const lightRow = el("div", "hud-scene__row");
      lightRow.append(
        field("light", lightSel),
        field("x", lx),
        field("y", ly),
        field("z", lz),
        field("int", li),
        field("col", colour),
      );
      wrap.append(lightRow);
      refreshers.push(loadLight);
    }

    // --- reset scene --------------------------------------------------------
    const resetBtn = el("button", "hud-scene__reset", "reset scene");
    resetBtn.type = "button";
    resetBtn.addEventListener("click", () => this.controls.resetScene());
    wrap.append(resetBtn);

    this.sceneEditor.append(wrap);

    this.sceneObjIds = objIds;
    this.sceneLightCount = lightCount;
    this.sceneReconcile = (s: SceneConfig): void => {
      curScene = s;
      for (const refresh of refreshers) refresh();
    };
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
  }
}
