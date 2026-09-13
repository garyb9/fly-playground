# Habitat and behavior expansion

Implemented: seeded 1–4-room habitats with open passages, 0–12 point lights,
0–80 flower obstacles, persisted scene editing, Brain/Habitat/Tuning tabs,
top fly roster, two-row lower fly controls, visible neuron slider, and full
166,700-neuron startup for initial and subsequently added flies.

The modeled tonic wing current is now adjustable, with default 0.85. A compact
MaleCNS seed-42 check at 1,000 ticks measured mean wing activity 0.506 at 0.85
versus 0.483 at 0.6; the lift decoder's hover reference is 0.5. This reduces a
source of settling without adding a force independent of neural output. It does
not guarantee perpetual flight or validate biological flight dynamics.

The existing experiment selector now also exposes the thrust motor readout
members, using the same pulse/hold/silence mechanism. This is direct modeled
motor stimulation, not a newly reconstructed behavioral circuit.

## Next connectome-backed actions

- **Landing / takeoff:** landing-associated DNp07/DNp10 and the existing
  LC4/LPLC2 → giant-fiber escape pathway are useful starting points. Landing
  requires an approach cue, a grounded state, contact handling and leg animation;
  giant-fiber escape is not interchangeable with all voluntary takeoffs.
- **Walking and turning:** DNa02 is associated with turning; moonwalker DNs with
  backward walking. Requires ground locomotion and leg motor decoding instead
  of mapping walking neurons onto flight forces.
- **Antennal grooming:** aDN pathways offer a bounded action to add while
  grounded; requires antenna/leg animation and a declared tactile input model.
- **Flower visits:** the visual flowers are already objects in the sensory and
  collision world. Odor attraction and feeding would require olfactory and
  gustatory encoders, verified target identities, and feeding readouts. They
  are not implied by the presence of flowers or by full brain depth.

Circuit associations are described in [Comparative connectomics of Drosophila
descending and ascending neurons](https://www.nature.com/articles/s41586-025-08925-z)
and [Descending networks transform command signals into population motor
control](https://www.nature.com/articles/s41586-024-07523-9). These include evidence
from different datasets and experiments; cell identities must be checked against
the shipped MaleCNS annotation before implementation. Each action should get a
matched stimulated/control/pathway-silenced assay before being described as a
connectome-driven behavior.

Validation: habitat tests cover seeded replay, persistence, count limits, and
unobstructed corridors through all four room counts. Desktop (1440×1000) and
mobile (390×844) Chrome checks found no runtime exceptions and exercised habitat
regeneration with zero lights, then six lights and 40 flowers. Screenshots were
inspected for the default Brain tab, full-depth slider, top roster and compact
lower controls. Chrome used software rendering; this is not a GPU benchmark.
