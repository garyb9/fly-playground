# Fly body: asset review and proposed direction

Reviewed 2026-09-10. Recommendation: build a simplified, articulated visual
asset from NeuroMechFly's upstream geometry, with our own materials and motion
adapter. Keep the current body dynamics while replacing the visual shell.

## What the references offer

| Reference | Verified implementation | Fit for this project |
| --- | --- | --- |
| [The palm](https://whatisabrain.com/fly/palm.html#1) | NeuroMechFly body; named anatomical parts; Draco GLB; JS drives wings and leg joints | Strongest anatomical body reference; use upstream geometry and author our own presentation |
| [FlyGym / NeuroMechFly](https://github.com/NeLy-EPFL/flygym) | Micro-CT-derived female body; separate STL segments, rig transforms, neutral poses, materials; Apache-2.0 repository | Recommended geometry source; does not require adopting the Python simulator |
| [Fly Escape](https://github.com/dzhng/fly-escape/tree/06540138d55127f87e69f8cca9982c4f1328be90/assets/fly) | Blender authoring scripts and source file; compact GLB with Walk, Fly, Land and Feed clips | Useful asset-pipeline reference; no general reuse license found in inspected tree or fly README |
| [Desktop Fly](https://github.com/DenisSergeevitch/desktop-fly/blob/32b00011e83c3dc85fa3ea0b3934155b04f1635d/windows/src/flymodel.js) | Procedural Three.js body, abdominal texture bands, red eyes, articulated legs; MIT source | Viable procedural fallback; geometry builder is entangled with desktop behavior imports |
| [Fly Effect](https://github.com/dj-thank/fly-effect) | Body and recorded-motion scripts; no OBJ/STL/GLB/GLTF entries found in inspected tree | Simulation reference, no ready body mesh identified |

FlyWire Codex remains useful for neural anatomy; its FAFB selection is not a
source of a MaleCNS body reconstruction. The palm explicitly describes its brain
placement inside the body as manual.

## Measured asset costs

Downloaded the two deployed/source GLBs into temporary storage and inspected
their JSON chunks. Exact URLs, hashes, counts and method are recorded in
[`fly-body-asset-audit.json`](fly-body-asset-audit.json).

| Asset | File bytes | Triangles | Meshes / nodes | Animation |
| --- | ---: | ---: | ---: | --- |
| The palm fly | 383,496 | 115,032 | 69 / 139 | No embedded clips; site animates named nodes |
| Fly Escape fly | 307,672 | 5,166 | 40 / 65 | Walk, Fly, Land, Feed |

The palm requires `KHR_draco_mesh_compression`; Fly Escape declares no required
extensions. Triangle counts describe unique mesh definitions, not a measured
frame cost. Compression reduces transfer size, not decoded geometry complexity.
Separate meshes also contribute draw calls; shadows and transparency add cost.

The upstream FlyGym tree already includes `simplified_max2000faces` STLs.
That limit is per part, so the assembled animal still needs a deliberate budget.
Its `rigging.yaml` supplies part transforms and its neutral pose files supply
joint rotations. Exporting STLs without their assembly transforms is insufficient.

Pinned upstream revisions inspected:

- FlyGym: `38c8ec61034cd59bc5ba0de20688d4a3c0000d60`
- Fly Escape: `06540138d55127f87e69f8cca9982c4f1328be90`
- Desktop Fly: `32b00011e83c3dc85fa3ea0b3934155b04f1635d`
- Fly Effect: `89d59fc56c3e4f3b0f9a26725ce4ee55fdf1ee36`

## What should look better

The current `src/viz/fly.ts` uses three scaled spheres for the core body,
small accent eyes, fixed two-segment legs, and short rod antennae. The abdomen
has no segmentation or banding. Both wings use the same planar outline.
There is also a concrete wing attachment issue: the membrane is translated
0.49 along the span, but its shape extends only about 0.2 in that dimension,
leaving a gap from its pivot. The comment mentions a leading vein, but none is
constructed. Increasing polygon counts alone would preserve these problems.

Proposed appearance:

- A broad thorax, compact head, and tapered abdomen with visible overlapping
  segments and restrained dark bands.
- Larger lateral burgundy eyes, with a fine facet normal pattern for close
  inspection; avoid thousands of separate eye-facet meshes.
- Thin wings attached at the actual hinge, with a readable leading edge and a
  few branching veins. Fold them back when perched and spread them in flight.
- Six articulated legs with distinct femur, tibia and tarsus silhouettes;
  supported feet should meet the surface.
- Short segmented antennae with arista detail, a small proboscis, and stalked
  halteres behind the wings.
- Warm brown cuticle with amber edge light. Keep identity color in a restrained
  accent or selection treatment so randomization preserves anatomical shading.
  Lower broad emissive glow enough to retain surface shape in the dark theme.

Use the scanned female body honestly as an illustrative body. If a specifically
male silhouette is required, author a documented stylized variant; do not imply
that reshaping the abdomen makes it a measured MaleCNS specimen.

## Concrete implementation route

1. Export the pinned upstream meshes with their full hierarchy and neutral
   transforms to one GLB. Preserve wing hinges and leg joint pivots. Include the
   Apache license, upstream attribution, revision and conversion notes.
2. Produce a proposed 15–25k-triangle close model and a 3–6k-triangle distant
   model. These are starting budgets, not measured performance guarantees.
   Merge rigid pieces sharing a material; preserve independently animated parts.
3. Load and cache geometry once. Give each fly its own transform hierarchy and
   only the materials needed for individual coloration. Retain a procedural
   fallback while loading or on asset failure.
4. Adapt the asset to our +X-forward, +Y-up frame and existing visual dimensions.
   Keep the `Fly` API (`object3d`, `update`, `cameraTarget`, `setTheme`, identity
   variation and `emberLight`) so callers need minimal changes. Compute the
   camera target from core body geometry, excluding wings and moving feet.
5. Connect cosmetic wing/leg poses to existing locomotion state and readouts.
   The current update receives only pose/readouts/dt; add explicit grounded and
   speed inputs where needed. Wing folding and walking poses need state beyond
   a continuous sine flap. Animation must not independently move the root or
   imply that an authored gait is a measured neural motor output.
6. Review front, side, top and three-quarter views in both themes, then walking,
   perching and flight transitions. Check camera stability, foot contact, wing
   attachment, identity variation and failure fallback. Profile one, three and
   six flies with the brain panel active before choosing final LOD distances.

For a quicker entirely procedural alternative, implement the same silhouette
with a custom abdomen surface, separate bands, connected wing shapes and a
small leg hierarchy. Desktop Fly's MIT builder is a useful reference, but our
existing class is small enough that an original implementation is practical.

## Validation and limits of this exploration

Verified public repository trees, relevant source, upstream license, rig and
material files, and binary asset metadata. The palm HTML credits NeuroMechFly
under Apache-2.0; its JS confirms anatomical node names and separate motion
logic. Prefer upstream provenance over copying the site's whole bundle.

A headless capture of the palm did not reach a useful loaded body view, so this
is a source/asset feasibility review, not a completed visual comparison or GPU
benchmark. No external geometry or code was installed into the application and
no runtime behavior was changed. A rendered comparison is the first validation
step of the proposed implementation.
