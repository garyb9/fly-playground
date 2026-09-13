import type { Dataset } from "../data/dataset";
import { CONFIG } from "../app/config";
import { validateAssay, type AssayDefinition, type AssayResult } from "./assay";

export class AssayUi {
  readonly root = document.createElement("details");
  private worker: Worker | null = null;
  private definition: AssayDefinition | null = null;
  private results: AssayResult[] = [];
  private status: HTMLElement;
  private plot: HTMLElement;
  private runButton: HTMLButtonElement;
  constructor(
    private data: Dataset,
    private selected: () => { seed: number; active: number },
  ) {
    this.root.className = "assay-ui";
    this.root.innerHTML = `<summary>Matched causal assay · save / replay</summary><p>Isolated control, stimulated, and pathway-silenced and restored conditions. Same seed, 5 ms steps, tonic drive and starting body. Live flies continue separately.</p><div class="experiment-tools"><label>circuit <select class="assay-kind"><option value="looming">Looming → escape</option><option value="steer_l">Left steering motors</option><option value="steer_r">Right steering motors</option><option value="dnp03_l">Left DNp03 → steering</option><option value="dnp03_r">Right DNp03 → steering</option></select></label><label>seed <input class="assay-seed" type="number" min="0" max="4294967295" step="1" value="42"></label><button class="assay-run">run matched assay</button><button class="assay-save" disabled>save assay + traces</button><label>load assay <input class="assay-load" type="file" accept=".json,application/json"></label><button class="assay-replay" disabled>replay loaded assay</button></div><div class="assay-status" role="status"></div><div class="assay-plot"></div>`;
    this.status = this.root.querySelector(".assay-status")!;
    this.plot = this.root.querySelector(".assay-plot")!;
    this.runButton = this.root.querySelector(".assay-run")!;
    this.runButton.addEventListener("click", () => {
      const seed = Number(this.root.querySelector<HTMLInputElement>(".assay-seed")!.value);
      const roles = this.data.parsedGroups.readoutRoles;
      const kind = this.root.querySelector<HTMLSelectElement>(".assay-kind")!.value;
      const targets =
        kind === "looming" ? (data.parsedGroups.inputRoles.looming ?? []) : (roles[kind] ?? []);
      this.definition = {
        version: 1,
        graphVersion: data.version,
        seed,
        activeCount: this.selected().active,
        params: { ...CONFIG.lif.defaults, dtMs: 5, noiseSigma: 0 },
        pulse: {
          startTick: 80,
          durationTicks: 80,
          amplitude: 1.5,
          cells: targets,
        },
        silence:
          kind === "looming"
            ? (roles.escape ?? [])
            : kind.startsWith("dnp03")
              ? [...(roles.steer_l ?? []), ...(roles.steer_r ?? [])]
              : targets,
        readouts: Object.fromEntries(
          Object.entries(roles).map(([name, ids]) => [
            name,
            ids.filter((i) => i < this.selected().active),
          ]),
        ),
        tonic: {
          cells: data.motors.tonic,
          amplitude: CONFIG.flight.tonicDrive,
        },
        ticks: 320,
      };
      this.run();
    });
    this.root.querySelector(".assay-replay")!.addEventListener("click", () => this.run());
    this.root.querySelector(".assay-save")!.addEventListener("click", () => {
      if (!this.definition) return;
      const url = URL.createObjectURL(
        new Blob(
          [JSON.stringify({ definition: this.definition, results: this.results }, null, 2)],
          { type: "application/json" },
        ),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "fly-assay.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    this.root
      .querySelector<HTMLInputElement>(".assay-load")!
      .addEventListener("change", async (e) => {
        try {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (!file) return;
          if (file.size > 5_000_000) throw new Error("Assay file exceeds 5 MB.");
          const saved = JSON.parse(await file.text());
          this.definition = validateAssay(
            saved.definition,
            data.version,
            data.nf.count,
            data.nf.coreCount,
          );
          this.root.querySelector<HTMLButtonElement>(".assay-replay")!.disabled = false;
          this.status.textContent =
            "Assay loaded and graph version verified. Replay uses saved parameters and seed.";
        } catch (error) {
          this.status.textContent = String(error);
        }
      });
  }
  private run() {
    if (this.worker || !this.definition) return;
    try {
      validateAssay(this.definition, this.data.version, this.data.nf.count, this.data.nf.coreCount);
    } catch (error) {
      this.status.textContent = String(error);
      return;
    }
    this.runButton.disabled = true;
    this.root.querySelector<HTMLInputElement>(".assay-load")!.disabled = true;
    this.root.querySelector<HTMLButtonElement>(".assay-replay")!.disabled = true;
    this.root.querySelector<HTMLButtonElement>(".assay-save")!.disabled = true;
    this.status.textContent = "Running isolated fixed-tick comparison…";
    const worker = (this.worker = new Worker(new URL("./assay.worker.ts", import.meta.url), {
      type: "module",
    }));
    const finish = () => {
      worker.terminate();
      this.worker = null;
      this.runButton.disabled = false;
      this.root.querySelector<HTMLInputElement>(".assay-load")!.disabled = false;
      this.root.querySelector<HTMLButtonElement>(".assay-replay")!.disabled = false;
    };
    worker.onerror = (e) => {
      this.status.textContent = e.message;
      finish();
    };
    worker.onmessage = (e) => {
      if (e.data.error) {
        this.status.textContent = e.data.error;
        finish();
      } else if (e.data.results) {
        this.results = e.data.results;
        this.paint();
        this.root.querySelector<HTMLButtonElement>(".assay-save")!.disabled = false;
        this.root.querySelector<HTMLButtonElement>(".assay-replay")!.disabled = false;
        finish();
      } else this.status.textContent = "Completed " + e.data.progress;
    };
    const neurons = this.data.neurons.slice(0),
      graph = this.data.graph.slice(0);
    worker.postMessage({ definition: this.definition, neurons, graph }, [neurons, graph]);
  }
  private paint() {
    this.plot.replaceChildren();
    const colors = ["#79c9c3", "#e9b25c", "#b7a0ed", "#ef8f9c"];
    const d = this.definition!;
    for (const [key, title] of [
      ["stimulus", "Injected drive"],
      ["escape", "Escape activity"],
      ["descending", "DNp03 L − R"],
      ["steering", "Steering L − R"],
      ["power", "Wing power"],
      ["height", "Body height"],
      ["speed", "Body speed"],
      ["heading", "Heading (radians)"],
    ] as const) {
      const row = document.createElement("div");
      row.className = "assay-chart";
      const label = document.createElement("span");
      label.textContent = title;
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 600 48");
      svg.setAttribute("aria-label", title + " against simulation time");
      svg.setAttribute("role", "img");
      const values = this.results.flatMap((r) => r.samples.map((s) => s[key]));
      const min = Math.min(0, ...values),
        max = Math.max(0.01, ...values);
      this.results.forEach((r, i) => {
        const line = document.createElementNS(svg.namespaceURI, "polyline");
        line.setAttribute(
          "points",
          r.samples
            .map((s) => `${(s.tick / d.ticks) * 600},${46 - ((s[key] - min) / (max - min)) * 44}`)
            .join(" "),
        );
        line.setAttribute("fill", "none");
        line.setAttribute("stroke", colors[i]!);
        line.setAttribute("stroke-width", "1.5");
        svg.append(line);
      });
      row.append(label, svg);
      this.plot.append(row);
    }
    this.status.textContent =
      this.results
        .map(
          (r) =>
            `${r.condition}: peak ${r.peakEscape.toFixed(3)}, final height ${r.finalHeight.toFixed(3)}`,
        )
        .join(" · ") +
      " | teal control · gold stimulated · purple silenced · pink restored · 0–" +
      (d.ticks * d.params.dtMs) / 1000 +
      " simulated seconds. Model test, not biological validation.";
  }
  dispose() {
    this.worker?.terminate();
    this.root.remove();
  }
}
