import { expect, test } from "vitest";
import { VERSION } from "./version";

test("VERSION is semver-ish", () => {
  expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
});
