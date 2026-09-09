// The point-cloud shader material for the brain viz. Per-vertex `aCore` /
// `aActivity` attributes drive point size + colour; uniforms default from
// `CONFIG.aesthetic` and `PALETTE`.

import * as THREE from "three";
import { CONFIG } from "../app/config";
import { PALETTE } from "./palette";

const VERT = /* glsl */ `
  attribute float aCore;
  attribute float aActivity;
  uniform float uBaseSize;
  uniform float uCoreSize;
  uniform float uSwell;
  uniform float uScale;
  uniform float uMaxSize;
  varying float vActivity;
  void main() {
    vActivity = aActivity;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float size = (aCore > 0.5 ? uCoreSize : uBaseSize) * (1.0 + uSwell * aActivity) * (uScale / -mvPosition.z);
    // The fly flies *through* the cloud: without a cap, a point a fraction of a
    // unit from the camera fills the screen. Clamp so points stay specks.
    gl_PointSize = clamp(size, 1.0, uMaxSize);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uCold;
  uniform vec3 uHot;
  varying float vActivity;
  void main() {
    if (length(gl_PointCoord - 0.5) > 0.5) discard;
    gl_FragColor = vec4(mix(uCold, uHot, vActivity), 1.0);
  }
`;

export function makeBrainMaterial(): THREE.ShaderMaterial {
  const a = CONFIG.aesthetic;
  return new THREE.ShaderMaterial({
    uniforms: {
      uBaseSize: { value: a.BASE_SIZE },
      uCoreSize: { value: a.CORE_SIZE },
      uSwell: { value: a.ACT_SWELL },
      uScale: { value: a.POINT_SCALE },
      uMaxSize: { value: a.POINT_MAX },
      uCold: { value: new THREE.Color(PALETTE.pointCold) },
      uHot: { value: new THREE.Color(PALETTE.pointHot) },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    // Dark ink points on a light ground: opaque normal blend so a near-black
    // cold colour stays visible against the bone background (additive blending
    // made it disappear). The frag `discard` keeps points circular without alpha.
    transparent: false,
    blending: THREE.NormalBlending,
    depthWrite: true,
  });
}
