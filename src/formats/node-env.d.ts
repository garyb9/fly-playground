// Minimal ambient declarations for the Node built-ins used by `fixture.ts`.
// `@types/node` is not a dependency of this package, and Task 8 may only touch
// `src/formats/*`, so we declare just the surface the vitest node-env test
// loader needs. If `@types/node` is ever added, delete this file.

declare module "node:fs" {
  interface NodeFileBuffer extends Uint8Array {
    readonly buffer: ArrayBuffer;
    readonly byteOffset: number;
    readonly byteLength: number;
  }
  export function readFileSync(path: string): NodeFileBuffer;
  export function readFileSync(path: string, encoding: "utf8"): string;
}

declare module "node:url" {
  export function fileURLToPath(url: string | URL): string;
}
