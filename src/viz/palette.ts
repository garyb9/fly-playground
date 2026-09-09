// Named colours for the whole viz layer + a shared standard material factory.
// `material()` is the only `three`-touching export here.

import * as THREE from "three";

export const PALETTE = {
  bg: 0xece4d6,
  pointCold: 0x1b1e2b,
  pointHot: 0xfdf0d5,
  coreTint: 0xd98a1f,
  edge: 0x8c7a5c,
  clay: 0xb5643c,
  sage: 0x7f8c63,
  ochre: 0xc9a44a,
  flyBody: 0x2b2b2b,
  flyAccent: 0xd98a1f,
  ground: 0xdcd2be,
  bounds: 0xbdb199,
} as const;

const MAT: Record<string, number> = {
  clay: PALETTE.clay,
  sage: PALETTE.sage,
  ochre: PALETTE.ochre,
};

export function material(key: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: MAT[key] ?? PALETTE.clay,
    roughness: 0.9,
    metalness: 0,
    flatShading: true,
  });
}
