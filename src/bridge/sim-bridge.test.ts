import { expect, test, vi } from "vitest";
import { createSimBridge } from "./sim-bridge";
import { PmBridge } from "./pm-bridge";
import { SabBridge } from "./sab-bridge";

const fakeWorker = () =>
  ({ postMessage() {}, terminate() {}, onmessage: null }) as unknown as Worker;

test("createSimBridge picks transport by crossOriginIsolated", () => {
  vi.stubGlobal("crossOriginIsolated", false);
  expect(createSimBridge(fakeWorker)).toBeInstanceOf(PmBridge);
  vi.stubGlobal("crossOriginIsolated", true);
  expect(createSimBridge(fakeWorker)).toBeInstanceOf(SabBridge);
  vi.unstubAllGlobals();
});
