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

## Plan 02b — rich loop + controls

Every row below needs a real browser (`yarn dev`) — the headless vitest suite
(env `node`) cannot observe colour, motion, audio, or `localStorage` round-trips
through a live page. **All unchecked**: a human ticks them after the live pass.

- [ ] Neuron-count "depth" slider visibly changes the reported `sim_hz`.
- [ ] A one-sided light induces a **sustained** turn (record the direction).
- [ ] Wind meters respond to the configured field; L and R differ when the fly faces across it.
- [ ] LIF panel: raising `noiseSigma` visibly increases activity (in the Plan 2c panel + the
      meters); lowering `vThreshold` raises firing; **Reset** restores baseline.
- [ ] Readout + sensory meters track the demo (escape spikes on the burst, looming ramps on
      approach, proximity spikes on contact); the looming meter warms toward the escape colour.
- [ ] `setGroupVisible` wiring is live: toggling a group (from the Plan 2c panel) reaches
      `HudControls` and the panel re-renders — the HUD itself shows no filter checkboxes.
- [ ] Audio: unmuting starts the ambient bed; escape fires a blip; wing hum pitch tracks flapping;
      volume + mute work; silent until the first gesture.
- [ ] Place an object at the fly's position — it appears and the fly senses / collides with it.
      Move a light — shading and the light meters change. Reload — the edited scene persists.
      **Reset scene** — back to default.
- [ ] **Theme toggle** — `dark` (Deep Field) ⇄ `light` (cool lab): both legible; exactly one warm
      thing (the fly) in each; bloom only in dark; no cream in either.
- [ ] Escape burst (02b part): white bloom at the fly + a brief camera kick that decays in ~0.3 s;
      nothing else in the scene moves sharply.
- [ ] `prefers-reduced-motion`: fly bob + camera sway/kick + banner type-in drop; wing flap,
      physics, meters, escape bloom stay.
- [ ] Still runs under SAB (`crossOriginIsolated`) and under `postMessage` (headers commented out).

## Plan 03 — filled later

- [ ] `light_*` / `wind_*` sensing produces a steering gradient.
- [ ] Brain camera mode (OrbitControls through the connectome).

### Aesthetic — "Deep Field" ([`2026-09-09-visual-direction.md`](2026-09-09-visual-direction.md) §7 tracks code-side status; these are the by-eye rows)

- [ ] Background is the blue-black `void` (#070B14) — not cream, not `#000`, not tinted near-black.
- [ ] The connectome glows (additive) in cool teal→white; overlapping points bloom.
- [ ] Exactly **one** warm thing in the frame: the fly ember. World, lights, HUD all read cool.
- [ ] Escape burst is the sharpest motion in the scene — white bloom + pathway pulse + brief camera kick.
- [ ] Connectome breathes slowly at rest; fly drifts/bobs; none of it feels static.
- [ ] HUD is faint edge instrumentation (Plex Mono numbers, Plex Sans labels), centre stays clear; looming meter warms toward the escape colour as it climbs.
- [ ] Load sequence: points converge out of the dark → banner → fly ignites → HUD last.
- [ ] `prefers-reduced-motion` drops the ambient motion but keeps wing flap, physics, meters, escape bloom.
- [ ] Matches the style-frame: <https://claude.ai/code/artifact/1de23900-b352-4a62-be19-512f36365675>
