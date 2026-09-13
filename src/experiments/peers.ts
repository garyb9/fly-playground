import type { Vec3, WorldQuery } from "../body/types";
/** Bodies enter the same sensing path as other visible objects; no neural-state copying. */
export function withPeers(world: WorldQuery, positions: Vec3[], radius = 0.25): WorldQuery {
  return {
    ...world,
    aabbs: [
      ...world.aabbs,
      ...positions.map((p) => ({
        min: { x: p.x - radius, y: p.y - radius, z: p.z - radius },
        max: { x: p.x + radius, y: p.y + radius, z: p.z + radius },
      })),
    ],
  };
}
