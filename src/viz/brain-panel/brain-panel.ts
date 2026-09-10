import * as THREE from "three";
import type { NeuronsFile } from "../../formats/neurons";
import type { GraphFile } from "../../formats/graph";
import type { GroupsFile } from "../../formats/groups";
import type { FrameView } from "../../app/loop";
import type { Theme } from "../../ui/controls";
import { CONFIG } from "../../app/config";
import { roleMembership, roleSummary, regionCounts } from "./role-monitor";
import { cardRect } from "./panel-view";
import { buildPanelCloud } from "./panel-cloud";
import { createPanelDom } from "./panel-dom";
import "./panel.css";

export class BrainPanel {
  private readonly dom;
  private readonly cloud;
  private readonly renderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1.5, 1.5, 0.85, -0.85, 0.1, 10);
  private readonly members;
  private readonly hidden = new Set<number>();
  private readonly observer: ResizeObserver;
  private readonly motion = matchMedia("(prefers-reduced-motion: reduce)");
  private lost = false;
  private disposed = false;
  private flash = 0;
  private armed = true;
  private lastUi = -1;
  constructor(
    private readonly neurons: NeuronsFile,
    graph: GraphFile,
    groups: GroupsFile,
    onGroup: (g: number, v: boolean) => void,
    theme: Theme,
  ) {
    if (neurons.count > CONFIG.sim.snapMax)
      throw new Error("Brain panel needs mapped snapshots for datasets above snapMax.");
    this.members = roleMembership(groups, neurons.count);
    this.dom = createPanelDom(
      [...new Set(neurons.groupId)].sort((a, b) => a - b),
      onGroup,
    );
    this.dom.canvas.style.height = `${CONFIG.brainPanel.cloudHeight}px`;
    document.body.append(this.dom.root);
    this.cloud = buildPanelCloud(neurons, graph);
    this.scene.add(this.cloud.group);
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.dom.canvas,
      alpha: true,
      antialias: true,
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.camera.position.z = 3;
    this.dom.canvas.addEventListener("webglcontextlost", this.onLost);
    this.dom.canvas.addEventListener("webglcontextrestored", this.onRestored);
    this.observer = new ResizeObserver(() => this.resizeCanvas());
    this.observer.observe(this.dom.root);
    this.setTheme(theme);
    this.setViewport(innerWidth, innerHeight);
  }
  private onLost = (event: Event): void => {
    event.preventDefault();
    this.lost = true;
    this.dom.recovery.hidden = false;
  };
  private onRestored = (): void => {
    this.lost = false;
    this.dom.recovery.hidden = true;
    this.resizeCanvas();
  };
  private resizeCanvas(): void {
    if (this.disposed) return;
    const w = this.dom.canvas.clientWidth,
      h = this.dom.canvas.clientHeight;
    if (w && h) {
      this.renderer.setSize(w, h, false);
      const aspect = w / h;
      this.camera.left = -0.85 * aspect;
      this.camera.right = 0.85 * aspect;
      this.camera.updateProjectionMatrix();
    }
    const r = this.dom.root.getBoundingClientRect();
    document.getElementById("hud")?.style.setProperty("--reserved-bottom", `${r.bottom + 16}px`);
  }
  setViewport(w: number, h: number): void {
    const r = cardRect(w, h);
    Object.assign(this.dom.root.style, {
      left: `${r.x}px`,
      top: `${r.y}px`,
      width: `${r.w}px`,
      maxHeight: `${r.h}px`,
    });
    this.resizeCanvas();
  }
  setTheme(theme: Theme): void {
    this.dom.root.dataset.theme = theme;
    this.cloud.setTheme(theme);
  }
  setGroupVisible(g: number, visible: boolean): void {
    if (visible) this.hidden.delete(g);
    else this.hidden.add(g);
    this.cloud.setHiddenGroups(this.hidden);
    const box = this.dom.checkboxes.get(g);
    if (box) box.checked = visible;
  }
  update(view: FrameView, t: number, dt: number): void {
    if (this.disposed) return;
    const escape = view.readouts.escape ?? 0;
    this.flash = Math.max(0, this.flash - dt / CONFIG.brainPanel.escapeDecayS);
    if (!view.paused && this.armed && escape >= CONFIG.physics.ESCAPE_TH) {
      this.flash = 1;
      this.armed = false;
    }
    if (escape < CONFIG.physics.ESCAPE_TH - CONFIG.physics.ESCAPE_HYST) this.armed = true;
    this.dom.root.dataset.escape = String(this.flash > 0);
    this.cloud.update(view.activity);
    this.cloud.animate(t, this.flash, this.motion.matches, this.renderer.getPixelRatio());
    if (t - this.lastUi >= 0.08 || view.paused !== (this.dom.root.dataset.paused === "true")) {
      this.dom.update(
        roleSummary(view.activity, this.members),
        regionCounts(view.activity, this.neurons, CONFIG.brainPanel.firingThreshold),
        view.activity.length,
        this.neurons.count,
        view.paused,
      );
      this.lastUi = t;
    }
    if (!this.lost && !this.dom.canvas.closest("[hidden]"))
      this.renderer.render(this.scene, this.camera);
  }
  dispose(): void {
    this.disposed = true;
    this.observer.disconnect();
    this.dom.canvas.removeEventListener("webglcontextlost", this.onLost);
    this.dom.canvas.removeEventListener("webglcontextrestored", this.onRestored);
    this.cloud.dispose();
    this.renderer.dispose();
    this.dom.root.remove();
  }
}
