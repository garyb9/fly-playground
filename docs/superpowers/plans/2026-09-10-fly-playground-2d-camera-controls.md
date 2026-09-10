# Plan 2d — mouse camera controls

Date: 2026-09-10. Status: implemented; left-drag behavior confirmed by the user.

User request: wheel zoom, right-click fly centering, and **left-drag to orbit
around the fly** (confirmed during implementation). The orbit target tracks the
moving fly. This confirmation supersedes the earlier proposal for a frozen
world-space inspection target.

## Interaction contract

| Input over the main 3D canvas | Result |
| --- | --- |
| Wheel toward zoom-in | Reduce camera distance to the current orbit target |
| Wheel toward zoom-out | Increase camera distance to the current orbit target |
| Right click | Recenter on the fly and resume following it, retaining current zoom and viewing direction |
| Left drag | Orbit in 3D around the moving fly; retain the chosen viewing direction |
| Left click without a drag | No action |

Zoom changes perspective-camera distance rather than field of view. Clamp the
distance to configured limits that prevent entering the fly mesh or losing the
scene. Normalize wheel/trackpad behavior and avoid sensitivity depending on frame
rate. Zoom must continue to work while the simulation is paused.

Recenter means the **visible fly center**, not the current forward look-ahead
point. The current `LOOKAHEAD = 2.5` offsets the fly from screen center and must
not be used for this action. Preserve zoom and the user's orbital direction;
right click is not a reset to the startup camera pose. Disable the browser
context menu and OrbitControls' default right-button pan only on the 3D canvas.

## Camera ownership and modes

- **Follow:** initial view follows the fly. Wheel zoom preserves the chosen
  distance as the fly moves. Fly-centered targeting must account for the rendered
  fly's position, including any render-only bob, when recentered.
- **Orbit:** left-drag starts from the current view without a jump. The target
  stays attached to the rendered fly center as it moves; the viewing direction
  and distance remain under mouse control. Releasing the mouse retains the
  chosen angle. Right click centers the fly without resetting angle or zoom.
- The mouse controls and the existing `updateFollowCamera` must not independently
  write the camera on the same frame. Introduce one controller that owns mode,
  target, orientation, distance and final camera update.
- Camera input is direct, with no inertia or automatic camera sway/kick in
  either mode. This keeps centering exact and makes reduced-motion behavior
  consistent. Fly bob, wing motion, escape glow, and brain effects remain.


Scope is the main world canvas (`#view`). The brain panel retains its own camera.
Scrolling its contents, editing sliders, or clicking HUD controls must not move
the world camera. No fly steering, teleporting, or simulation changes belong to
this camera task.

## Implementation sequence

1. **Camera state and pure behavior:** introduce `src/viz/camera-state.ts` and
   tests for zoom bounds, mode transitions, retained orientation/distance, and
   fly-centered targeting. Add camera tuning values to `CONFIG.camera`.
2. **Pointer adapter:** add `src/viz/camera-controls.ts`, using a small native Pointer Events adapter over the pure camera state.
   This supports the confirmed fly-attached pivot, drag threshold and custom
   right-click action without competing OrbitControls camera writes.
   Distinguish a click from a drag with a small movement threshold. Handle
   pointer capture/cancel, focus loss, and cleanup without stuck dragging.
3. **App integration:** replace the competing chase-camera writes in `main.ts`
   with the controller's single per-frame update. Keep the sim/worker interfaces
   unchanged. Wire disposal into the existing app cleanup.
4. **Discoverability:** show a small hint for the accepted controls and offer a
   focusable “center fly” button as an equivalent to right click. Keep controls
   clear of the brain panel and existing meters.
5. **Verification:** run focused tests, then the repository CI gate. During the
   implementation session, temporarily start the app/browser for visual checks
   and close them when finished, consistent with the latest user preference.

## Acceptance checks

- Wheel direction is correct; repeated wheel events remain within zoom limits.
- Dragging rotates both horizontally and vertically without camera flips,
  scene jumps, or subsequent chase-camera snapback.
- Right click centers the rendered fly in both axes and keeps it centered as
  it moves. Project the chosen fly-center anchor through the camera to verify
  normalized screen coordinates near `(0, 0)`.
- Right click retains zoom and viewing direction, works during pause, and does
  not pan the scene or open the browser context menu over the canvas.
- HUD, brain panel, sliders, disclosures, and their scrolling remain independent.
- Drag release outside the canvas, pointer cancellation and focus loss recover.
- Desktop/compact layouts, light/dark themes, and reduced motion remain usable.
- Repeated mounting/disposal does not multiply input handlers or leave browser
  connections running.

## Session cleanup

Before writing this plan, closed the two project Vite servers (ports 5173 and
5174), the production-check server (5175), and the dedicated headless review
Chrome session/debugging port (9222). Screenshots and code changes are retained;
no servers or browser sessions need to remain open for this planning task.

## Implementation and validation

- `camera-state.ts`: bounded exponential wheel zoom (pixel/line/page units),
  clamped orbit elevation, retained angle/distance, and moving-fly centering.
- `camera-controls.ts`: canvas-only pointer/wheel handlers, pointer capture,
  cancellation/focus-loss recovery, an accessible center button and controls
  hint. Ctrl/Meta-wheel remains available for browser zoom. Disposal aborts
  listeners and restores canvas attributes.
- `Fly.cameraTarget` uses the body geometry center, excluding wing flapping,
  transformed through body pose, visual tilt and bob. `main.ts` uses a single
  camera owner; the legacy chase/look-ahead writer is no longer called.
- Small screens reserve a row for camera controls above the meters and constrain
  the expanded brain card so the sidebar controls remain reachable.
- Pure tests cover zoom reversibility/units/limits, attached orbit and recenter
  semantics, pole bounds, target projection, and the rendered fly-center anchor.
- Chrome 152 native pointer/wheel tests passed for zoom, overlay isolation,
  click-vs-drag threshold, moving-fly orbit, right-click center, target tracking,
  drag release outside the canvas, blur cancellation, and disposed handlers.
  Projected target after right-click was approximately `(-3.7e-16, 0)` in NDC.
- Native Space activation on the center button centers without toggling pause.
  Actual app screenshots cover 1440×900, 800×600, and 390×844, light/dark,
  paused camera input and reduced motion. Captures: `/tmp/fly-review/2d-*.png`.
- Full repository CI: 119 TypeScript tests plus Rust/Python checks and builds.
  No new dependencies or simulation/worker changes.

Plan 03 remains: real anatomical rendering, verified connectome-driven autonomy,
full-scale data delivery and hardware-GPU performance acceptance.
