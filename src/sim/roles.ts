import type { GroupsFile } from "../formats/groups";

export interface RoleTable {
  input: Record<string, number>;
  readout: Record<string, number>;
  inputOrder: string[];
  readoutOrder: string[];
}

function order(roles: Record<string, number[]>): { order: string[]; index: Record<string, number> } {
  const orderArr = Object.keys(roles).sort();
  const index: Record<string, number> = {};
  orderArr.forEach((name, i) => (index[name] = i));
  return { order: orderArr, index };
}

export function buildRoleTable(groups: GroupsFile): RoleTable {
  const inp = order(groups.inputRoles);
  const out = order(groups.readoutRoles);
  return { input: inp.index, readout: out.index, inputOrder: inp.order, readoutOrder: out.order };
}

/** Neuron-index lists in RoleTable order — used by the worker to define roles on the Sim. */
export function roleNeuronLists(groups: GroupsFile, rt: RoleTable): { input: number[][]; readout: number[][] } {
  return {
    input: rt.inputOrder.map((n) => groups.inputRoles[n]!),
    readout: rt.readoutOrder.map((n) => groups.readoutRoles[n]!),
  };
}
