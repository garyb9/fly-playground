// Post-FX stack (§6.2, ordered): render → selective-ish bloom (luminance
// threshold) → vignette → film grain → output.
//
// The `OutputPass` at the end is load-bearing, not decoration: three only
// applies `renderer.toneMapping` / `renderer.outputColorSpace` when it is
// drawing to the default framebuffer (`_currentRenderTarget === null`), and
// every composer pass draws into a render target. Without a final `OutputPass`
// the ACES tone map and sRGB encode set in `createRenderer` never run and
// `CONFIG.aesthetic.EXPOSURE` is a dead dial. It is the encode step — the look
// passes stay ahead of it.
//
// Untested glue: vitest runs in `node` with no WebGL context. Nothing here runs
// at import time, so importing the module stays safe.

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { CONFIG } from "../app/config";
import type { Theme } from "../ui/controls";

/** Radial darkening toward the frame edge. `amount` 0 = off. */
const VignetteShader = {
  name: "VignetteShader",
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    amount: { value: 0.2 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float amount;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      float d = length(vUv - vec2(0.5)) * 1.41421356;
      float v = 1.0 - amount * smoothstep(0.35, 1.0, d);
      gl_FragColor = vec4(texel.rgb * v, texel.a);
    }
  `,
};

/** Fine animated hash noise — long-exposure sensor grain (§6.2 step 4). */
const GrainShader = {
  name: "GrainShader",
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    amount: { value: 0.035 },
    time: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float amount;
    uniform float time;
    varying vec2 vUv;
    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      float n = hash(vUv + fract(time)) - 0.5;
      gl_FragColor = vec4(texel.rgb + n * amount, texel.a);
    }
  `,
};

interface NumUniform {
  value: number;
}

export interface PostStack {
  composer: EffectComposer;
  setSize(w: number, h: number): void;
  setTheme(theme: Theme): void;
  /** Advance the grain clock and draw the full chain. */
  render(dt?: number): void;
}

export function buildComposer(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): PostStack {
  const { BLOOM, VIGNETTE, GRAIN, theme: initialTheme } = CONFIG.aesthetic;
  // SwiftShader can blank the entire scene in the bloom pass. The other passes
  // render correctly; keep them while avoiding that software-driver failure.
  const gl = renderer.getContext();
  const debug = gl.getExtension("WEBGL_debug_renderer_info");
  const softwareRenderer = debug
    ? /SwiftShader|llvmpipe/i.test(String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)))
    : false;
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const b = BLOOM[initialTheme];
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(renderer.domElement.width || 1, renderer.domElement.height || 1),
    b.STRENGTH,
    b.RADIUS,
    b.THRESHOLD,
  );
  bloom.enabled = b.STRENGTH > 0 && !softwareRenderer;
  composer.addPass(bloom);

  // `ShaderPass` clones the uniform definitions, so grab the live objects once.
  // The casts only shed `noUncheckedIndexedAccess`'s `| undefined` on uniforms
  // this module itself declared.
  const vignette = new ShaderPass(VignetteShader);
  const vignetteAmount = vignette.uniforms.amount as NumUniform;
  vignetteAmount.value = VIGNETTE[initialTheme];
  composer.addPass(vignette);

  const grain = new ShaderPass(GrainShader);
  const grainAmount = grain.uniforms.amount as NumUniform;
  const grainTime = grain.uniforms.time as NumUniform;
  grainAmount.value = GRAIN[initialTheme];
  composer.addPass(grain);

  // Last: tone map + sRGB encode. See the header note.
  composer.addPass(new OutputPass());

  let elapsed = 0;

  return {
    composer,
    setSize(w, h) {
      // `EffectComposer.setSize` already forwards to every pass at
      // `w * pixelRatio` — resizing the bloom explicitly here would overwrite
      // its mip chain with logical pixels and halve its resolution at dpr 2.
      composer.setSize(w, h);
    },
    setTheme(theme) {
      const p = BLOOM[theme];
      bloom.strength = p.STRENGTH;
      bloom.radius = p.RADIUS;
      bloom.threshold = p.THRESHOLD;
      bloom.enabled = p.STRENGTH > 0 && !softwareRenderer;
      vignetteAmount.value = VIGNETTE[theme];
      grainAmount.value = GRAIN[theme];
    },
    render(dt = 0) {
      elapsed += dt;
      grainTime.value = elapsed;
      composer.render();
    },
  };
}
