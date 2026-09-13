import type * as THREE from "three";
import type { Vec3 } from "../body/types";
import { CONFIG } from "../app/config";
import {
  initialCamera,
  followTarget,
  centerFly,
  orbitCamera,
  panCamera,
  zoomCamera,
  cameraPosition,
  type CameraState,
} from "./camera-state";

interface Drag {
  id: number;
  button: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
  active: boolean;
}

/** One owner for the main camera. Listeners live on the world canvas, never the
 * document, so panel and HUD interactions cannot orbit or zoom the world. */
export class CameraControls {
  private state: CameraState;
  private flyTarget: Vec3;
  private drag: Drag | null = null;
  private readonly keys = new Set<string>();
  private lastCycle = -Infinity;
  private readonly events = new AbortController();
  private readonly widget: HTMLDivElement;
  private readonly modeLabel: HTMLSpanElement;
  private readonly originalTouchAction: string;
  private readonly originalTabIndex: string | null;
  private readonly originalLabel: string | null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: THREE.PerspectiveCamera,
    target: Vec3,
    offset: Vec3 = CONFIG.camera.OFFSET,
    private readonly cycleFly?: (direction: number) => void,
  ) {
    this.state = initialCamera(target, offset);
    this.flyTarget = { ...target };
    this.originalTouchAction = canvas.style.touchAction;
    canvas.style.touchAction = "none";
    this.originalTabIndex = canvas.getAttribute("tabindex");
    canvas.tabIndex = 0;
    this.originalLabel = canvas.getAttribute("aria-label");
    canvas.setAttribute(
      "aria-label",
      "3D world. Left drag to orbit, right drag or WASD and arrows to pan, wheel to zoom, middle click to center, Shift and wheel to switch flies.",
    );
    const signal = this.events.signal;
    canvas.addEventListener("pointerdown", this.onDown, { signal });
    canvas.addEventListener("pointermove", this.onMove, { signal });
    canvas.addEventListener("pointerup", this.onUp, { signal });
    canvas.addEventListener("pointercancel", this.onCancel, { signal });
    canvas.addEventListener("lostpointercapture", this.onCancel, { signal });
    canvas.addEventListener("contextmenu", this.onContext, { signal });
    canvas.addEventListener("wheel", this.onWheel, { signal, passive: false });
    window.addEventListener(
      "blur",
      () => {
        this.cancelDrag();
        this.keys.clear();
      },
      { signal },
    );
    window.addEventListener("keydown", this.onKeyDown, { signal });
    window.addEventListener("keyup", (event) => this.keys.delete(event.code), { signal });
    window.addEventListener("focusin", () => this.keys.clear(), { signal });
    this.widget = document.createElement("div");
    this.widget.className = "hud-camera";
    this.modeLabel = document.createElement("span");
    this.modeLabel.className = "hud-camera__mode";
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "center fly";
    button.title = "Center and follow the fly (middle click in the world)";
    button.addEventListener("click", () => this.recenter(), { signal });
    // Let native Space/Enter activate the button without the HUD's Space pause shortcut.
    button.addEventListener(
      "keydown",
      (event) => {
        if (event.code === "Space" || event.code === "Enter") event.stopPropagation();
      },
      { signal },
    );
    this.widget.append(this.modeLabel, button);
    document.getElementById("hud")!.append(this.widget);
    this.render();
  }
  private onDown = (event: PointerEvent): void => {
    if (!event.isPrimary || this.drag || event.button > 2) return;
    if (event.button === 1) {
      event.preventDefault();
      this.recenter();
      return;
    }
    event.preventDefault();
    this.canvas.focus({ preventScroll: true });
    this.drag = {
      id: event.pointerId,
      button: event.button,
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
    };
    this.canvas.setPointerCapture(event.pointerId);
  };
  private onMove = (event: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || drag.id !== event.pointerId) return;
    if (!(event.buttons & (drag.button === 2 ? 2 : 1))) {
      this.cancelDrag();
      return;
    }
    if (!drag.active) {
      if (
        Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) <
        CONFIG.camera.mouse.dragThreshold
      )
        return;
      drag.active = true;
    }
    const dx = event.clientX - drag.x,
      dy = event.clientY - drag.y;
    const scale =
      (2 * this.state.distance * Math.tan((this.camera.fov * Math.PI) / 360)) /
      Math.max(1, this.canvas.clientHeight);
    this.state =
      drag.button === 2
        ? panCamera(this.state, -dx * scale, dy * scale)
        : orbitCamera(this.state, dx, dy);
    drag.x = event.clientX;
    drag.y = event.clientY;
    this.render();
  };
  private onUp = (event: PointerEvent): void => {
    if (this.drag?.id === event.pointerId) this.cancelDrag();
  };
  private onCancel = (event: PointerEvent): void => {
    if (this.drag?.id === event.pointerId) this.cancelDrag();
  };
  private cancelDrag = (): void => {
    const drag = this.drag;
    this.drag = null;
    if (drag && this.canvas.hasPointerCapture(drag.id)) this.canvas.releasePointerCapture(drag.id);
  };
  private onContext = (event: MouseEvent): void => {
    event.preventDefault();
  };
  private onWheel = (event: WheelEvent): void => {
    // Preserve browser accessibility zoom (Ctrl/trackpad pinch).
    if (event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    if (event.shiftKey) {
      if (event.deltaY && performance.now() - this.lastCycle > 160) {
        this.lastCycle = performance.now();
        this.cycleFly?.(Math.sign(event.deltaY));
      }
      return;
    }
    this.state = zoomCamera(this.state, event.deltaY, event.deltaMode, this.canvas.clientHeight);
    this.render();
  };
  recenter(): void {
    this.cancelDrag();
    this.state = centerFly(this.state, this.flyTarget);
    this.render();
  }
  private onKeyDown = (event: KeyboardEvent): void => {
    if (
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      (event.target instanceof Element &&
        event.target.closest("input, textarea, select, button, summary, [contenteditable]"))
    )
      return;
    if (
      !["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight"].includes(
        event.code,
      )
    )
      return;
    event.preventDefault();
    this.keys.add(event.code);
  };
  update(target: Vec3, dt = 0): void {
    this.flyTarget = { ...target };
    this.state = followTarget(this.state, target);
    const right =
      Number(this.keys.has("KeyD") || this.keys.has("ArrowRight")) -
      Number(this.keys.has("KeyA") || this.keys.has("ArrowLeft"));
    const up =
      Number(this.keys.has("KeyW") || this.keys.has("ArrowUp")) -
      Number(this.keys.has("KeyS") || this.keys.has("ArrowDown"));
    if (right || up) {
      const speed = (this.state.distance * Math.min(Math.max(dt, 0), 0.05)) / Math.hypot(right, up);
      this.state = panCamera(this.state, right * speed, up * speed);
    }
    this.render();
  }
  private render(): void {
    const position = cameraPosition(this.state);
    this.camera.position.set(position.x, position.y, position.z);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.state.target.x, this.state.target.y, this.state.target.z);
    this.canvas.dataset.cameraMode = this.state.mode;
    this.modeLabel.textContent =
      this.state.mode === "follow"
        ? "following fly"
        : this.state.mode === "pan"
          ? "camera pan"
          : "fly orbit";
  }
  dispose(): void {
    this.cancelDrag();
    this.events.abort();
    this.widget.remove();
    this.canvas.style.touchAction = this.originalTouchAction;
    if (this.originalTabIndex === null) this.canvas.removeAttribute("tabindex");
    else this.canvas.setAttribute("tabindex", this.originalTabIndex);
    if (this.originalLabel === null) this.canvas.removeAttribute("aria-label");
    else this.canvas.setAttribute("aria-label", this.originalLabel);
    delete this.canvas.dataset.cameraMode;
  }
}
