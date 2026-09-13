import { expect, test } from "vitest";
import { encodeModalities, initEncoderState } from "./encoders";
test("ON encoder suppresses startup, steady light and decrements; wind is bounded", () => {
  const start = encodeModalities(1, 0, 3, -1, 0.01, initEncoderState());
  expect(start.light_l).toBe(0);
  expect(start.wind_l).toBe(2);
  expect(start.wind_r).toBe(0);
  const change = encodeModalities(2, 0, 0, 0, 0.1, start.state);
  expect(change.light_l).toBe(2);
  expect(encodeModalities(1, 0, 0, 0, 0.1, change.state).light_l).toBe(0);
  expect(encodeModalities(2, 0, 0, 0, 0.1, change.state).light_l).toBe(0);
});
