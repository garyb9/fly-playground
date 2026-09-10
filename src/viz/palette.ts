// Named colours for the whole viz layer + a shared standard material factory.
// `material()` / `applyTheme()` are the only `three`-touching exports here.
//
// AESTHETIC DIRECTION: "Deep Field" — a cool bioluminescent connectome in a
// blue-black void with one warm ember of a fly. See
// `docs/2026-09-09-visual-direction.md` (§2 palette, §6.1 token→code map, §7
// status table). `PALETTE_LIGHT` is the cool "light-lab" counter-theme; the
// runtime toggle lives in the HUD (`controls.setTheme`).

import * as THREE from "three";
import type { Theme } from "../ui/controls";

export interface Palette {
  /** scene background — §2 `void`. */
  bg: number;
  /** fog target — §2 `abyss`. */
  abyss: number;
  /** resting connectome point — §2 `neuron`. */
  pointCold: number;
  /** spiking point — §2 `spark`. */
  pointHot: number;
  /** core-edge / pathway colour. */
  edge: number;
  /** the fly — §2 `ember`. */
  flyBody: number;
  /** fly hot centre / wing shimmer — §2 `ember-core`. */
  flyAccent: number;
  /** escape flash. */
  escapeHot: number;
  /** escape after-glow. */
  escapeWarm: number;
  /** ground disc. */
  ground: number;
  /** the single cool `DirectionalLight` key (§6.5) — a light colour, not a
   * surface colour, so it is deliberately near-white in both themes. */
  keyLight: number;
  /** bounds hairline. */
  bounds: number;
  /** obstacle body — §2.4 `buoy`. */
  buoy: number;
  buoyRimA: number;
  buoyRimB: number;
  buoyRimC: number;
}

export const PALETTE_DARK: Readonly<Palette> = Object.freeze({
  bg: 0x070b14,
  abyss: 0x0f1a2e,
  pointCold: 0x4a8fa8,
  pointHot: 0xeaf7ff,
  edge: 0x7c6be8,
  flyBody: 0xffb25a,
  flyAccent: 0xffe7be,
  escapeHot: 0xffffff,
  escapeWarm: 0xfff1da,
  ground: 0x0a1220,
  keyLight: 0xeaf7ff,
  bounds: 0x22344d,
  buoy: 0x101a28,
  buoyRimA: 0x5aa0d6,
  buoyRimB: 0x6fbf8e,
  buoyRimC: 0x9b84e0,
});

export const PALETTE_LIGHT: Readonly<Palette> = Object.freeze({
  bg: 0xeef2f6,
  abyss: 0xdce4ec,
  pointCold: 0x2c6e82,
  pointHot: 0x0c2a33,
  edge: 0x6a57d6,
  flyBody: 0xffb25a,
  flyAccent: 0xffe7be,
  escapeHot: 0xffffff,
  escapeWarm: 0xfff1da,
  ground: 0xdfe6ec,
  // Near-white, NOT the light theme's near-black `pointHot` — keying the sun off
  // a surface token turned the light world almost unlit (Task 11 carry-forward).
  keyLight: 0xf4f7fa,
  bounds: 0xb9c6d2,
  buoy: 0xd3dce4,
  buoyRimA: 0x5aa0d6,
  buoyRimB: 0x6fbf8e,
  buoyRimC: 0x9b84e0,
});

/** Back-compat alias — the dark theme is the default "Deep Field" look. */
export const PALETTE = PALETTE_DARK;

export function activePalette(theme: Theme): Readonly<Palette> {
  return theme === "light" ? PALETTE_LIGHT : PALETTE_DARK;
}

function isPaletteKey(k: unknown): k is keyof Palette {
  return typeof k === "string" && k in PALETTE_DARK;
}

/**
 * Recolour a subtree for `theme`. Any mesh material tagged with
 * `userData.themeKey` (and optionally `userData.emissiveKey`) is looked up in
 * the active palette — `buildWorld` and `fly.ts` tag theirs, so this stays
 * generic and needs no registry.
 */
export function applyTheme(root: THREE.Object3D, theme: Theme): void {
  const pal = activePalette(theme);
  const seen = new Set<THREE.Material>();
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const mats: THREE.Material[] = Array.isArray(o.material) ? o.material : [o.material];
    for (const mat of mats) {
      if (seen.has(mat)) continue;
      seen.add(mat);
      const ud = mat.userData as Record<string, unknown>;
      const key = ud.themeKey;
      if (isPaletteKey(key) && "color" in mat) {
        const c = (mat as { color: unknown }).color;
        if (c instanceof THREE.Color) c.setHex(pal[key]);
      }
      const eKey = ud.emissiveKey;
      if (isPaletteKey(eKey) && "emissive" in mat) {
        const e = (mat as { emissive: unknown }).emissive;
        if (e instanceof THREE.Color) e.setHex(pal[eKey]);
      }
    }
  });
}

/** Obstacle material key → its Fresnel rim token. Unknown keys (including the
 * pre-"Deep Field" `clay`/`sage`/`ochre`, still present in persisted scenes)
 * fall back to rim A so `material()` never throws. */
const RIM: Record<string, keyof Palette> = {
  "buoy-a": "buoyRimA",
  "buoy-b": "buoyRimB",
  "buoy-c": "buoyRimC",
  clay: "buoyRimA",
  sage: "buoyRimB",
  ochre: "buoyRimC",
};

/**
 * Matte `buoy` obstacle material with a cool Fresnel rim patched in via
 * `onBeforeCompile` (a material tweak, deliberately not an extra mesh, so the
 * world's child count stays predictable).
 */
export function material(key: string, theme: Theme = "dark"): THREE.MeshStandardMaterial {
  const pal = activePalette(theme);
  const rimKey = RIM[key] ?? "buoyRimA";
  const mat = new THREE.MeshStandardMaterial({
    color: pal.buoy,
    roughness: 0.85,
    metalness: 0,
  });
  mat.userData.themeKey = "buoy";
  mat.userData.rimKey = rimKey;

  const uRimColor = { value: new THREE.Color(pal[rimKey]) };
  const uRimStrength = { value: 0.55 };
  mat.userData.uRimColor = uRimColor;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor = uRimColor;
    shader.uniforms.uRimStrength = uRimStrength;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "void main() {",
        "uniform vec3 uRimColor;\nuniform float uRimStrength;\nvoid main() {",
      )
      .replace(
        "#include <opaque_fragment>",
        [
          "#include <opaque_fragment>",
          "float rimF = 1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition)));",
          "gl_FragColor.rgb += uRimColor * pow(clamp(rimF, 0.0, 1.0), 3.0) * uRimStrength;",
        ].join("\n"),
      );
  };
  return mat;
}
