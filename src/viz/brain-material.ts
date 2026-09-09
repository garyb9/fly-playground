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
  uniform float uDepthNear;
  uniform float uDepthFar;
  varying float vActivity;
  varying float vDepthFade;
  void main() {
    vActivity = aActivity;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float dist = -mvPosition.z;
    vDepthFade = clamp((dist - uDepthNear) / (uDepthFar - uDepthNear), 0.0, 1.0);
    float size = (aCore > 0.5 ? uCoreSize : uBaseSize) * (1.0 + uSwell * aActivity) * (uScale / dist);
    // The fly flies *through* the cloud: without a cap, a point a fraction of a
    // unit from the camera fills the screen. Clamp so points stay specks.
    gl_PointSize = clamp(size, 1.0, uMaxSize);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uCold;
  uniform vec3 uHot;
  uniform vec3 uBg;
  uniform float uDepthFadeMax;
  varying float vActivity;
  varying float vDepthFade;
  void main() {
    float r = length(gl_PointCoord - 0.5);
    if (r > 0.5) discard;
    vec3 ink = mix(uCold, uHot, vActivity);
    // Recede with distance: far points drift toward the ground colour.
    ink = mix(ink, uBg, vDepthFade * uDepthFadeMax);
    // Soft rim: blend the outer sliver of the disc into the ground so points
    // read as specks, not hard-edged cutouts. Opaque throughout.
    float edge = 1.0 - smoothstep(0.42, 0.5, r);
    gl_FragColor = vec4(mix(uBg, ink, edge), 1.0);
    // Colour maths above is in linear space; encode to the renderer's output
    // space so uCold/uHot/uBg land at their palette values (a raw ShaderMaterial
    // gets no automatic output encoding — that is why points read near-black).
    #include <colorspace_fragment>
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
      uDepthNear: { value: a.POINT_DEPTH_NEAR },
      uDepthFar: { value: a.POINT_DEPTH_FAR },
      uDepthFadeMax: { value: a.POINT_DEPTH_FADE },
      uCold: { value: new THREE.Color(PALETTE.pointCold) },
      uHot: { value: new THREE.Color(PALETTE.pointHot) },
      uBg: { value: new THREE.Color(PALETTE.bg) },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    // Dark ink points on a light ground: opaque normal blend so a near-black
    // cold colour stays visible against the bone background (additive blending
    // made it disappear). The frag blends its own rim + depth fade to `uBg`.
    transparent: false,
    blending: THREE.NormalBlending,
    depthWrite: true,
  });
}
