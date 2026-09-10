import { expect, test } from "vitest";
import { Loop, type FrameView } from "./loop";
import { Body } from "../body/body";
import { v } from "../body/types";
import type { WorldQuery } from "../body/types";
import type { RoleTable } from "../sim/roles";
import type { SimBridge } from "../bridge/sim-bridge";
import * as sensing from "../sensing/sensing";
import { CONFIG } from "./config";

const rt: RoleTable = {
  input: { light_l: 0, light_r: 1, looming: 2, proximity: 3, wind_l: 4, wind_r: 5 },
  readout: { escape: 0, thrust: 1, wing_l: 2, wing_r: 3, yaw_torque: 4 },
  inputOrder: ["light_l", "light_r", "looming", "proximity", "wind_l", "wind_r"],
  readoutOrder: ["escape", "thrust", "wing_l", "wing_r", "yaw_torque"],
};

function fakeBridge() {
  const state = {
    readouts: new Float32Array(5),
    activity: new Float32Array(8),
    simHz: 200,
    tick: 0,
    paused: false,
  };
  const stim: Float32Array[] = [];
  const obj: SimBridge = {
    init: async () => ({ nNeurons: 0, coreCount: 0, roleTable: rt }),
    setStimulus: (x: Float32Array) => stim.push(x.slice()),
    readState: () => state,
    setActiveCount() {},
    setParams() {},
    pause() {},
    resume() {},
    reset() {},
    dispose() {},
  };
  return { obj, stim, state };
}

const world: WorldQuery = {
  aabbs: [],
  bounds: { min: v(-20, 0, -20), max: v(20, 20, 20) },
  lights: [],
};

test("frameOnce feeds sensing→bridge and builds a named Readouts view for the body", () => {
  const fb = fakeBridge();
  fb.state.readouts[rt.readout.wing_l!] = 0.3;
  let seen: FrameView | undefined;
  const loop = new Loop({
    bridge: fb.obj,
    body: new Body(v(0, 4, 0), 0),
    sensing,
    roleTable: rt,
    world,
    onFrame: (fv) => (seen = fv),
  });
  loop.frameOnce(0); // first call only seeds the clock — no pipeline, no push
  loop.frameOnce(16);
  loop.frameOnce(32);
  expect(fb.stim.length).toBe(2); // two real frames
  expect(fb.stim[1]!.length).toBe(6); // stimulus vector = nInputRoles
  expect(seen!.readouts.wing_l).toBeCloseTo(0.3, 6); // Float32Array → named view (f32 round-trip)
  expect(seen!.pose.position).toBeDefined();
});

test("dt is clamped so a long stall cannot tunnel", () => {
  const fb = fakeBridge();
  const body = new Body(v(0, 4, 0), 0);
  const loop = new Loop({
    bridge: fb.obj,
    body,
    sensing,
    roleTable: rt,
    world,
    onFrame: () => {},
  });
  loop.frameOnce(0);
  loop.frameOnce(10_000); // 10s stall
  expect(Number.isFinite(body.pose().position.y)).toBe(true);
  expect(Math.abs(body.pose().position.y)).toBeLessThan(1e4);
});

test("a collision this frame adds a proximity startle to next frame's stimulus", () => {
  // Run the identical fly + frame sequence twice, changing ONLY whether the
  // fly's collision sphere clips an obstacle. The contacting AABB sits at a
  // corner offset from the fly: `resolveSphere` reports contact (the sphere
  // overlaps the radius-expanded box) but none of the six cardinal sensor rays
  // enter the box, so `sensing` contributes ~0 proximity in BOTH runs. The
  // frame-after-contact difference is therefore the raw CONTACT_STARTLE the loop
  // injects — nothing else. (The old assertion `prox > 0` was vacuous: the fly
  // started inside the AABB, so `sensing` alone already saturated proximity and
  // the test passed even with the startle wiring deleted from loop.ts.)
  const runFrames = (w: WorldQuery): number => {
    const fb = fakeBridge();
    const loop = new Loop({
      bridge: fb.obj,
      body: new Body(v(0, 4, 0), 0),
      sensing,
      roleTable: rt,
      world: w,
      onFrame: () => {},
    });
    loop.frameOnce(0);
    loop.frameOnce(16); // contact (if any) happens in this frame's body.step
    loop.frameOnce(32); // startle (if any) lands in this frame's stimulus
    return fb.stim[fb.stim.length - 1]![rt.input.proximity!]!;
  };

  const nonContactProx = runFrames({ aabbs: [], bounds: world.bounds, lights: [] });
  const contactProx = runFrames({
    aabbs: [{ min: v(0.1, 4.1, 0.1), max: v(3, 7, 3) }],
    bounds: world.bounds,
    lights: [],
  });

  // The non-contacting run's proximity must stay well below PROX_MAX so the
  // startle is unambiguously visible in the delta.
  expect(nonContactProx).toBeLessThan(CONFIG.sensing.PROX_MAX - CONFIG.physics.CONTACT_STARTLE);
  expect(contactProx).toBeCloseTo(nonContactProx + CONFIG.physics.CONTACT_STARTLE, 1);
  expect(contactProx - nonContactProx).toBeGreaterThan(2.5);
  expect(contactProx - nonContactProx).toBeLessThan(3.5);
});

test("frameOnce feeds sensing→bridge and builds named Readouts + sensory views", () => {
  const fb = fakeBridge();
  fb.state.readouts[rt.readout.wing_l!] = 0.3;
  let seen: FrameView | undefined;
  const loop = new Loop({
    bridge: fb.obj,
    body: new Body(v(0, 4, 0), 0),
    sensing,
    roleTable: rt,
    world: { aabbs: [], bounds: { min: v(-20, 0, -20), max: v(20, 20, 20) }, lights: [] },
    onFrame: (fv) => (seen = fv),
  });
  loop.frameOnce(0);
  loop.frameOnce(16);
  expect(seen!.readouts.wing_l).toBeCloseTo(0.3, 6);
  // sensory is a named view of the injected stimulus (inputOrder keys)
  expect(Object.keys(seen!.sensory).sort()).toEqual([...rt.inputOrder].sort());
  expect(seen!.sensory.proximity).toBeGreaterThanOrEqual(0);
  expect(seen!.paused).toBe(false);
});

test("setWorld swaps the world the loop feeds to sensing + body on the next frame", () => {
  const fb = fakeBridge();
  const steps: unknown[] = [];
  const body = {
    pose: () => new Body(v(0, 4, 0), 0).pose(),
    step: (_dt: number, _r: unknown, w: unknown) => {
      steps.push(w);
      return { contact: false };
    },
  } as unknown as Body;
  const w1: WorldQuery = { aabbs: [], bounds: { min: v(-1, 0, -1), max: v(1, 1, 1) }, lights: [] };
  const w2: WorldQuery = { aabbs: [], bounds: { min: v(-9, 0, -9), max: v(9, 9, 9) }, lights: [] };
  const loop = new Loop({
    bridge: fb.obj,
    body,
    sensing,
    roleTable: rt,
    world: w1,
    onFrame: () => {},
  });
  loop.frameOnce(0);
  loop.frameOnce(16);
  loop.setWorld(w2);
  loop.frameOnce(32);
  expect(steps.at(-1)).toBe(w2);
});

test("pause freezes body, sensing and injections, and resume excludes paused time", () => {
  const run = (pause: boolean) => {
    const fb = fakeBridge();
    const body = new Body(v(0, 4, 0), 0);
    let view: FrameView | undefined;
    const loop = new Loop({
      bridge: fb.obj,
      body,
      sensing,
      roleTable: rt,
      world,
      onFrame: (x) => {
        view = x;
      },
    });
    loop.frameOnce(0);
    loop.frameOnce(16);
    const pose = structuredClone(body.pose());
    const sensors = structuredClone(view!.sensory);
    if (pause) {
      fb.state.paused = true;
      loop.frameOnce(1000);
      loop.frameOnce(10000);
      expect(body.pose()).toEqual(pose);
      expect(view!.sensory).toEqual(sensors);
      expect(view!.paused).toBe(true);
      expect(fb.stim).toHaveLength(1);
      fb.state.paused = false;
    }
    loop.frameOnce(pause ? 10016 : 32);
    expect(view!.paused).toBe(false);
    return body.pose();
  };
  expect(run(true)).toEqual(run(false));
});

test("starting paused publishes a stationary frame without injecting", () => {
  const fb = fakeBridge();
  fb.state.paused = true;
  const body = new Body(v(0, 4, 0), 0);
  const pose = structuredClone(body.pose());
  let view: FrameView | undefined;
  const loop = new Loop({
    bridge: fb.obj,
    body,
    sensing,
    roleTable: rt,
    world,
    onFrame: (x) => {
      view = x;
    },
  });
  loop.frameOnce(0);
  loop.frameOnce(16);
  expect(view!.pose).toEqual(pose);
  expect(view!.sensory).toEqual({});
  expect(fb.stim).toHaveLength(0);
});
