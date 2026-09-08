import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("../../pipeline/out/fixture/", import.meta.url));

export function fixtureBuf(name: string): ArrayBuffer {
  const b = readFileSync(dir + name);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}
export function fixtureJson(name: string): unknown {
  return JSON.parse(readFileSync(dir + name, "utf8"));
}
