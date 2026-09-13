# Improving connectome-to-action effects

Research date: 2026-09-10. Scope: the current working tree, shipped MaleCNS
assets, and primary research. Recommendations below are proposed engineering
work, not implemented or physiologically validated behavior.

The highest-value next milestone is directional evasive steering with distinct
power and steering outputs, verified in a closed-loop causal assay. Increasing
neuron count alone cannot supply missing sensory information or motor degrees
of freedom.

## What currently limits behavior

Inspection of `pipeline/build_real.py`, `pipeline/build_full.py`,
`src/body/wrench.ts`, `src/sensing/sensing.ts`, `src/sensing/encoders.ts`,
`src/app/loop.ts`, and the shipped full `cells.json`/`groups.json` establishes:

| Finding | Consequence |
| --- | --- |
| Each wing readout averages 30 neurons spanning power, steering, and other wing muscles. | Functionally different activity patterns can collapse to the same output. |
| All 16 thrust-readout neurons also belong to the wing readouts. | The same activity contributes to both lift and forward force; independent effects are difficult to interpret. |
| `yaw_torque` has no members. Wing difference drives both roll and yaw; there is no explicit pitch command. | Current neural outputs offer limited independent control of body rotation. |
| Escape averages two DNp01 cells and triggers a fixed up-plus-forward impulse and force lockout. | Escape has a visible effect, but its direction and body program are engineered. |
| One looming scalar stimulates 311 LC4/LPLC2 neurons. | Spatial information needed to choose an evasive direction is discarded. |
| Proximity has no native input targets. Light/wind use optional extension mappings; their base role lists are empty. | Computing a sensor value does not by itself establish a native behavior. |
| Live sensing runs once per rendered frame; body substeps reuse the latest neural readout. | Neural/body elapsed time is aligned, but the complete feedback loop is still frame dependent. |
| Full-brain additions are ranked by weighted degree. | More active neurons do not guarantee complete task-relevant pathways. |

The existing matched assay is a useful foundation: it already compares control,
stimulation, and pathway silencing with matched seeds. Its recorded results
demonstrate software coupling; they do not establish biological flight accuracy.

Important documentation discrepancy: `docs/neuron-model.md` describes
modulatory/unknown transmitters as positive-current sources, whereas both real
data builders set their outgoing current weights to zero. The builders use
`W_NORM = 0.003`. Use implementation and asset metadata when designing experiments.

## Prioritized improvements

### 1. Separate power, steering, and escape outputs

Build a versioned motor registry with body ID, type, target muscle, output side,
evidence, and confidence. Check motor nerve/target laterality instead of assuming
soma side equals the controlled side. Split DLM/DVM power cells from identified
steering cells such as b1/b2, i1/i2, and hg groups; unresolved types should remain
explicitly unresolved.

MANC circuit analysis distinguishes wing power and steering networks. Power
muscles are asynchronous and stretch activated: motor-neuron spikes do not time
each wingbeat. Steering involves different muscles and timing relationships.
This supports separate activation filters and a wingbeat-averaged body model.
It does not provide a ready-made force decoder for this MaleCNS specimen.
See [Cheong et al., descending-to-motor circuits](https://elifesciences.org/articles/96084).

Proposed decoder: named motor activities → bounded muscle activation states →
estimated left/right wing kinematic changes → forces and torques. Initially use
a small calibrated mapping with separate response times and explicit gains.
Do not equate the 200 Hz neural update with a resolved wingbeat simulation.
Independent pitch control requires supported actuator mappings, not just a new
readout label.

Measure the existing tonic drive's effect on each motor subgroup before tuning
it. Test tonic power drive separately from steering baselines; blanket drive to
all wing neurons can obscure the effects we want to study. That is a hypothesis
to measure, not a demonstrated saturation problem.

### 2. Make evasive turns directional

The shipped full ordering already contains left/right DNp03 at indices 403/464,
inside the 1,585-neuron always-on circuit. DNp15 is present at 6765/6785. These
indices are bundle-specific; durable definitions must use MaleCNS body IDs.
Presence alone does not establish that every required partner is active.

DNp03 is a strong first candidate: published recordings associate it with
visually elicited flight saccades and looming responses.
See [Cruz et al., flight saccades](https://www.sciencedirect.com/science/article/pii/S0960982224016415).
Trace its actual MaleCNS paths to premotor and steering cells before assigning
direction or gain.

Replace the single looming value with coarse eye-centered sectors carrying
angular size and expansion. Map sectors to visual cells only where receptive-field
or retinotopic evidence supports it. Soma coordinates alone are insufficient.
Until that mapping exists, bilateral direct stimulation is an intervention
experiment, not a reconstructed retinal encoder.

Keep giant-fiber startle and aerial saccades separately observable. First test
left/right DNp03 stimulation through native downstream connections, then test
spatial looming through its sensory inputs. Do not wire DNp03 directly to a
fixed turn and call that proof of the intervening connectome.

### 3. Add motion-based feedback for sustained steering

Use coarse panoramic visual samples and temporal contrast to represent motion,
including ON and OFF channels. Optic flow should change when the fly rotates or
translates. The current brightness-increment input to Mi1/Tm3 cannot encode all
of that structure.

Connectome-constrained visual models demonstrate that fitting unknown dynamics
to a motion task can recover useful neural response properties; anatomy alone
does not determine those parameters.
See [Lappalainen et al., 2024](https://www.nature.com/articles/s41586-024-07939-3).
Research on optic-flow processing also identifies HS/H2-related descending
pathways, including DNp15, as candidates to investigate rather than assuming a
simple light-to-turn reflex.
See [competitive disinhibitory optic-flow network](https://www.nature.com/articles/s41593-025-01948-9).

For a browser, begin with a reduced sensory representation and measured task
performance. Full retinal rendering and a detailed muscle simulator are later
options. NeuroMechFly v2 offers an architectural reference for sensory feedback
and embodied control, particularly walking; it is not a drop-in validated
flight controller. See [NeuroMechFly documentation](https://neuromechfly.org/).

### 4. Preserve complete pathways at useful simulation depths

Add task-specific circuit bundles containing sensory, descending, premotor,
motor, and relevant recurrent/inhibitory partners. Compare those bundles with
the full graph on the same stimuli. Report active membership and retained input
weight for each stage, not just total neuron count.

Preserving a few shortest paths is insufficient: parallel and inhibitory routes
can change the response. Test pruning thresholds and boundary effects. Do not
silently rescale remaining connections whenever depth changes, since that would
change the model while appearing to change only its size.

### 5. Calibrate dynamics against specific responses

Retain the LIF model initially. Sweep input gain, synaptic scale, baseline drive,
and relevant time constants against defined response curves. Add cell-type
parameters, synaptic filtering, adaptation, or a slower modulatory channel only
when a specific observed failure motivates them.

Shiu et al. demonstrate useful sensorimotor predictions with a simple LIF model,
while identifying limitations involving basal inhibition, neuromodulation,
non-spiking neurons, and precise dynamics. Their demonstrated behaviors do not
validate this project's free-flight decoder.
See [Shiu et al., 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC11446845/).

## Validation and implementation sequence

1. **Audit and baseline:** export motor membership, overlaps, laterality evidence,
   candidate pathway coverage, and per-group activity/force contributions.
2. **Motor refactor:** implement separate power and steering activation in
   `src/body/wrench.ts`; retain a baseline configuration for comparisons. Validate
   single-group dose responses and interference between outputs.
3. **Directional assay:** extend `src/experiments/assay.ts` with unilateral DNp03
   and spatial looming trials, explicit downstream silencing, and reactivation.
4. **Closed-loop execution:** move sensing, neural stepping, and body integration
   onto one fixed simulation clock. Transfer world edits and timestamped peer
   states to that loop; publish snapshots for rendering. An output history alone
   would not fix frame-dependent sensory feedback.
5. **Navigation expansion:** add optic flow after the steering assay passes;
   consider landing, walking, grooming, and flower attraction as subsequent
   projects with their own body states, encoders, and validation.

For each new action compare no stimulus, stimulus, stimulus plus candidate-path
silencing, restored pathway, and matched unrelated-cell silencing. Use several
seeds, stimulus strengths, and brain depths. Distinguish neuron silencing from
edge-specific blockade: silencing a cell affects all of its outputs.

Record response latency, turn sign/angle, wing power, altitude loss, recovery,
and collision rate. Add a stage trace showing stimulus → sensory activity →
descending activity → motor activity → force/torque → motion. Show actual emitted
synaptic current where available; source activity on a connectivity line is not
proof of transmission.

The first acceptance target should be an evasive turn whose direction follows
the stimulus, whose relevant neural and motor responses precede movement, and
whose effect is selectively reduced by pathway interruption and restored by
reactivation. Numerical thresholds should be specified before fitting and tested
on held-out trials. No new performance or biological validation is claimed by
this research note; only source/code review and a read-only asset inventory were
performed.
