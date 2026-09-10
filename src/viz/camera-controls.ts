import type * as THREE from "three";
import type { Vec3 } from "../body/types";
import { CONFIG } from "../app/config";
import {
  initialCamera,
  followTarget,
  centerFly,
  orbitCamera,
  zoomCamera,
  cameraPosition,
  type CameraState,
} from "./camera-state";

interface Drag {
  id: number;
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
  ) {
    this.state = initialCamera(target, offset);
    this.flyTarget = { ...target };
    this.originalTouchAction = canvas.style.touchAction;
    canvas.style.touchAction = "none";
    this.originalTabIndex = canvas.getAttribute("tabindex");
    canvas.tabIndex = 0;
    this.originalLabel = canvas.getAttribute("aria-label");
    canvas.setAttribute("aria-label", "3D world. Drag to orbit, scroll to zoom.");
    const signal = this.events.signal;
    canvas.addEventListener("pointerdown", this.onDown, { signal });
    canvas.addEventListener("pointermove", this.onMove, { signal });
    canvas.addEventListener("pointerup", this.onUp, { signal });
    canvas.addEventListener("pointercancel", this.onCancel, { signal });
    canvas.addEventListener("lostpointercapture", this.onCancel, { signal });
    canvas.addEventListener("contextmenu", this.onContext, { signal });
    canvas.addEventListener("wheel", this.onWheel, { signal, passive: false });
    window.addEventListener("blur", this.cancelDrag, { signal });
    this.widget = document.createElement("div");
    this.widget.className = "hud-camera";
    this.modeLabel = document.createElement("span");
    this.modeLabel.className = "hud-camera__mode";
    const hint = document.createElement("span");
    hint.className = "hud-camera__hint";
    hint.textContent = "drag to orbit · scroll to zoom";
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "center fly";
    button.title = "Center and follow the fly (right click in the world)";
    button.addEventListener("click", () => this.recenter(), { signal });
    // Let native Space/Enter activate the button without the HUD's Space pause shortcut.
    button.addEventListener(
      "keydown",
      (event) => {
        if (event.code === "Space" || event.code === "Enter") event.stopPropagation();
      },
      { signal },
    );
    this.widget.append(this.modeLabel, hint, button);
    document.getElementById("hud")!.append(this.widget);
    this.render();
  }
  private onDown = (event: PointerEvent): void => {
    if (event.button !== 0 || !event.isPrimary || this.drag) return;
    event.preventDefault();
    this.canvas.focus({ preventScroll: true });
    this.drag = {
      id: event.pointerId,
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
    if (!(event.buttons & 1)) {
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
    this.state = orbitCamera(this.state, event.clientX - drag.x, event.clientY - drag.y);
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
    this.recenter();
  };
  private onWheel = (event: WheelEvent): void => {
    // Preserve browser accessibility zoom (Ctrl/trackpad pinch).
    if (event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    this.state = zoomCamera(this.state, event.deltaY, event.deltaMode, this.canvas.clientHeight);
    this.render();
  };
  recenter(): void {
    this.cancelDrag();
    this.state = centerFly(this.state, this.flyTarget);
    this.render();
  }
  update(target: Vec3): void {
    this.flyTarget = { ...target };
    this.state = followTarget(this.state, target);
    this.render();
  }
  private render(): void {
    const position = cameraPosition(this.state);
    this.camera.position.set(position.x, position.y, position.z);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.state.target.x, this.state.target.y, this.state.target.z);
    this.canvas.dataset.cameraMode = this.state.mode;
    this.modeLabel.textContent = this.state.mode === "follow" ? "following fly" : "fly orbit";
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
