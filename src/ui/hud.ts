// DOM overlay HUD — declarative glue, NOT unit-tested (vitest env is `node`, no
// DOM). Covered by `tsc` + `eslint` + `vite build` + the manual checklist.
//
// Zero business logic here: the HUD reads `scale.ts` outputs and sets element
// properties, nothing more. Framework-free — no `three`, no `body/` or `bridge/`
// internals beyond the type-only `HudControls`/`HudModel`/`HudFrame` contract.

import type { HudControls, HudFrame, HudModel, Theme } from "./controls";
import type { SceneConfig } from "../scene.config";
import { countToSlider, meterFraction, sliderToCount, type MeterKind } from "./scale";

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

    body.append(header, depth, meters, pauseButton);
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
