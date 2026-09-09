// DOM overlay HUD — declarative glue, NOT unit-tested (vitest env is `node`, no
// DOM). Covered by `tsc` + `eslint` + `vite build` + the manual checklist.
//
// Zero business logic here: the HUD reads `scale.ts` outputs and sets element
// properties, nothing more. Framework-free — no `three`, no `body/` or `bridge/`
// internals beyond the type-only `HudControls`/`HudModel`/`HudFrame` contract.

import type { HudControls, HudFrame, HudModel, Theme } from "./controls";
import type { SceneConfig } from "../scene.config";
import type { LifParams } from "../bridge/sim-bridge";
import {
  countToSlider,
  lifSlider,
  lifSliderPos,
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
  private paused = false;
  private collapsed = false;

  constructor(root: HTMLElement, controls: HudControls, model: HudModel) {
    this.root = root;
    root.id = "hud";
    root.dataset.theme = model.theme;

    const body = el("div", "hud-body");
    this.body = body;

    // --- top-right header: project name + live sim_hz --------------------
    const header = el("div", "hud-header");
    header.append(el("span", "hud-header__name", "fly-playground"));
    const hz = el("span", "hud-header__hz");
    hz.append(document.createTextNode("sim "));
    this.hzSpan = el("span");
    this.hzSpan.dataset.role = "simhz";
    this.hzSpan.textContent = "0";
    hz.append(this.hzSpan, document.createTextNode(" hz"));
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

    // Scene editor — empty shell; `syncScene` (Task 10) fills the body.
    const sceneEditor = el("fieldset", "hud-scene");
    sceneEditor.dataset.role = "scene-editor";
    sceneEditor.dataset.collapsed = "true";
    const sceneLegend = el("legend", "hud-scene__legend", "scene");
    sceneLegend.addEventListener("click", () => {
      sceneEditor.dataset.collapsed = sceneEditor.dataset.collapsed === "true" ? "false" : "true";
    });
    sceneEditor.append(sceneLegend, el("div", "hud-scene__body"));

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
    this.hzSpan.textContent = frame.simHz.toFixed(0);
    this.depthLabel.textContent = String(frame.activeCount);
    for (const { fill, value, spec } of this.meters) {
      const src = spec.source === "readouts" ? frame.readouts : frame.sensory;
      const raw = src[spec.key] ?? 0;
      fill.style.inlineSize = `${meterFraction(raw, spec.kind) * 100}%`;
      value.textContent = raw.toFixed(2);
    }
    if (this.paused !== frame.paused) this.setPaused(frame.paused);
  }

  setTheme(theme: Theme): void {
    this.root.dataset.theme = theme;
  }

  syncScene(scene: SceneConfig): void {
    // Task 10 fills this in (runtime scene edits -> HUD scene panel on this.body).
    void scene;
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
  }
}
