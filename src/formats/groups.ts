export interface GroupsFile {
  scaleFactor: number;
  groups: string[];
  inputRoles: Record<string, number[]>;
  readoutRoles: Record<string, number[]>;
}

export function parseGroups(json: unknown): GroupsFile {
  const j = json as any;
  if (!j || typeof j !== "object") throw new Error("groups.json not an object");
  return {
    scaleFactor: Number(j.scale_factor ?? 1),
    groups: Array.isArray(j.groups) ? j.groups.map(String) : [],
    inputRoles: (j.roles?.input ?? {}) as Record<string, number[]>,
    readoutRoles: (j.roles?.readout ?? {}) as Record<string, number[]>,
  };
}
