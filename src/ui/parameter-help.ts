const HELP: Record<string, string> = {
  looming:
    "An object growing in the fly’s view as it approaches. Drives the modeled visual escape pathway.",
  looming_l:
    "Approaching surfaces in the left visual hemisphere; a coarse current proxy into left LC4/LPLC2 cells.",
  looming_r:
    "Approaching surfaces in the right visual hemisphere; a coarse current proxy into right LC4/LPLC2 cells.",
  proximity:
    "Closeness to obstacles. This dataset has no assigned proximity neurons, so this value alone does not drive behavior.",
  escape:
    "Mean activity of the giant-fiber cells (DNp01). Crossing the threshold triggers a modeled escape impulse.",
  light_l: "Positive brightness changes on the left; optional current into Mi1/Tm3 visual neurons.",
  light_r:
    "Positive brightness changes on the right; optional current into Mi1/Tm3 visual neurons.",
  wind_l: "Wind facing the left antenna; optional current proxy into JO-E sensory neurons.",
  wind_r: "Wind facing the right antenna; optional current proxy into JO-E sensory neurons.",
  wing_l:
    "Average activity across left wing motor cells. Includes both power and steering; retained as a summary.",
  wing_r:
    "Average activity across right wing motor cells. Includes both power and steering; retained as a summary.",
  power_l: "Left DLM/DVM wing power motor activity. Contributes to lift and its forward component.",
  power_r:
    "Right DLM/DVM wing power motor activity. Contributes to lift and its forward component.",
  steer_l:
    "Selected left steering motor activity. Left–right differences produce modeled roll and yaw.",
  steer_r:
    "Selected right steering motor activity. Left–right differences produce modeled roll and yaw.",
  dnp03_l:
    "Left DNp03 descending neuron: a candidate flight-saccade pathway. Movement depends on its downstream motor activity.",
  dnp03_r:
    "Right DNp03 descending neuron: a candidate flight-saccade pathway. Movement depends on its downstream motor activity.",
  thrust:
    "Legacy DLM/DVM motor summary. The new decoder uses the separate power groups instead of adding this as extra thrust.",
  yaw: "Rotation around the vertical axis. In this model, steering motor differences generate yaw torque.",
  yaw_torque:
    "Legacy yaw group, with no assigned neurons. Current turning comes from steering motor differences.",
  flow_l:
    "Optional left HS-cell input from coarse motion contrast. Experimental optic-flow proxy, not a full retinal model.",
  flow_r:
    "Optional right HS-cell input from coarse motion contrast. Experimental optic-flow proxy, not a full retinal model.",
  background: "Activity in simulated neurons outside the named sensory and motor groups.",
  dtMs: "Neural timestep. The embodied loop fixes this at 5 milliseconds to keep sensing, neurons and movement synchronized.",
  tauMMs: "Membrane time constant: how long a neuron retains incoming electrical drive.",
  vThreshold: "Membrane level a neuron must reach to emit a spike.",
  vReset: "Membrane level immediately after a spike.",
  refracMs: "Minimum recovery interval after a spike before a neuron can fire again.",
  noiseSigma: "Strength of seeded random current added to neurons each tick.",
};
export const parameterHelp = (name: string): string | undefined => {
  if (/^leg_[lr][fmh]$/.test(name)) {
    const side = name[4] === "l" ? "Left" : "Right";
    const part = name[5] === "f" ? "front" : name[5] === "m" ? "middle" : "hind";
    return `${side} ${part} leg motor activity, selected from MaleCNS limb annotations. Drives modeled leg flexion; not a measured muscle force or walking controller.`;
  }
  return HELP[name];
};
export function explainParameter(element: HTMLElement, name: string) {
  const help = parameterHelp(name);
  if (!help) return;
  element.title = help;
  element.tabIndex = 0;
  element.setAttribute("aria-description", help);
}
