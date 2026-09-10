import { test, expect } from "vitest";
import { parseGroups } from "../../formats/groups";
import { parseNeurons } from "../../formats/neurons";
import { fixtureBuf } from "../../formats/fixture";
import groups from "../../../pipeline/out/fixture/groups.json";
import { roleMembership, roleSummary, regionCounts } from "./role-monitor";
const n = parseNeurons(fixtureBuf("neurons.bin"));
const members = roleMembership(parseGroups(groups), n.count);
test("role membership uses neuron IDs and background excludes all sensory and output roles", () => {
  const a = new Float32Array(n.count);
  for (const i of members.looming) a[i] = 1;
  for (const i of members.escape) a[i] = 0.5;
  const s = roleSummary(a, members);
  expect(s.looming).toBe(1);
  expect(s.escape).toBe(0.5);
  expect(s.background).toBe(0);
  expect(members.background).toHaveLength(n.count - n.coreCount);
  a.fill(0);
  for (const i of parseGroups(groups).inputRoles.light_l!) a[i] = 1;
  expect(roleSummary(a, members).background).toBe(0);
});
test("shortened snapshots, empty roles, and invalid samples produce bounded finite means", () => {
  const m = roleMembership(
    { groups: [], scaleFactor: 1, inputRoles: { looming: [0, 1, 2] }, readoutRoles: {} },
    3,
  );
  expect(roleSummary(new Float32Array([1]), m).looming).toBe(1);
  const s = roleSummary(new Float32Array([NaN, Infinity, -1]), m);
  expect(Object.values(s).every((v) => v === 0)).toBe(true);
});
test("region counts include threshold equality, exclude nonfinite values and truncated neurons", () => {
  const a = new Float32Array([0.5, 0.6, NaN, Infinity, 0.49]);
  expect(regionCounts(a, n, 0.5).reduce((x, y) => x + y, 0)).toBe(2);
});
