import { expect, test } from "vitest";
import { directional, initDirectional } from "./directional";
import { Body } from "../body/body";
import { v } from "../body/types";
const world = { aabbs: [], lights: [], bounds: { min: v(-5, 0, -5), max: v(5, 8, 5) } };
test("a stationary fly has no looming or motion current; a wall approach has looming", () => {
  const pose = new Body(v(0, 3, 0), 0).pose();
  const first = directional(pose, world, 0.005, initDirectional());
  const still = directional(pose, world, 0.005, first.state);
  expect(still.looming_l + still.looming_r + still.flow_l + still.flow_r).toBe(0);
  const approaching = directional({ ...pose, position: v(0.2, 3, 0) }, world, 0.005, still.state);
  expect(approaching.looming_l + approaching.looming_r).toBeGreaterThan(0);
});
