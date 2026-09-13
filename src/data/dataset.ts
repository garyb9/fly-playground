import { assetLoader } from "./asset-cache";
import { parseNeurons } from "../formats/neurons";
import { parseGraph } from "../formats/graph";
import { parseGroups } from "../formats/groups";
import { motorRegistry } from "../sim/motor-registry";
import { circuitProfile } from "../sim/circuit-profile";

export interface Cell {
  id: string;
  type: string;
  side: string;
  nt: string;
  group: number;
  position: number[];
}
export interface Region {
  name: string;
  offset: number;
  bytes: number;
}
export interface RegionMembership {
  name: string;
  members: [number, number][];
}
export interface Skeleton {
  index: number;
  id: string;
  type: string;
  positions: number[];
}
export async function loadDataset() {
  const base = `${import.meta.env.BASE_URL}data/malecns/`;
  const response = await assetLoader(base);
  const [neurons, graph, groups, cells, regions, meshes, context, skeletons, sensory, membership] =
    await Promise.all([
      response("full/neurons.bin").then((r) => r.arrayBuffer()),
      response("full/graph.bin").then((r) => r.arrayBuffer()),
      response("full/groups.json").then((r) => r.json()),
      response("full/cells.json").then((r) => r.json()) as Promise<Cell[]>,
      response("regions.json").then((r) => r.json()) as Promise<Region[]>,
      response("regions.bin").then((r) => r.arrayBuffer()),
      response("context.bin").then((r) => r.arrayBuffer()),
      response("skeletons.json").then((r) => r.json()) as Promise<Skeleton[]>,
      response("sensory-mappings.json").then((r) => r.json()) as Promise<{
        inputs: Record<string, number[]>;
      }>,
      response("region-membership.json").then((r) => r.json()) as Promise<{
        regions: RegionMembership[];
      }>,
    ]);
  const motors = motorRegistry(cells);
  const augmentedGroups = {
    ...groups,
    roles: {
      input: { ...groups.roles.input, ...sensory.inputs, ...motors.inputs },
      readout: { ...groups.roles.readout, ...motors.readouts },
    },
  };
  const nf = parseNeurons(neurons),
    gf = parseGraph(await response("graph.bin").then((r) => r.arrayBuffer())),
    parsedGroups = parseGroups(augmentedGroups);
  if (nf.count !== new DataView(graph).getUint32(8, true) || nf.count !== cells.length)
    throw new Error("MaleCNS asset identity mismatch");
  for (let i = 0; i < cells.length; i++)
    if (nf.ids[i] !== BigInt(cells[i]!.id)) throw new Error("MaleCNS cell order mismatch");
  return {
    circuitProfile: circuitProfile(
      graph,
      [...motors.readouts.dnp03_l!, ...motors.readouts.dnp03_r!],
      [...motors.readouts.steer_l!, ...motors.readouts.steer_r!],
      nf.coreCount,
    ),
    version: `${response.version}:${motors.version}`,
    motors,
    neurons,
    graph,
    groups: augmentedGroups,
    sensory,
    membership: membership.regions,
    cells,
    regions,
    meshes,
    context,
    skeletons,
    nf,
    gf,
    parsedGroups,
  };
}
export type Dataset = Awaited<ReturnType<typeof loadDataset>>;
