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
  varying float vActivity;
  void main() {
    vActivity = aActivity;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = (aCore > 0.5 ? uCoreSize : uBaseSize) * (1.0 + uSwell * aActivity) * (uScale / -mvPosition.z);
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
      uCold: { value: new THREE.Color(PALETTE.pointCold) },
      uHot: { value: new THREE.Color(PALETTE.pointHot) },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}
