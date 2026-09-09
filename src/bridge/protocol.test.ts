import { expect, test } from "vitest";
import { encodeState, decodeState } from "./protocol";

test("state message round-trips with transferables", () => {
  const readouts = Float32Array.from([0.1, 0.2, 0.3, 0.4, 0.5]);
  const activity = Float32Array.from({ length: 32 }, (_, i) => i / 32);
  const msg = encodeState({ readouts, activity, simHz: 190, tick: 12345, paused: false });
  expect(msg.transfer).toEqual([msg.payload.readouts.buffer, msg.payload.activity.buffer]);
  const back = decodeState(msg.payload);
  expect([...back.readouts]).toEqual([...readouts]);
  expect([...back.activity]).toEqual([...activity]);
  expect(back.simHz).toBe(190);
  expect(back.tick).toBe(12345);
  expect(back.paused).toBe(false);
});

test("paused round-trips through the state message", () => {
  const mk = (paused: boolean) =>
    decodeState(
      encodeState({
        readouts: Float32Array.from([0.1]),
        activity: Float32Array.from([0.2]),
        simHz: 100,
        tick: 1,
        paused,
      }).payload,
    ).paused;
  expect(mk(false)).toBe(false);
  expect(mk(true)).toBe(true);
});
