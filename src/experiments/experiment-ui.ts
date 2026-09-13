import type { MovementCommand, MovementMode } from "../body/movement";
import { parameterHelp } from "../ui/parameter-help";
import { CONFIG } from "../app/config";
import type { Intervention } from "../bridge/sim-bridge";
import type { Dataset } from "../data/dataset";
import "./experiments.css";

export interface FlyCard {
  seed: number;
  name: string;
  color: string;
  escape: number;
  tick: number;
  active: number;
  hz: number;
  tonic: boolean;
  drive: number;
  modalities: boolean;
  flow: boolean;
  movementMode: MovementMode;
}
export class ExperimentUi {
  readonly root = document.createElement("section");
  private selected = 0;
  private cells: number[] = [];
  private selection: HTMLElement;
  private log: HTMLElement;
  private roster: HTMLElement;
  private traces: SVGSVGElement;
  private history: { tick: number; value: number }[][] = [];
  private lastTicks: number[] = [];
  private paths: SVGPolylineElement[] = [];
  private buttons: HTMLButtonElement[] = [];
  private targets: HTMLSelectElement;
  private notice = "Ready · select a target, then pulse";
  constructor(
    private data: Dataset,
    private actions: {
      movement(command: MovementCommand): void;
      flow(enabled: boolean): void;
      select(index: number): void;
      depth(n: number): void;
      randomize(): void;
      modalities(enabled: boolean): void;
      add(): void;
      remove(): void;
      reset(): void;
      intervene(command: Intervention): void;
      chooseCells(indices: number[]): void;
      peers(enabled: boolean): void;
    },
  ) {
    this.root.className = "experiment-ui";
    this.root.innerHTML = `<div class="fly-roster" aria-label="Fly roster"></div><div class="experiment-actions"><button data-action="add">+ add fly</button><button data-action="remove">remove selected</button><button data-action="reset">reset trial</button><button data-action="features" title="Randomize selected fly body proportions and wing span; cosmetic only">randomize features</button><label><input class="peer-toggle" type="checkbox" checked> see other flies</label><label><input class="tonic-toggle" type="checkbox" checked> tonic flight drive</label></div>
    <label class="experiment-depth">Flight drive <input class="flight-drive" type="range" min="0.25" max="1.2" step="0.01" value="0.85" aria-label="Flight drive strength"><output class="flight-drive-value">0.85</output></label>
    <label class="experimental-inputs" title="Experimental sensory current proxies; enabling selects full brain depth"><input type="checkbox" class="modalities-toggle"> light / wind inputs</label><label class="experiment-depth">Neurons <select class="brain-depth" aria-label="Selected fly brain depth"><option value="1585">1,585 · compact circuit</option><option value="10000">10,000 neurons</option><option value="50000">50,000 neurons</option><option value="166700">166,700 · full MaleCNS</option><option value="custom" disabled>Custom (slider)</option></select></label>
    <details class="movement-controls" open><summary>Move selected fly <span class="movement-status"></span></summary><p>Assisted body controls · hover holds position · neural control releases assistance</p><div class="movement-buttons"><button data-move="forward">forward</button><button data-move="backward">backward</button><button data-move="left">slide left</button><button data-move="right">slide right</button><button data-move="up">climb</button><button data-move="down">descend</button><button data-move="turn_left">turn left 45°</button><button data-move="turn_right">turn right 45°</button><button data-move="land">land</button><button data-move="takeoff">take off</button><button data-move="hover">hover / stop</button><button data-move="release">neural control</button></div><label title="Experimental motion-contrast current into HS cells; not a reconstructed retina. Enabling selects full brain depth."><input type="checkbox" class="flow-toggle"> optic-flow proxy</label></details>
    <details class="experiment-console" open><summary>Neural experiments <span class="experiment-selection"></span></summary><div class="experiment-tools">
    <select aria-label="Stimulation target"><option value="looming">Looming · LC4 / LPLC2</option><option value="escape">Escape · giant fibers</option><option value="power_l">Left wing power</option><option value="power_r">Right wing power</option><option value="steer_l">Left steering motors</option><option value="steer_r">Right steering motors</option><option value="dnp03_l">Left DNp03 · saccade candidate</option><option value="dnp03_r">Right DNp03 · saccade candidate</option><option value="thrust">Legacy thrust group</option><option value="wing_l">Left wing motors</option><option value="wing_r">Right wing motors</option><option value="leg_lf">Left front leg</option><option value="leg_lm">Left middle leg</option><option value="leg_lh">Left hind leg</option><option value="leg_rf">Right front leg</option><option value="leg_rm">Right middle leg</option><option value="leg_rh">Right hind leg</option><option value="selection">Inspector selection</option></select>
    <label>drive <input class="amplitude" type="number" min="-5" max="5" step=".1" value="1.5" aria-label="Stimulus amplitude"></label><label>ms <input class="duration" type="number" min="5" max="10000" step="5" value="400" aria-label="Stimulus duration in milliseconds"></label>
    <button data-action="pulse">pulse</button><button data-action="hold">hold</button><button data-action="silence">silence</button><button data-action="restore">restore</button><button data-action="stop">stop pulse / restore cells</button></div>
    <div class="experiment-log" role="status"></div><svg class="experiment-traces" viewBox="0 0 600 44" preserveAspectRatio="none" aria-label="Escape activity traces for each fly"></svg><div class="experiment-caption">Escape activity · last 10 simulated seconds · independent neural state · light: ON-current proxy · wind: JO-E current proxy · opt-in, experimental</div></details>`;
    document.body.append(this.root);
    const pathPreset = document.createElement("option");
    pathPreset.value = String(data.circuitProfile.minimumDepth);
    pathPreset.textContent = `Saccade paths · ${data.circuitProfile.minimumDepth.toLocaleString()}`;
    pathPreset.title =
      "Includes every retained DNp03-to-steering path up to three edges. Longer and recurrent influences still depend on depth.";
    this.root.querySelector(".brain-depth")!.append(pathPreset);
    this.root
      .querySelectorAll<HTMLButtonElement>("[data-move]")
      .forEach((button) =>
        button.addEventListener("click", () =>
          actions.movement(button.dataset.move as MovementCommand),
        ),
      );
    this.root
      .querySelector<HTMLInputElement>(".flow-toggle")!
      .addEventListener("change", (e) => actions.flow((e.target as HTMLInputElement).checked));
    this.root.querySelectorAll<HTMLOptionElement>("option").forEach((option) => {
      const help = parameterHelp(option.value);
      if (help) option.title = help;
    });
    this.root
      .querySelector<HTMLInputElement>(".modalities-toggle")!
      .addEventListener("change", (e) =>
        actions.modalities((e.target as HTMLInputElement).checked),
      );
    this.roster = this.root.querySelector(".fly-roster")!;
    this.selection = this.root.querySelector(".experiment-selection")!;
    this.log = this.root.querySelector(".experiment-log")!;
    this.traces = this.root.querySelector("svg")!;
    this.targets = this.root.querySelector('select[aria-label="Stimulation target"]')!;
    this.root
      .querySelector<HTMLSelectElement>(".brain-depth")!
      .addEventListener("change", (e) =>
        actions.depth(Number((e.target as HTMLSelectElement).value)),
      );
    this.targets.addEventListener("change", () => this.chooseTarget());
    this.root
      .querySelector<HTMLInputElement>(".peer-toggle")!
      .addEventListener("change", (e) => actions.peers((e.target as HTMLInputElement).checked));
    this.root.querySelector<HTMLInputElement>(".tonic-toggle")!.addEventListener("change", (e) => {
      actions.intervene({
        kind: "tonic",
        cells: data.motors.tonic,
        amplitude: (e.target as HTMLInputElement).checked
          ? Number(this.root.querySelector<HTMLInputElement>(".flight-drive")!.value)
          : 0,
      });
      this.notice = "Tonic motor drive changed for selected fly";
    });
    const drive = this.root.querySelector<HTMLInputElement>(".flight-drive")!;
    drive.value = String(CONFIG.flight.tonicDrive);
    drive.title =
      "Modeled current to wing power motors. Higher values sustain more activity; not a measured biological parameter.";
    drive.addEventListener("input", () => {
      this.root.querySelector(".flight-drive-value")!.textContent = Number(drive.value).toFixed(2);
      actions.intervene({
        kind: "tonic",
        cells: data.motors.tonic,
        amplitude: Number(drive.value),
      });
    });
    this.root.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((button) =>
      button.addEventListener("click", () => {
        const kind = button.dataset.action!;
        if (kind === "add") actions.add();
        else if (kind === "features") {
          actions.randomize();
          this.notice = "Selected fly appearance randomized · cosmetic traits only";
        } else if (kind === "remove") actions.remove();
        else if (kind === "reset") {
          actions.reset();
          this.history = [];
          this.lastTicks = [];
          this.notice = "Trial reset · neural state and interventions cleared";
        } else {
          const amplitude = Number(this.root.querySelector<HTMLInputElement>(".amplitude")!.value);
          const durationMs = Number(this.root.querySelector<HTMLInputElement>(".duration")!.value);
          actions.intervene({
            kind: kind as Intervention["kind"],
            cells: this.cells,
            amplitude,
            durationMs,
          });
          this.notice = `${kind} · ${this.cells.length} cells${kind === "pulse" ? ` · ${durationMs} ms of simulation time` : ""}`;
        }
        this.log.textContent = this.notice;
      }),
    );
    this.chooseTarget();
  }
  private chooseTarget() {
    const name = this.targets.value;
    if (name !== "selection") {
      this.cells =
        this.data.parsedGroups.inputRoles[name] ?? this.data.parsedGroups.readoutRoles[name] ?? [];
      this.actions.chooseCells(this.cells);
    }
    this.targets.title = parameterHelp(name) ?? "Select neurons to stimulate or silence";
    this.selection.textContent = `${this.cells.length} cells`;
  }
  setCells(cells: number[]) {
    this.cells = cells;
    this.targets.value = "selection";
    this.selection.textContent = `${cells.length} cells`;
  }
  setSelected(index: number) {
    this.selected = index;
    this.root.querySelector<HTMLInputElement>(".tonic-toggle")!.checked = true;
    this.notice = "Selected fly · interventions apply here";
  }
  update(cards: FlyCard[], paused: boolean) {
    const mode = cards[this.selected]?.movementMode ?? "neural";
    this.root.querySelector(".movement-status")!.textContent = paused ? `${mode} · paused` : mode;
    this.root.querySelector<HTMLInputElement>(".flow-toggle")!.checked =
      cards[this.selected]?.flow ?? false;
    this.root.querySelectorAll<HTMLButtonElement>("[data-move]").forEach((button) => {
      const cmd = button.dataset.move;
      button.disabled =
        paused ||
        (cmd === "takeoff"
          ? mode !== "grounded" && mode !== "landing"
          : mode === "grounded" && cmd !== "release");
    });
    this.root.querySelector<HTMLInputElement>(".modalities-toggle")!.checked =
      cards[this.selected]?.modalities ?? false;
    const drive = this.root.querySelector<HTMLInputElement>(".flight-drive")!;
    if (document.activeElement !== drive)
      drive.value = String(cards[this.selected]?.drive ?? CONFIG.flight.tonicDrive);
    this.root.querySelector(".flight-drive-value")!.textContent = Number(drive.value).toFixed(2);
    const depth = this.root.querySelector<HTMLSelectElement>(".brain-depth")!;
    const count = cards[this.selected]?.active ?? 1585;
    const activeTargets = this.cells.filter((i) => i < count).length;
    this.selection.textContent = `${activeTargets}/${this.cells.length} cells active`;
    this.selection.title =
      "Pulse or hold automatically increases depth to include the selected target cells.";
    depth.value = [1585, 10000, 50000, 166700, this.data.circuitProfile.minimumDepth].includes(
      count,
    )
      ? String(count)
      : "custom";
    this.root.querySelector<HTMLInputElement>(".tonic-toggle")!.checked =
      cards[this.selected]?.tonic ?? true;
    if (cards.length !== this.buttons.length) {
      this.history = [];
      this.lastTicks = [];
      this.roster.replaceChildren();
      this.traces.replaceChildren();
      this.buttons = [];
      this.paths = [];
      cards.forEach((_card, i) => {
        const button = document.createElement("button");
        button.addEventListener("click", () => this.actions.select(i));
        this.roster.append(button);
        this.buttons.push(button);
        const path = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
        path.setAttribute("fill", "none");
        path.setAttribute("stroke-width", "1.5");
        this.traces.append(path);
        this.paths.push(path);
      });
    }
    cards.forEach((c, i) => {
      const button = this.buttons[i]!;
      button.style.setProperty("--fly-color", c.color);
      button.classList.toggle("selected", i === this.selected);
      button.setAttribute("aria-pressed", String(i === this.selected));
      button.title =
        c.active.toLocaleString() + " neurons · " + Math.round(c.hz) + " Hz · seed " + c.seed;
      button.textContent = c.name;
      if (!paused && c.tick !== this.lastTicks[i]) {
        const h = (this.history[i] ??= []);
        h.push({ tick: c.tick, value: c.escape });
        while (h.length && h[0]!.tick < c.tick - 2000) h.shift();
        this.lastTicks[i] = c.tick;
        this.paths[i]!.setAttribute(
          "points",
          h
            .map((v) => `${600 - (c.tick - v.tick) * 0.3},${42 - Math.min(1, v.value) * 40}`)
            .join(" "),
        );
        this.paths[i]!.setAttribute("stroke", c.color);
      }
    });
    this.log.textContent = `${paused ? "Paused · pulses wait for resume. " : ""}${this.notice}`;
    (this.root.querySelector('[data-action="add"]') as HTMLButtonElement).disabled =
      cards.length >= 6;
    (this.root.querySelector('[data-action="remove"]') as HTMLButtonElement).disabled =
      cards.length <= 1;
  }
  dispose() {
    this.root.remove();
  }
}
