import { Body } from "../body/body";
import type { BodyState } from "../body/integrate";
import type { MovementCommand, MovementMode } from "../body/movement";
import type { WorldQuery, Vec3, Readouts } from "../body/types";
import type { RoleTable } from "../sim/roles";
import { sample, initSensingState } from "../sensing/sensing";
import { encodeModalities, initEncoderState } from "../sensing/encoders";
import { directional, initDirectional } from "../sensing/directional";

export interface EmbodiedConfig {
  start: Vec3;
  heading: number;
  world: WorldQuery;
}
export interface EmbodiedSnapshot {
  state: BodyState;
  mode: MovementMode;
  stimulus: Float32Array;
}
export class Embodied {
  readonly body: Body;
  private senses = initSensingState();
  private encoder = initEncoderState();
  private sectors = initDirectional();
  private modalities = false;
  private flow = false;
  private lastStimulus: Float32Array;
  constructor(
    private config: EmbodiedConfig,
    private rt: RoleTable,
    seed: number,
  ) {
    this.body = new Body(config.start, config.heading, true, seed);
    this.lastStimulus = new Float32Array(rt.inputOrder.length);
  }
  setWorld(world: WorldQuery) {
    this.config = { ...this.config, world };
  }
  setInputs(modalities: boolean, flow: boolean) {
    this.modalities = modalities;
    this.flow = flow;
    this.encoder = initEncoderState();
    this.sectors = initDirectional();
  }
  command(command: MovementCommand) {
    this.body.command(command);
  }
  reset(start?: Vec3, heading?: number) {
    this.config = {
      ...this.config,
      start: start ?? this.config.start,
      heading: heading ?? this.config.heading,
    };
    this.body.reset(this.config.start, this.config.heading);
    this.senses = initSensingState();
    this.encoder = initEncoderState();
    this.sectors = initDirectional();
    this.lastStimulus.fill(0);
  }
  beforeStep(dt: number) {
    const result = sample(this.body.pose(), this.config.world, dt, this.senses, this.rt);
    this.senses = result.state;
    const { stimulus } = result;
    const read = (name: string) => stimulus[this.rt.input[name]!] ?? 0;
    const encoded = encodeModalities(
      read("light_l"),
      read("light_r"),
      read("wind_l"),
      read("wind_r"),
      dt,
      this.encoder,
    );
    this.encoder = encoded.state;
    for (const key of ["light_l", "light_r", "wind_l", "wind_r"] as const)
      if (this.rt.input[key] !== undefined)
        stimulus[this.rt.input[key]!] = this.modalities ? encoded[key] : 0;
    const sectors = directional(this.body.pose(), this.config.world, dt, this.sectors);
    this.sectors = sectors.state;
    for (const key of ["looming_l", "looming_r", "flow_l", "flow_r"] as const)
      if (this.rt.input[key] !== undefined)
        stimulus[this.rt.input[key]!] = key.startsWith("flow") && !this.flow ? 0 : sectors[key];
    // Hemisphere roles replace the broad looming injection, avoiding double drive.
    if (this.rt.input.looming_l !== undefined && this.rt.input.looming !== undefined)
      stimulus[this.rt.input.looming] = 0;
    this.lastStimulus = stimulus;
    return stimulus;
  }
  afterStep(dt: number, readouts: Readouts) {
    this.body.step(dt, readouts, this.config.world);
  }
  snapshot(): EmbodiedSnapshot {
    return {
      state: this.body.state() as BodyState,
      mode: this.body.movementMode(),
      stimulus: this.lastStimulus,
    };
  }
}
