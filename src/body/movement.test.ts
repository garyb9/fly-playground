import { expect, test } from "vitest";
import { Body } from "./body";
import { v, type WorldQuery } from "./types";
const world: WorldQuery = { aabbs: [], lights: [], bounds: { min: v(-5, 0, -5), max: v(5, 8, 5) } };
const readouts = { power_l: 0.5, power_r: 0.5, steer_l: 0, steer_r: 0 };
function advance(body: Body, seconds: number, w = world) {
  for (let t = 0; t < seconds * 200; t++) body.step(0.005, readouts, w);
}

test("assisted lateral/vertical movement and opposite turns use the fly's heading", () => {
  const left = new Body(v(0, 3, 0), 0, true),
    right = new Body(v(0, 3, 0), 0, true);
  left.command("left");
  right.command("right");
  advance(left, 3);
  advance(right, 3);
  expect(left.pose().position.z).toBeLessThan(-1.8);
  expect(right.pose().position.z).toBeGreaterThan(1.8);
  expect(left.pose().position.y).toBeCloseTo(3, 2);
  left.command("up");
  advance(left, 3);
  expect(left.pose().position.y).toBeGreaterThan(4.3);
  left.command("down");
  advance(left, 3);
  expect(left.pose().position.y).toBeLessThan(3.2);
  left.command("turn_left");
  right.command("turn_right");
  advance(left, 3);
  advance(right, 3);
  expect(left.pose().forward.z).toBeLessThan(-0.6);
  expect(right.pose().forward.z).toBeGreaterThan(0.6);
});
test("landing settles, stays still, and takeoff climbs again", () => {
  const body = new Body(v(0, 3, 0), 0, true);
  body.command("land");
  advance(body, 8);
  expect(body.movementMode()).toBe("grounded");
  expect(body.pose().position.y).toBeCloseTo(0.25, 3);
  const pos = { ...body.pose().position };
  advance(body, 2);
  expect(body.pose().position).toEqual(pos);
  body.command("takeoff");
  advance(body, 4);
  expect(body.pose().position.y).toBeGreaterThan(1.6);
  expect(body.movementMode()).toBe("assisted");
  body.command("release");
  expect(body.movementMode()).toBe("neural");
});
test("landing uses obstacle tops and resets clear body assistance", () => {
  const body = new Body(v(0, 4, 0), 0, true);
  const w = { ...world, aabbs: [{ min: v(-2, 0, -2), max: v(2, 2, 2) }] };
  body.command("land");
  advance(body, 5, w);
  expect(body.movementMode()).toBe("grounded");
  expect(body.pose().position.y).toBeCloseTo(2.25);
  body.reset(v(0, 3, 0), 0);
  expect(body.movementMode()).toBe("neural");
});
test("a fly pushed into a corner recovers into the room without teleporting", () => {
  const body = new Body(v(4.74, 2, 4.74), -Math.PI / 4, true);
  let recovered = false,
    maxStep = 0,
    previous = body.pose().position;
  for (let t = 0; t < 1000; t++) {
    body.step(0.005, readouts, world);
    recovered ||= body.movementMode() === "wall recovery";
    const pos = body.pose().position;
    maxStep = Math.max(
      maxStep,
      Math.hypot(pos.x - previous.x, pos.y - previous.y, pos.z - previous.z),
    );
    previous = pos;
  }
  expect(recovered).toBe(true);
  expect(body.pose().position.x).toBeLessThan(3.7);
  expect(body.pose().position.z).toBeLessThan(3.7);
  expect(maxStep).toBeLessThan(0.03);
});
