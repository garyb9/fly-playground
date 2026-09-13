import { expect, test } from "vitest";
import { flyName } from "./names";
import { withPeers } from "./peers";
import { sample, initSensingState } from "../sensing/sensing";
import { Body } from "../body/body";
import { v } from "../body/types";
import { buildRoleTable } from "../sim/roles";
import { parseGroups } from "../formats/groups";

test("names stay unique even when random values repeat", () => {
  const names = new Set<string>();
  for (let i = 0; i < 20; i++) names.add(flyName(names, () => 0));
  expect(names.size).toBe(20);
  expect([...names][0]).toBe("Alpha Metatron");
});
test("an approaching peer enters the looming sensory channel", () => {
  const rt = buildRoleTable(
    parseGroups({
      roles: {
        input: { looming: [], proximity: [], light_l: [], light_r: [], wind_l: [], wind_r: [] },
        readout: {},
      },
    }),
  );
  const world = { aabbs: [], lights: [], bounds: { min: v(-20, -20, -20), max: v(20, 20, 20) } };
  const pose = new Body(v(), 0).pose();
  const far = sample(pose, withPeers(world, [v(5, 0, 0)]), 0.05, initSensingState(), rt);
  const near = sample(pose, withPeers(world, [v(1, 0, 0)]), 0.05, far.state, rt);
  expect(near.stimulus[rt.input.looming!]!).toBeGreaterThan(far.stimulus[rt.input.looming!]!);
  expect(world.aabbs).toHaveLength(0);
});
