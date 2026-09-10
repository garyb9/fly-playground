import type { GroupsFile } from "../../formats/groups";
import type { NeuronsFile } from "../../formats/neurons";

export const ROLE_NAMES = [
  "looming",
  "escape",
  "wing_l",
  "wing_r",
  "thrust",
  "yaw",
  "background",
] as const;
export type RoleName = (typeof ROLE_NAMES)[number];
export type RoleFiring = Record<RoleName, number>;
export const unit = (v: number): number => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

// Fixture-only categories; these are not anatomical annotations.
export const fixtureRegion = (group: number): number => (group < 3 ? 0 : group < 5 ? 1 : 2);

export function roleMembership(groups: GroupsFile, count: number): Record<RoleName, number[]> {
  const valid = (ids: number[]) =>
    [...new Set(ids)].filter((i) => Number.isInteger(i) && i >= 0 && i < count);
  const all = new Set(
    valid([...Object.values(groups.inputRoles), ...Object.values(groups.readoutRoles)].flat()),
  );
  return {
    looming: valid(groups.inputRoles.looming ?? []),
    escape: valid(groups.readoutRoles.escape ?? []),
    wing_l: valid(groups.readoutRoles.wing_l ?? []),
    wing_r: valid(groups.readoutRoles.wing_r ?? []),
    thrust: valid(groups.readoutRoles.thrust ?? []),
    yaw: valid(groups.readoutRoles.yaw_torque ?? []),
    background: Array.from({ length: count }, (_, i) => i).filter((i) => !all.has(i)),
  };
}

export function roleSummary(
  activity: Float32Array,
  membership: Record<RoleName, number[]>,
): RoleFiring {
  return Object.fromEntries(
    ROLE_NAMES.map((name) => {
      let sum = 0,
        count = 0;
      for (const i of membership[name])
        if (i < activity.length) {
          sum += unit(activity[i]!);
          count++;
        }
      return [name, count ? sum / count : 0];
    }),
  ) as RoleFiring;
}

export function regionCounts(
  activity: Float32Array,
  neurons: NeuronsFile,
  threshold: number,
): [number, number, number] {
  const counts: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < Math.min(activity.length, neurons.count); i++) {
    const a = activity[i]!;
    if (Number.isFinite(a) && a >= threshold) counts[fixtureRegion(neurons.groupId[i]!)]!++;
  }
  return counts;
}
