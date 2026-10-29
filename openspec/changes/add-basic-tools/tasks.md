# Tasks

## 1. Tool runtime

- [ ] 1.1 Create `src/view/interact/tools/tool-types.ts` and `thresholds.ts` with the D2 contract (no DOM types); verify `npm run typecheck` and that a grep for `HTMLElement|PointerEvent|window` in `src/view/interact/tools/` finds nothing
- [ ] 1.2 Implement `tool-router.ts` (precedence, single active gesture, foreign pointer IDs ignored, cancel routing); verify `tool-router.test.ts` named for gesture lifecycle and tools as state machines shows exactly one active tool, a return to idle after commit or cancel, and that right-button presses are not claimed (the context-menu scenario of connection gestures)
- [ ] 1.3 Build a headless test harness (`test-support/tool-harness.ts`) that drives tools with `ToolInput` sequences against a real headless model and `GeometryScene`; verify it is used by at least one test in each later group

## 2. Selection

- [ ] 2.1 Implement `src/view/interact/selection/selection-model.ts` (ordered keys, primary, events, drop on removal); verify `selection-model.test.ts` named for the selection rule, the deterministic ordering rule and the independent views of one model rule covers replace, add, toggle, clear, deterministic order, independence of two views, and removal of deleted entities
- [ ] 2.2 Implement click selection inside `select-move-tool.ts`; verify `select-move-tool.test.ts` named for the selection rule and the gesture lifecycle and cancellation rule shows a press-release below threshold selects without committing a move and that a node and a connection can be selected together with Shift
- [ ] 2.3 Implement `marquee-tool.ts` and `render/paint/previews/marquee-painter.ts`; verify `marquee-tool.test.ts` named for the selection rule and the usable shipped controls rule shows left-to-right containment selects only fully covered nodes, right-to-left intersection also selects partially covered ones, and that the two modes paint with different stroke patterns

## 3. Navigation

- [ ] 3.1 Implement `wheel-zoom.ts` and `pan-tool.ts`; verify `navigation.test.ts` named for the viewport navigation rule and the finite ranges and degenerate inputs rule shows the world point under the cursor stays fixed after zoom, zoom clamps at the limits with a finite invertible transform, and pan changes only the viewport
- [ ] 3.2 Implement the `view.fitAll`, `view.fitSelection`, `view.resetView`, and `view.reveal` commands; verify `view-commands.test.ts` named for the viewport navigation rule covers fit on an empty graph as a no-op and reveal of an off-screen node making it fully visible

## 4. Move tool

- [ ] 4.1 Implement multi-node move with grid snap and the Alt suppression modifier in `select-move-tool.ts`; verify `select-move-tool.test.ts` named for the group movement and snapping rule and the one committed edit per gesture rule shows three nodes dragged 40 units move by the same offset in one committed command across 200 move inputs, and that suppression disables snapping
- [ ] 4.2 Add capability-aware partitioning; verify tests named for the group movement and snapping rule and the capabilities and read-only mode rule show a mixed selection previews the locked node as not moving and commits only the permitted nodes
- [ ] 4.3 Implement `render/paint/previews/move-preview-painter.ts` and the scene-layer exclusion of moved nodes; verify with a browser test `move-preview.browser.test.ts` named for the Canvas2D stacked layers rule and the bounded dirty-driven work rule (spy painters) that pointer moves during a drag repaint only the interaction layer

## 5. Connect tool

- [ ] 5.1 Implement `connect-tool.ts` with candidate evaluation caching per revision; verify `connect-tool.test.ts` named for the connection gestures rule, the one committed edit per gesture rule and the one policy for all input routes rule shows a drag from a port released on a compatible port submits exactly one connect command, and that a release on empty canvas or an incompatible port submits nothing
- [ ] 5.2 Map policy outcomes to target states; verify tests named for the distinct target states rule show an occupied port with an unlimited limit is presented as compatible with an occupied mark, and a type mismatch is presented as incompatible with the policy's reason
- [ ] 5.3 Handle removal of the source port during a gesture; verify a test named for the gesture lifecycle and cancellation rule shows the gesture cancels on `entities-removed` and nothing is submitted
- [ ] 5.4 Implement `render/paint/previews/connect-preview-painter.ts` with per-state glyphs; verify `connect-preview.browser.test.ts` named for the usable shipped controls rule and the screen-space tolerances rule shows each state paints a distinct glyph and that the capture radius stays the same in CSS pixels at zoom 0.5, 1, 4 and DPR 1 and 2

## 6. Commands and keymap

- [ ] 6.1 Implement `command-registry.ts` and `builtin-commands.ts`; verify `commands.test.ts` named for the unified commands rule and the capabilities and read-only mode rule shows `edit.delete` reports unavailable with a capability reason for a locked-only selection, and that a shortcut and an API call produce identical patches on equal models
- [ ] 6.2 Implement `keymap.ts` with platform `Mod` detection injected; verify `keymap.test.ts` named for the keyboard editing shortcuts rule covers delete, undo/redo (both redo chords), select all, Escape, and nudge with arrows as one command per key press
- [ ] 6.3 Expose `ViewHandle.commands` and `ViewHandle.selection` from `mountView`; verify `npm run typecheck` and an API test named for the unified commands rule that runs `view.fitAll` and `history.undo` through `commands.run`

## 7. DOM input adapter

- [ ] 7.1 Implement `interact/input/dom-input.ts`, `interact/input/input-scope.ts`, and `interact/input/effect-runner.ts` attached during mount and removed on dispose; verify `dom-input.browser.test.ts` named for the gesture lifecycle and cancellation rule covers pointer capture, `lostpointercapture` cancel, `pointercancel`, window blur, hidden document, and dispose mid-gesture, each leaving the committed state unchanged
- [ ] 7.2 Verify scoping in `input-scope.browser.test.ts` named for the input scoping rule: Delete inside an overlay text field edits text without deleting nodes, Enter during IME composition fires no graph shortcut, two mounted editors only react to the focused one, and the wheel scrolls the page when zoom is at its limit
- [ ] 7.3 Verify coordinates in `pointer-coords.browser.test.ts` named for the rule that geometry stays correct under layout and display changes: drag-to-connect hits the intended port under page scroll, a nested offset container, fractional zoom, and DPR 2
- [ ] 7.4 Verify repeated mount/dispose in `tools-lifecycle.browser.test.ts` named for the per-instance disposal rule: after 30 cycles no listener fires on the old root elements and no gesture remains active

## 8. Integration

- [ ] 8.1 Add an end-to-end browser test `basic-editing.browser.test.ts` named for the local editor use case and the simple connection use case: mount a view with image-symbol and card nodes, pan, zoom, select with a marquee, move two nodes, connect two compatible ports, undo and redo, and verify the model's patches and history contain exactly one entry per gesture
- [ ] 8.2 Document the tools, gestures, default keymap, marquee convention, and wheel option in `docs/interaction.md`; verify every command ID in `builtin-commands.ts` appears in the document
- [ ] 8.3 Run `npm run typecheck && npm test && npm run lint` and the browser test project; verify all pass and each new file stays under 300 lines

## Workflow follow-up

- Archive the change after review with `/opsx:archive add-basic-tools`.
