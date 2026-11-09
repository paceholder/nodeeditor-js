# Tasks

Each task starts with a test that fails before the fix. Test titles name the rule in words.

## 1. Rendering robustness

- [x] 1.1 Isolate painters with `try`/`finally`, guard each layer and the after-frame hook in the frame scheduler, reset the context at the start of each layer paint, and report through the `paint-error` event (D1); verify `frame-scheduler.test.ts` (a throwing layer does not stop the other layers or the after-frame hook) and `painter-isolation.browser.test.ts` (a node painter that clips and throws once leaves the other nodes painted in later frames; one report per layer per frame; rethrown without a listener)
- [x] 1.2 Repaint synchronously after a container resize through a scheduler `flush()` (D4); verify `frame-scheduler.test.ts` (flush paints the dirty layers now and cancels the pending request) and `resize.browser.test.ts` (with a frame clock that never fires, the canvases show content after a resize)
- [ ] 1.3 Take the backing size from the device-pixel box and cap its area (D5); verify `backing-size.test.ts` (device box preferred, area cap lowers the ratio, at least one pixel)
- [ ] 1.4 Snap grid lines in device space (D6); verify `grid.test.ts` (at ratio 1.5 every line's device coordinate is an integer plus one half)

## 2. Assets

- [ ] 2.1 Add a decode seam to the asset service and drop every cached size of an asset whose rasterization fails; verify `asset-service.test.ts` (a failed rasterization leaves no size of the asset cached)
- [ ] 2.2 Add `invalidate(ref?)` to the asset service and the view handle (D2); verify `asset-service.test.ts` (invalidating a ready asset calls the resolver again on the next draw; invalidating all forgets every asset)
- [ ] 2.3 Pin what the current frame draws, keep the decoded source when the last bitmap goes, evict whole undrawn assets only under pressure, report `overBudget` and `pinnedBytes`, and call `endFrame()` from the view (D2); verify `asset-service.test.ts` (eight 512 by 512 pictures under 4 MiB for 120 frames: eight resolves, eight rasterizations, over budget reported; an evicted bitmap is rasterized again without a resolver call) and `bitmap-cache.test.ts` (pinned entries survive eviction)
- [ ] 2.4 Clamp the SVG intrinsic size, count SVG sources by text length and bound every raster side (D3); verify `bitmap-cache.test.ts` (raster size never exceeds the maximum side), `svg-safety.browser.test.ts` (a 30 000 by 30 000 SVG reads as 4096 by 4096) and `asset-service.test.ts` (an SVG source counts two bytes per character)
- [ ] 2.5 Screen blobs by media-type prefix, reject `set` and `animate` on link attributes, and document the image-element isolation (D3); verify `svg-safety.browser.test.ts` and `asset-service.browser.test.ts` (a `image/svg+xml;charset=utf-8` blob with a script fails as unsafe)

## 3. Painting cost

- [ ] 3.1 Cache text fitting per font, text and width (D8); verify `text-measure.test.ts` (500 truncated titles: the second pass makes no measurement)
- [ ] 3.2 Look up port records directly and remove the cheap per-entity allocations (D9); verify `scene-layer.test.ts` (painting a 200-port node reads each port once and never asks for the node's port list; a node painter sees the same bounds object in two frames of an unchanged node)
- [ ] 3.3 Repaint the scene on hover only for painters that declare `repaintOnHover` (D7); verify `hover.browser.test.ts` (no scene repaint for a hover change without such a painter; a declaring painter sees the hover)

## 4. Shared state

- [ ] 4.1 Freeze exported constants deeply (D10); verify `constants-frozen.test.ts` (every constant object or array exported from the view entries is deeply frozen)
- [ ] 4.2 Wrap every change subscription per call (D10); verify `painters.test.ts`, `route-editor-registry.test.ts`, `asset-service.test.ts` and `selection-model.test.ts` (one handler subscribed twice survives one unsubscribe)

## 5. Pointer, wheel and touch

- [ ] 5.1 Add `buttons` to pointer tool input and cancel a gesture whose mouse button is no longer held (D11); verify `tool-router.test.ts` (a move without the gesture's button cancels the drag with reason `button-released` and nothing is submitted)
- [ ] 5.2 Cancel an undragged press on any `contextmenu` event (D11); verify `tools-lifecycle.browser.test.ts` (Control-click on a node without a menu listener, then a move with no button: the node does not move)
- [ ] 5.3 Cancel a gesture on a change from any origin to an involved entity (D12); verify `tool-router.test.ts` / `select-move-tool.test.ts` (undo during a drag cancels with `entity-changed`; a local host edit during a resize cancels; an unrelated change does not)
- [ ] 5.4 Zoom on Control-wheel in every mode and always consume it, with `pinchSensitivity` (D13); verify `wheel-zoom.test.ts` (pinch at the limit is handled; pinch zooms in scroll-page mode; delta clamp) and `overlay-wheel.browser.test.ts` (a Control-wheel at the maximum zoom is default-prevented)
- [ ] 5.5 Add `deltaX` to wheel input and the `wheel: "pan"` mode (D14); verify `wheel-zoom.test.ts` (a diagonal plain wheel pans both ways in pan mode; the modifier zooms; zoom mode unchanged)
- [ ] 5.6 Pinch-zoom with two touches (D15); verify `touch-pinch.test.ts` (spreading two touches doubles the zoom about the midpoint; midpoint motion pans; lifting one ends it) and `touch-pinch.browser.test.ts` (a second touch during a node drag cancels it with nothing submitted)
- [ ] 5.7 Throttle idle cursor work to once per frame (D18); verify `idle-move.browser.test.ts` (twenty moves before a frame run one scene pick)

## 6. Keyboard

- [ ] 6.1 Fall back to the physical key code (D16); verify `keymap.test.ts` (Ctrl+Я on the Z key resolves to undo; AZERTY Z still matches by character)
- [ ] 6.2 Add `KeyBinding.repeat` and ignore repeats of nudge, rotate, mirror and duplicate (D17); verify `keymap.test.ts` and `basic-editing.browser.test.ts` (ten repeated arrow key-downs move once and add one history entry)

## 7. Mount surface

- [ ] 7.1 Give the root a role, role description and label, and hide the canvases (D19); verify `mount-view.browser.test.ts` (default name, host label)
- [ ] 7.2 Move the tool-writing contract to `view/advanced` and mark it unstable (D20); verify `entry-points.test.ts` (the tool type is on the advanced entry, not the view entry) and `npm run typecheck` over the examples

## 8. Docs and gates

- [ ] 8.1 Update `docs/guide-view.md`, `docs/interaction.md` and `docs/architecture.md` for the changed behaviour; verify `npm run lint`
- [ ] 8.2 Record the Safari clipboard finding, the accessibility follow-up and other evidence in `notes.md`; run lint, typecheck, `npm test`, `npm run test:browser`, `npm run build` and `openspec validate harden-view-rendering-and-interaction --strict`; record the results in `notes.md`
