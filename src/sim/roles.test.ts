import { expect, test } from "vitest";
import { parseGroups } from "../formats/groups";
import { fixtureJson } from "../formats/fixture";
import { buildRoleTable } from "./roles";

test("role table is sorted and index-aligned", () => {
  const rt = buildRoleTable(parseGroups(fixtureJson("groups.json")));
  expect(rt.inputOrder).toEqual(["light_l", "light_r", "looming", "proximity", "wind_l", "wind_r"]);
  expect(rt.readoutOrder).toEqual(["escape", "thrust", "wing_l", "wing_r", "yaw_torque"]);
  rt.inputOrder.forEach((name, i) => expect(rt.input[name]).toBe(i));
  rt.readoutOrder.forEach((name, i) => expect(rt.readout[name]).toBe(i));
  // namespaces are independent
  expect(rt.input.looming).toBe(2);
  expect(rt.readout.escape).toBe(0);
});
