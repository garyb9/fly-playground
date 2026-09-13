// Camera intent is independent of the body and render timing. No inertia: input
// remains direct under reduced motion, and paused simulation does not block it.
import { CONFIG } from "../app/config";
import { add, len, type Vec3 } from "../body/types";

export interface CameraState {
  mode: "follow" | "orbit" | "pan";
  pan: Vec3;
  target: Vec3;
  distance: number;
  azimuth: number;
  elevation: number;
}
const cfg = CONFIG.camera.mouse;
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export function initialCamera(target: Vec3, offset: Vec3 = CONFIG.camera.OFFSET): CameraState {
  const distance = len(offset);
  return {
    mode: "follow",
    pan: { x: 0, y: 0, z: 0 },
    target: { ...target },
    distance: clamp(distance, cfg.minDistance, cfg.maxDistance),
    azimuth: Math.atan2(offset.z, offset.x),
    elevation: clamp(
      Math.asin(distance ? offset.y / distance : 0),
      -cfg.maxElevation,
      cfg.maxElevation,
    ),
  };
}
export function followTarget(state: CameraState, target: Vec3): CameraState {
  return { ...state, target: add(target, state.pan) };
}
export function centerFly(state: CameraState, target: Vec3): CameraState {
  return { ...state, mode: "follow", pan: { x: 0, y: 0, z: 0 }, target: { ...target } };
}
export function orbitCamera(state: CameraState, dx: number, dy: number): CameraState {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return state;
  return {
    ...state,
    mode: "orbit",
    azimuth: (state.azimuth + dx * cfg.rotateSpeed) % (Math.PI * 2),
    elevation: clamp(state.elevation - dy * cfg.rotateSpeed, -cfg.maxElevation, cfg.maxElevation),
  };
}
/** DOM deltaMode: pixels=0, lines=1, pages=2. Exponential zoom is reversible. */
export function zoomCamera(
  state: CameraState,
  deltaY: number,
  deltaMode: number,
  pageHeight: number,
): CameraState {
  if (!Number.isFinite(deltaY)) return state;
  const pixels = deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? Math.max(1, pageHeight) : 1);
  const exponent = clamp(pixels * cfg.zoomSpeed, -20, 20);
  return {
    ...state,
    distance: clamp(state.distance * Math.exp(exponent), cfg.minDistance, cfg.maxDistance),
  };
}
export function cameraPosition(state: CameraState): Vec3 {
  const horizontal = state.distance * Math.cos(state.elevation);
  return add(state.target, {
    x: Math.cos(state.azimuth) * horizontal,
    y: Math.sin(state.elevation) * state.distance,
    z: Math.sin(state.azimuth) * horizontal,
  });
}

/** Translate in the camera's screen plane, preserving the offset as the fly moves. */
export function panCamera(state: CameraState, right: number, up: number): CameraState {
  if (!Number.isFinite(right) || !Number.isFinite(up)) return state;
  const a = state.azimuth,
    e = state.elevation;
  const delta = {
    x: Math.sin(a) * right - Math.cos(a) * Math.sin(e) * up,
    y: Math.cos(e) * up,
    z: -Math.cos(a) * right - Math.sin(a) * Math.sin(e) * up,
  };
  return { ...state, mode: "pan", pan: add(state.pan, delta), target: add(state.target, delta) };
}
