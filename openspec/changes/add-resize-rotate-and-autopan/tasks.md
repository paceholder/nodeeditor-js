# Tasks

## 1. Node frame and size limits (core/data, core/edit)

- [ ] 1.1 Create `src/core/data/model/node-frame.ts` (`frameVector`, `frameVectorInverse`, `anchoredPosition(record, size, fixed)`, `ResizeFixed`) (D2); verify `node-frame.test.ts` titled NOD-04a for all nine fixed points, and `src/core/space/geometry/node-frame-agreement.test.ts` titled NOD-04 that `frameVector` equals the linear part of `nodeTransform` for all eight rotation and mirror combinations
- [ ] 1.2 Add `SizeLimits` and `NodeTypeDefinition.sizeLimits` in `src/core/data/node-types/definition.ts`, and make `registry.ts` reject negative, non-finite (other than an infinite `max`) or `min > max` limits with `malformed-record` (D1); verify `registry.test.ts` titled NOD-01, NOD-04a covering each rejected case and an accepted type with only `min`
- [ ] 1.3 Implement `src/core/edit/commands/size-limits.ts` (`SizeLimitPolicy`, `ResolvedSizeLimits`, resolution default → type → host hook, per-field replacement, `max` widened to `min` for an inconsistent hook result), add `sizeLimits` to `PlanContext` and `CommandEnvironment`, and the `sizeLimits` option and `sizeLimits(id)` method to `src/core/graph-model.ts`; verify `size-limits.test.ts` titled NOD-04a: the default minimum is 1×1, a type bound replaces only its own field, and the "Instance limits refine type limits" scenario

## 2. Resize and mirror commands (core/edit)

- [ ] 2.1 Add the `resizeNode` kind to `Command` in `src/core/edit/commands/types.ts`, implement `resize-node.ts` (D2: `unknown-entity`, `non-finite`, `out-of-range` naming the node and bound, empty plan for an unchanged size, one node update with `size` and the anchored `position`, label "Resize"), dispatch it in `plan.ts`, and add `model.resizeNode(id, size, fixed?)` to `convenience.ts`; verify `resize-node.test.ts` titled NOD-04a, PAT-04 with the "Command outside the limits" and "Opposite side stays fixed on a rotated node" scenarios, and `npm run typecheck` (including the core-only pass)
- [ ] 2.2 Add `axis?: "horizontal" | "vertical"` to `mirrorNodes` and implement the screen-axis table of D5 in `transform-nodes.ts` (each node about its own centre); verify `transform-nodes.test.ts` titled NOD-04 for every rotation and both axes (one op, `mirrored` toggled, rotation per the table), the "Mirror a node vertically", "Mirror a rotated node" and "Undo a vertical mirror" scenarios, and an unchanged result for `r = 0` against the old behaviour

## 3. Capability rules, scene projection and model evidence (core)

- [ ] 3.1 Implement `src/core/edit/capabilities/compound-fields.ts` (D4: implied position covered by `resize`, implied rotation covered by `mirror`) and use it in `validator.ts` before `FIELD_ACTIONS`; verify `compound-fields.test.ts` titled NOD-04a, MOD-11: a move-locked node resizes with a corner fixed, a position change larger than the size change implies is rejected with the move reason, a mirror of an odd-turn rotate-locked node is accepted, a toggle with any other rotation change needs `rotate`, and undo of each is judged the same way
- [ ] 3.2 Add `GeometryScene.project(id, change)` in `src/core/space/scene/geometry-scene.ts` (D8) using `buildNodeEntry` without index writes; verify a test in `geometry-scene.test.ts` titled NOD-04a, NOD-08 that the projected entry equals the entry the scene builds after committing the same update, and that `stats().indexWrites` is unchanged by `project`
- [ ] 3.3 Add port-anchor evidence (D6): `image-symbol-geometry.test.ts` titled NOD-04a ("Port anchors follow the new size": edge-midpoint and fractional placements stay on their edge) and `card-geometry.test.ts` titled NOD-03 documenting the clamp of port rows to the bottom edge; verify both pass
- [ ] 3.4 Add model-level tests in `src/core/edit/commands/resize-model.test.ts` titled NOD-04a, INT-08, TXN-01, MOD-11 through `createGraphModel`: one resize is one history entry, one undo restores size and position, an incident connection's endpoint follows the moved anchor in the scene, a denied resize capability and read-only mode reject with the size unchanged, and the "Load keeps sizes outside new limits" scenario
- [ ] 3.5 Export `ResizeFixed`, `SizeLimits`, `SizeLimitPolicy`, `ResolvedSizeLimits` and `anchoredPosition` from `src/core/index.ts`; verify `src/core/index.test.ts` lists them, `npx vitest run src/architecture.test.ts` passes, and `npm run build` emits their declarations

## 4. Handles and resize preview (view/render)

- [ ] 4.1 Implement `src/view/render/paint/previews/resize-handles.ts` (D7: eight handle points from the size box through `toWorld` to viewport space, 8 CSS px squares, midpoints omitted on sides shorter than three handle sizes on screen, geometric pick nearest centre first); verify `resize-handles.test.ts` titled INT-10, GEO-05 for an unrotated, a quarter-turned and a mirrored node, constant screen size at zoom 0.25 and 4, and a press between two handles picking none
- [ ] 4.2 Add the `resize` `ToolPreview` kind, move the ghost-connection helper from `move-preview-painter.ts` into `ghost-entries.ts`, implement `resize-preview-painter.ts` over `scene.project`, and hide the node and its incident connections in `preview-host.ts`; verify existing move-preview tests pass unchanged and a `preview-host.test.ts` case titled INT-08, INT-10 that the hidden set (and so the scene layer) changes only at resize start and end, not per pointer move
- [ ] 4.3 Implement `resize-handles-painter.ts` (interaction-layer order 20) over a source closure (selected node, availability, current preview); verify `src/view/render/paint/previews/resize-handles-painter.browser.test.ts` titled INT-10 in Chrome: handles are painted for one selected resizable node, at the preview frame during a resize, and not during a move preview

## 5. Resize tool (view/interact, headless)

- [ ] 5.1 Extend `capabilityProbe` in `tool-context.ts` with `resize` (trial one unit wider, or narrower at the maximum; `out-of-range` when `min = max`), `rotate` and `mirror`, and add `sizeLimits(id)` to `ToolContext` from the model's optional `sizeLimits` (default limits otherwise); verify `tool-context.test.ts` titled MOD-11, NOD-04a for a denied, a fixed-size and an allowed node
- [ ] 5.2 Implement `src/view/interact/tools/resize-math.ts` (local delta to size per handle, Shift aspect for corner and edge handles, clamping with the ratio, grid snapping of the moving edge with Alt suppression, anchored position) (D7); verify `resize-math.test.ts` titled INT-10, NOD-04a with the "Corner drag keeps the opposite corner", "Edge handle changes one dimension", "Shift keeps the aspect ratio", "Handles follow rotation" and "Clamped while dragging" scenarios as pure inputs
- [ ] 5.3 Implement `resize-tool.ts` (states idle, pressed, dragging; accepts only a handle press on the single selected node with resize available; one `resizeNode` commit on release; nothing below the threshold; every cancel reason and `entities-removed` discard the preview; resize cursors from the handle's screen direction) and add the four resize cursors to `CursorKind`; verify `resize-tool.test.ts` titled INT-05, INT-05a, INT-08, INT-10: idle → pressed → dragging → idle with exactly one commit over 100 moves, the "Cancel a resize", "No handles for several nodes" and "No handles without the capability" scenarios
- [ ] 5.4 Insert the resize tool before `connect` in `default-tools.ts` (D7, Open Questions 3); verify `tool-router.test.ts` titled INT-10, INT-04 that a press on a handle overlapping a port resizes while a press on the same port outside the handle square connects

## 6. Rotate and mirror commands (view/interact, headless)

- [ ] 6.1 Implement `src/view/interact/commands/transform-commands.ts` (`nodes.rotate` with `{ turns }`, `nodes.mirror` with `{ axis }`, filtering nodes the probe refuses, unavailable with the first capability reason when none remain) and register them from `builtin-commands.ts`; verify tests in `src/view/interact/commands/commands.test.ts` titled INT-07, MOD-11, NOD-04: command and API give identical patches on equal models, the "Locked node in a rotated selection" scenario, and an empty selection is unavailable
- [ ] 6.2 Add `R`, `Shift+R`, `M`, `Shift+M` to `DEFAULT_KEYMAP`; verify `keymap.test.ts` titled UX-01 that each chord resolves to its command and arguments on both platforms, `Shift+R` does not resolve to the clockwise binding, and `Mod+R` resolves to nothing (the browser reload stays available)

## 7. Auto-pan (view/interact, headless)

- [ ] 7.1 Implement `src/view/interact/tools/auto-pan.ts` (`autoPanVelocity` and the arming rule, D10) and add `autoPan: { edgePx, maxSpeedPxPerSecond } | false` to `ToolOptions` with the default `{ edgePx: 32, maxSpeedPxPerSecond: 600 }` (Open Questions 5); verify `auto-pan.test.ts` titled INT-09: zero outside the band, linear inside it, capped outside the view ("Bounded speed"), diagonal in a corner, no pan for a gesture that starts in the band until it is armed, and `false` disables
- [ ] 7.2 Add optional `autoPans(state)` to `Tool` and `autoPanning()` to the router; return true from select-move, connect and resize `dragging` and marquee `dragging: true`; verify `tool-router.test.ts` titled INT-09 that only those states report auto-panning and that pan, empty-pan and every idle state do not ("Pan gestures do not auto-pan")
- [ ] 7.3 Implement `src/view/interact/input/auto-pan-driver.ts` over an injected `FrameClock` (D10: request while needed, `dt` capped at 50 ms, pan then replay the last pointer-move with the world point recomputed, synchronous cancel when the router goes idle or the velocity is zero); verify `auto-pan-driver.test.ts` titled INT-09, INT-08, PERF-02d with a fake clock: "Node drag near the edge" (the preview offset follows the pan), "Stop on release" (no pending request after pointer-up), "Cancel during auto-pan", and "Auto-panned move is one history entry" over 120 ticks

## 8. DOM wiring (browser)

- [ ] 8.1 Move `modifiers`, `pointerTypeOf` and the pointer-event-to-input builder from `src/view/interact/input/dom-input.ts` into `pointer-input.ts` as a pure refactor; verify all `dom-input` browser tests pass unchanged and `dom-input.ts` is under 300 lines
- [ ] 8.2 Wire the auto-pan driver into `dom-input.ts` (update after each routed input, stop in every cancel path and on dispose) with a `requestAnimationFrame` clock created at mount (REA-06); verify `src/view/autopan.browser.test.ts` titled INT-09, PERF-02d, LIFE-01 in Chrome: dragging a node into the right edge band pans and the node follows, release stops panning in the same frame, a spied `requestAnimationFrame` sees no call for 5 s afterwards ("No frames after stopping"), Escape during a marquee stops panning, and dispose mid-pan leaves no pending frame
- [ ] 8.3 Wire the resize tool's context, the handles painter and its invalidation (selection change, node change) into `src/view/view-editing.ts` (or a new `view-gestures.ts` added to the mount row of `src/architecture.test.ts` if `view-editing.ts` would pass 300 lines); verify `src/view/resize.browser.test.ts` titled INT-10, NOD-04a, INT-08 in Chrome: the corner-drag scenario end to end with one history entry, a quarter-turned node widens on screen to the right from its screen-right handle, and no painter or listener remains after dispose
- [ ] 8.4 Export the new view types (`autoPan` options, `nodes.rotate`/`nodes.mirror` IDs) from `src/view/index.ts` and the building blocks (resize tool, resize math, auto-pan driver, handle geometry and painter) from `src/view/advanced.ts`; verify `src/view/entry-points.test.ts` (PKG-01) and that the SSR import test still touches no `window` or `requestAnimationFrame` at import (REA-06, PKG-05)

## 9. Example

- [ ] 9.1 In `examples/plain-js`, move the window-level "move the pump" shortcut from M to P (and the hint in `index.html`), and declare `sizeLimits` on one demo node type; verify `npm run demo:build` succeeds and a headless Chrome run of the demo resizes a node, rotates and mirrors with R, Shift+R, M and Shift+M (P still moves the pump, M no longer does), auto-pans a drag at the edge, and logs no console errors

## 10. Gates

- [ ] 10.1 Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:browser`, `npm run build` and `npm run bench:size` (core ≤ 75 KiB, view ≤ 150 KiB gzip); all pass, `src/architecture.test.ts` included, and every new or changed file stays under 300 lines (`wc -l`)

## 11. Documentation (separate commit)

- [ ] 11.1 Update `docs/guide-using-the-model.md` (`resizeNode` and `fixed`, size limits and the host hook, clamp-in-gesture and reject-at-API, limits not checked on patches, undo and load, the compound capability rule, `mirrorNodes.axis`) and `docs/geometry.md` (anchored-resize formula, the D5 mirror table in screen axes, anchors under resize per preset, minimum card height); verify by grepping for `resizeNode`, `sizeLimits`, `out-of-range` and `axis`
- [ ] 11.2 Update `docs/interaction.md` (resize gesture row and tool table, router order, handle precedence over ports, keymap table with R, Shift+R, M, Shift+M, an auto-pan section with arming, speed and stop rules) and `docs/guide-view.md` (`ToolOptions.autoPan`, resize cursors, the handles painter); verify by grepping for `nodes.rotate`, `nodes.mirror` and `autoPan`
- [ ] 11.3 Update `docs/architecture.md` with `core/data/model/node-frame.ts` (shared by planners and the validator because core/edit cannot import core/space) and the auto-pan driver running beside, not inside, the frame scheduler, with a Mermaid diagram; verify the diagram renders in a Markdown preview and names no upward import

## Workflow follow-up

- Commit each self-contained group with its tests (requirement IDs in messages); 8.1 is its own refactor commit; commit group 11 separately.
- Archive the change after review with `/opsx:archive add-resize-rotate-and-autopan`.
