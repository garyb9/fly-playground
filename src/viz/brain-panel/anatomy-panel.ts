import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Dataset } from "../../data/dataset";
import type { FrameView } from "../../app/loop";
import type { Theme } from "../../ui/controls";
import "./anatomy.css";
import { connectionActivity, circuitActivity, regionActivity } from "./activity";
import { explainParameter } from "../../ui/parameter-help";

export class AnatomyPanel {
  readonly root = document.createElement("section");
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(40, 1, 0.01, 50);
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private observer: ResizeObserver;
  private abort = new AbortController();
  private surfaces = new THREE.Group();
  private arbors = new THREE.Group();
  private points: THREE.Points;
  private context: THREE.Points;
  private edges = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: 0xffce87, transparent: true, opacity: 0.35 }),
  );
  private regionGlow = false;
  private lastRegionPaint = -Infinity;
  private regionStatus = document.createElement("div");
  private livePositions = new Float32Array(6000);
  private liveColors = new Float32Array(6000);
  private liveEdges = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    }),
  );
  private activityMeters: { cells: number[]; meter: HTMLMeterElement; value: HTMLElement }[] = [];
  private selected = new Set<number>();
  private colors: Float32Array;
  private hidden = new Set<number>();
  private theme: Theme = "dark";
  private label: HTMLElement;
  private status: HTMLElement;
  private lost = false;
  private disposed = false;
  private expanded = false;
  private lastPaint = -Infinity;
  private previousCount = 0;
  onSelection: (indices: number[]) => void = () => {};
  constructor(
    private data: Dataset,
    theme: Theme,
  ) {
    this.root.className = "anatomy-panel";
    this.root.setAttribute("aria-label", "MaleCNS anatomical brain inspector");
    this.root.innerHTML = `<header><div><small>MALECNS / V1.0</small><h2>Inside the fly</h2></div><button class="anatomy-expand" title="Expand brain inspector">expand ↗</button></header>
      <div class="anatomy-viewport"><canvas aria-label="Measured brain regions and simulated circuit. Drag to orbit; click a cell to inspect."></canvas><span class="anatomy-hint">drag to orbit · scroll to zoom · click to inspect</span></div>
      <div class="anatomy-status"></div><div class="anatomy-layers"></div>
      <details><summary>Regions & layers</summary><div class="anatomy-regions"></div></details>
      <label class="anatomy-search">Find a cell <input placeholder="type or body ID, e.g. DNp01" aria-label="Find neuron by type or body ID"></label>
      <select class="anatomy-results" aria-label="Matching neurons"></select><p class="anatomy-cell">Select a circuit or cell to inspect its connections.</p>
      <footer>139,662 measured somata / 166,700 neurons<br>Measured anatomy · modeled activity<br><a href="https://male-cns.janelia.org/download/" target="_blank" rel="noopener">FlyEM · Cambridge · MRC LMB · Google / CC BY 4.0</a></footer>`;
    document.body.append(this.root);
    const canvas = this.root.querySelector("canvas")!;
    this.status = this.root.querySelector(".anatomy-status")!;
    this.label = this.root.querySelector(".anatomy-cell")!;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setClearColor(0, 0);
    this.camera.position.set(0, 0.05, 3.3);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 0, 0);
    this.controls.enableDamping = false;
    this.controls.minDistance = 0.3;
    this.controls.maxDistance = 9;
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.6));
    const light = new THREE.DirectionalLight(0xc5e5ff, 2.5);
    light.position.set(-1, 2, 3);
    this.scene.add(light);
    for (const region of data.regions) {
      const dv = new DataView(data.meshes, region.offset, region.bytes);
      const n = dv.getUint32(0, true),
        count = dv.getUint32(4, true);
      if (8 + n * 12 + count * 4 !== region.bytes) throw new Error("Invalid anatomical mesh");
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(
          new Float32Array(data.meshes.slice(region.offset + 8, region.offset + 8 + n * 12)),
          3,
        ),
      );
      geometry.setIndex(
        new THREE.BufferAttribute(
          new Uint32Array(
            data.meshes.slice(region.offset + 8 + n * 12, region.offset + region.bytes),
          ),
          1,
        ),
      );
      geometry.computeVertexNormals();
      const color = /ME|LO|LA\(/.test(region.name)
        ? 0x539ebc
        : /EB|FB|PB|NO/.test(region.name)
          ? 0xeab778
          : /AL\(/.test(region.name)
            ? 0xa9cc83
            : 0x8e8dbd;
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshPhongMaterial({
          color,
          transparent: true,
          opacity: 0.16,
          depthWrite: false,
          side: THREE.DoubleSide,
          shininess: 35,
        }),
      );
      mesh.name = region.name;
      this.surfaces.add(mesh);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(data.nf.pos.slice(), 3));
    this.colors = new Float32Array(data.nf.count * 3);
    geo.setAttribute("color", new THREE.BufferAttribute(this.colors, 3));
    geo.setIndex(data.cells.flatMap((_c, i) => (data.nf.flags[i]! & 16 ? [] : [i])));
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: 0.005,
        vertexColors: true,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      }),
    );
    const ctx = new THREE.BufferGeometry();
    ctx.setAttribute("position", new THREE.BufferAttribute(new Float32Array(data.context), 3));
    this.context = new THREE.Points(
      ctx,
      new THREE.PointsMaterial({
        size: 0.0025,
        color: 0x79b3bc,
        transparent: true,
        opacity: 0.15,
        depthWrite: false,
      }),
    );
    for (const skeleton of data.skeletons) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(skeleton.positions, 3));
      const line = new THREE.LineSegments(
        g,
        new THREE.LineBasicMaterial({
          color: skeleton.type === "DNp01" ? 0xffc77b : 0x8bd2cb,
          transparent: true,
          opacity: 0.75,
        }),
      );
      line.userData.index = skeleton.index;
      this.arbors.add(line);
    }
    this.liveEdges.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.livePositions, 3),
    );
    this.liveEdges.geometry.setAttribute("color", new THREE.BufferAttribute(this.liveColors, 3));
    this.liveEdges.geometry.setDrawRange(0, 0);
    this.scene.add(
      this.surfaces,
      this.context,
      this.arbors,
      this.points,
      this.edges,
      this.liveEdges,
    );
    const activity = document.createElement("details");
    activity.open = true;
    activity.className = "anatomy-activity";
    activity.innerHTML = "<summary>Live circuit activity</summary>";
    for (const [name, cells] of Object.entries({
      ...data.parsedGroups.inputRoles,
      ...data.parsedGroups.readoutRoles,
    })) {
      if (!cells.length) continue;
      const row = document.createElement("label"),
        meter = document.createElement("meter"),
        value = document.createElement("span");
      meter.min = 0;
      explainParameter(row, name);
      meter.max = 1;
      meter.value = 0;
      meter.setAttribute("aria-label", name + " mean activity");
      row.append(name.replaceAll("_", " "), meter, value);
      activity.append(row);
      this.activityMeters.push({ cells, meter, value });
    }
    this.root.querySelector(".anatomy-status")!.after(activity);
    const layers = this.root.querySelector(".anatomy-layers")!;
    for (const [name, object] of [
      ["surface", this.surfaces],
      ["somata", this.context],
      ["circuit", this.points],
      ["arbors", this.arbors],
      ["active paths", this.liveEdges],
    ] as const) {
      const label = document.createElement("label"),
        box = document.createElement("input");
      box.type = "checkbox";
      box.checked = true;
      box.addEventListener("change", () => (object.visible = box.checked), {
        signal: this.abort.signal,
      });
      label.append(box, name);
      layers.append(label);
    }
    const regions = this.root.querySelector(".anatomy-regions")!;
    const opacity = document.createElement("input");
    opacity.type = "range";
    opacity.min = "0";
    opacity.max = "0.65";
    opacity.step = ".01";
    opacity.value = ".16";
    opacity.setAttribute("aria-label", "Brain surface opacity");
    opacity.addEventListener(
      "input",
      () =>
        this.surfaces.children.forEach(
          (o) =>
            (((o as THREE.Mesh).material as THREE.MeshPhongMaterial).opacity = Number(
              opacity.value,
            )),
        ),
      { signal: this.abort.signal },
    );
    regions.append(opacity);
    const regionSelect = document.createElement("select");
    regionSelect.setAttribute("aria-label", "Isolate anatomical region");
    regionSelect.add(new Option("All 90 brain regions", ""));
    for (const r of data.regions) regionSelect.add(new Option(r.name, r.name));
    regionSelect.addEventListener(
      "change",
      () =>
        this.surfaces.children.forEach(
          (o) => (o.visible = !regionSelect.value || o.name === regionSelect.value),
        ),
      { signal: this.abort.signal },
    );
    regions.append(regionSelect);
    const glowLabel = document.createElement("label"),
      glow = document.createElement("input");
    glow.type = "checkbox";
    glow.addEventListener("change", () => {
      this.regionGlow = glow.checked;
      this.lastRegionPaint = -Infinity;
    });
    glowLabel.append(glow, "region activity · synapse-weighted");
    regions.append(glowLabel, this.regionStatus);
    this.regionStatus.className = "anatomy-region-status";
    this.regionStatus.textContent =
      "Measured ROI membership; activity is per neuron, not per axon compartment.";
    const input = this.root.querySelector(".anatomy-search input") as HTMLInputElement;
    const results = this.root.querySelector(".anatomy-results") as HTMLSelectElement;
    const search = () => {
      results.replaceChildren(new Option("Choose neuron…", ""));
      data.cells.forEach((c, i) => {
        if (
          `${c.type} ${c.id}`.toLowerCase().includes(input.value.toLowerCase()) &&
          results.length < 100
        )
          results.add(new Option(`${c.type} ${c.side} · ${c.id}`, String(i)));
      });
    };
    input.addEventListener("input", search, { signal: this.abort.signal });
    search();
    results.addEventListener(
      "change",
      () => {
        if (results.value !== "") this.select([Number(results.value)]);
      },
      { signal: this.abort.signal },
    );
    let down = new THREE.Vector2();
    canvas.addEventListener(
      "pointerdown",
      (e) => {
        down = new THREE.Vector2(e.clientX, e.clientY);
      },
      { signal: this.abort.signal },
    );
    canvas.addEventListener(
      "pointerup",
      (e) => {
        if (down.distanceTo(new THREE.Vector2(e.clientX, e.clientY)) > 4) return;
        const r = canvas.getBoundingClientRect();
        const ray = new THREE.Raycaster();
        ray.params.Points!.threshold = 0.025;
        ray.setFromCamera(
          new THREE.Vector2(
            ((e.clientX - r.left) / r.width) * 2 - 1,
            1 - ((e.clientY - r.top) / r.height) * 2,
          ),
          this.camera,
        );
        const hit = ray.intersectObject(this.points)[0];
        if (hit?.index !== undefined) this.select([hit.index]);
      },
      { signal: this.abort.signal },
    );
    this.root.querySelector(".anatomy-expand")!.addEventListener(
      "click",
      () => {
        this.expanded = !this.expanded;
        this.root.classList.toggle("expanded", this.expanded);
        this.root.querySelector(".anatomy-expand")!.textContent = this.expanded
          ? "shrink ↙"
          : "expand ↗";
      },
      { signal: this.abort.signal },
    );
    canvas.addEventListener(
      "webglcontextlost",
      (e) => {
        e.preventDefault();
        this.lost = true;
        this.status.textContent = "Restoring brain view…";
      },
      { signal: this.abort.signal },
    );
    canvas.addEventListener("webglcontextrestored", () => (this.lost = false), {
      signal: this.abort.signal,
    });
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.setTheme(theme);
    this.resize();
  }
  private resize() {
    const c = this.renderer.domElement,
      w = c.clientWidth,
      h = c.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
  setViewport() {
    this.resize();
  }
  setTheme(theme: Theme) {
    this.theme = theme;
    this.root.dataset.theme = theme;
  }
  setFlyName(name: string) {
    this.root.querySelector("h2")!.textContent = name;
  }
  setGroupVisible(g: number, visible: boolean) {
    if (visible) this.hidden.delete(g);
    else this.hidden.add(g);
  }
  select(indices: number[], notify = true) {
    this.selected = new Set(indices.filter((i) => i >= 0 && i < this.data.cells.length));
    const first = this.data.cells[[...this.selected][0] ?? -1];
    this.label.textContent =
      this.selected.size === 1 && first
        ? `${first.type} ${first.side} · body ${first.id} · ${first.nt}`
        : `${this.selected.size} cells selected · modeled stimulation targets`;
    const lines: number[] = [],
      graph = this.data.gf,
      pos = this.data.nf.pos;
    for (let src = 0; src < graph.nNodes; src++)
      for (let k = graph.offsets[src]!; k < graph.offsets[src + 1]!; k++) {
        const dst = graph.targets[k]!;
        if (
          (this.selected.has(src) || this.selected.has(dst)) &&
          !(this.data.nf.flags[src]! & 16) &&
          !(this.data.nf.flags[dst]! & 16) &&
          lines.length < 6000
        )
          lines.push(...pos.subarray(src * 3, src * 3 + 3), ...pos.subarray(dst * 3, dst * 3 + 3));
      }
    this.edges.geometry.dispose();
    this.edges.geometry = new THREE.BufferGeometry();
    this.edges.geometry.setAttribute("position", new THREE.Float32BufferAttribute(lines, 3));
    if (notify) this.onSelection([...this.selected]);
  }
  update(view: FrameView, _t: number) {
    if (this.disposed) return;
    if (_t - this.lastPaint < 0.05) return;
    this.lastPaint = _t;
    const color = new THREE.Color(),
      hot = new THREE.Color(0xffd28b);
    let active = 0;
    for (let i = 0; i < Math.max(view.activity.length, this.previousCount); i++) {
      const a = view.activity[i] ?? 0;
      if (a > 0.32) active++;
      color
        .set(
          this.selected.has(i)
            ? 0xffd18e
            : i >= view.activity.length
              ? 0x24444b
              : this.theme === "dark"
                ? 0x4d989f
                : 0x27616c,
        )
        .lerp(hot, Math.min(1, a * 1.5));
      if (this.hidden.has(this.data.nf.groupId[i]!)) color.multiplyScalar(0);
      color.toArray(this.colors, i * 3);
    }
    let vertices = 0;
    const graph = this.data.gf,
      pos = this.data.nf.pos;
    for (let src = 0; src < Math.min(graph.nNodes, view.activity.length); src++) {
      if ((view.activity[src] ?? 0) < 0.08 || this.data.nf.flags[src]! & 16) continue;
      for (let k = graph.offsets[src]!; k < graph.offsets[src + 1]! && vertices < 2000; k++) {
        const dst = graph.targets[k]!;
        const strength = connectionActivity(view.activity, src, dst);
        if (!strength || this.data.nf.flags[dst]! & 16) continue;
        this.livePositions.set(pos.subarray(src * 3, src * 3 + 3), vertices * 3);
        this.livePositions.set(pos.subarray(dst * 3, dst * 3 + 3), (vertices + 1) * 3);
        color.setRGB(1, 0.35 + strength * 0.6, 0.15).multiplyScalar(0.3 + strength * 0.7);
        color.toArray(this.liveColors, vertices * 3);
        color
          .clone()
          .multiplyScalar(0.3)
          .toArray(this.liveColors, (vertices + 1) * 3);
        vertices += 2;
      }
      if (vertices >= 2000) break;
    }
    this.liveEdges.geometry.setDrawRange(0, vertices);
    this.liveEdges.geometry.attributes.position!.needsUpdate = true;
    this.liveEdges.geometry.attributes.color!.needsUpdate = true;
    for (const object of this.arbors.children) {
      const line = object as THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
      const a = view.activity[Number(line.userData.index)] ?? 0;
      line.material.color.set(0x548e96).lerp(hot, Math.min(1, a * 2));
      line.material.opacity = 0.3 + Math.min(1, a) * 0.7;
    }
    for (const row of this.activityMeters) {
      const active = row.cells.filter((i) => i < view.activity.length).length;
      row.meter.title = `${active} of ${row.cells.length} mapped cells simulated. ${row.meter.parentElement?.title ?? ""}`;
      const a = circuitActivity(view.activity, row.cells);
      row.meter.value = a;
      row.value.textContent = (a * 100).toFixed(0) + "%";
    }
    if (_t - this.lastRegionPaint >= 0.2) {
      this.lastRegionPaint = _t;
      const activity = this.data.membership.map((region) => ({
        name: region.name,
        ...regionActivity(view.activity, region.members),
      }));
      for (const object of this.surfaces.children) {
        const mesh = object as THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhongMaterial>;
        const a = activity.find((r) => r.name === mesh.name);
        mesh.material.emissive.set(0xffb44c);
        mesh.material.emissiveIntensity = this.regionGlow ? Math.min(1, (a?.value ?? 0) * 2) : 0;
      }
      if (this.regionGlow) {
        const top = activity
          .filter((a) => a.coverage > 0)
          .sort((a, b) => b.value - a.value)
          .slice(0, 5);
        this.regionStatus.textContent =
          top
            .map(
              (a) =>
                `${a.name}: ${(a.value * 100).toFixed(1)}% activity (${(a.coverage * 100).toFixed(0)}% synapse coverage)`,
            )
            .join(" · ") + ". Weighted cell activity, not compartment propagation.";
      } else
        this.regionStatus.textContent =
          "Measured ROI membership; enable glow to see activity and simulated synapse coverage.";
    }
    this.previousCount = view.activity.length;
    let drawn = 0;
    for (let i = 0; i < view.activity.length; i++) if (!(this.data.nf.flags[i]! & 16)) drawn++;
    this.points.geometry.setDrawRange(0, drawn);
    this.points.geometry.attributes.color!.needsUpdate = true;
    if (!this.lost) {
      this.status.textContent = `${view.activity.length.toLocaleString()} simulated / 166,700 · ${active} above threshold · ${view.paused ? "paused" : "live"}`;
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    }
  }
  dispose() {
    this.disposed = true;
    this.abort.abort();
    this.observer.disconnect();
    this.controls.dispose();
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points || o instanceof THREE.LineSegments) {
        o.geometry.dispose();
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
      }
    });
    this.renderer.dispose();
    this.root.remove();
  }
}
