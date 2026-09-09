# Manual verification checklist

## Plan 02 — minimal brain→fly loop (verified 2026-09-09, commit `ac22595`)

Ticked items are covered by an automated test in the suite (`yarn test`, 68
passing). Unticked items need a real browser + display: the headless suite
cannot observe colour, motion, or camera feel, so they are left for a live
check with the automated coverage that does exist noted alongside.

- [x] Fly hovers with no drift-to-ground at rest readouts — holds altitude
      within ±0.6 m over a full 10 s rest run (`src/body/body.test.ts` › "with
      hover readouts the fly holds altitude within a small band"; measured
      |dy| ≈ 0.41 m, bounded — not divergent). The at-rest roll bias is fixed
      at source in `src/body/wrench.ts`: both wings take one shared noise
      sample, so noise still jitters the symmetric lift/thrust term but cancels
      out of the asymmetric roll term. The sibling test "with hover readouts
      the fly never rolls" asserts `angVel.x` / `angVel.z` are exactly 0 and
      the lift axis stays world-vertical, so the tilted-lift spiral into the
      ground can no longer occur. (Heading still yaws slowly under constant
      cruise thrust from the independent yaw-channel noise — expected wander of
      a cruising fly, not the roll bug.)
- [ ] Fly cruises +X and the block at (9,4,0) triggers a giant-fiber escape
      burst + veer-away — pending live check (needs a browser; automated
      coverage is piecewise end-to-end: `src/body/body.test.ts` › "cruise
      carries the fly forward (+X)"; `src/sensing/sensing.test.ts` › "looming
      grows as the fly closes on the object"; `src/bridge/integration.test.ts`
      drives a looming ramp through the real wasm brain until `escape` crosses
      0.5; `src/body/body.test.ts` › "escape readout throws the fly upward";
      `src/app/loop.test.ts` wires sensing→bridge→body each frame; `yarn
      rs:smoke` shows `escape` climbing 0.0 → 1.0. The veer trajectory and the
      block's position on the cruise path are not asserted together in a
      running scene).
- [ ] Point cloud visibly pulses — activity colour shifts cold→hot during the
      burst — pending live check (needs a browser; automated coverage:
      `src/viz/geometry.test.ts` › "activityColour ramps cold→hot
      monotonically" and `src/viz/builders.test.ts` build the `THREE.Points`
      with a per-vertex `aActivity` attribute; the GLSL fragment shader that
      maps activity→colour is not unit-tested).
- [ ] Core edges light along the looming→escape path during the burst —
      pending live check (needs a browser; automated coverage:
      `src/viz/builders.test.ts` › "buildCoreEdges index is even-length and
      core-core only" and `src/viz/geometry.test.ts` › "coreEdgePairs are all
      core-core" build the `THREE.LineSegments`; per-frame opacity/colour
      response is not tested).
- [ ] Follow camera tracks smoothly, no jitter or overshoot — pending live
      check (needs a browser; automated coverage: `src/viz/follow-camera.test.ts`
      › "camera converges toward the offset target and stops (no overshoot —
      diff only shrinks)" and "lookAt leads the fly along its forward axis"
      assert monotone convergence and lookahead numerically).
- [ ] Runs under SAB (`crossOriginIsolated` true via `yarn dev`) AND under
      postMessage (comment out `server.headers` in `vite.config.ts`, reload) —
      same behavior — pending live check (needs a browser; automated coverage:
      `src/bridge/sim-bridge.test.ts` › "createSimBridge picks transport by
      crossOriginIsolated", `src/bridge/sab-bridge.test.ts` (SAB round-trip +
      torn-read recovery) and `src/bridge/pm-bridge.test.ts` (postMessage
      round-trip) exercise both transports headless).

## How to run the live check

1. `yarn dev` and open the served URL (default http://localhost:5173).
2. Watch for: the fly rising into a stable hover, then cruising along +X;
   as it nears the clay box at (9, 4, 0) the point cloud should warm from
   cold to hot, core edges along the looming→giant-fiber→motor path should
   brighten, and the fly should fire a takeoff impulse and veer off the
   box. The follow camera should trail the fly without jitter or overshoot.
3. `crossOriginIsolated` in the dev console should be `true` (SAB path). To
   check the fallback: comment out the `server.headers` COOP/COEP block in
   `vite.config.ts`, reload, confirm `crossOriginIsolated` is now `false`
   and the behaviour is unchanged (postMessage path).

## Plan 02b / 03 — filled later

- [ ] Neuron-count slider visibly changes reported sim Hz.
- [ ] A one-sided light induces a sustained turn toward / away from it.
- [ ] `light_*` / `wind_*` sensing produces a steering gradient.
- [ ] Brain camera mode (OrbitControls through the connectome).
- [ ] Ambient audio bed + reactive one-shots.
