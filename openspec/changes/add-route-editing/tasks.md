# Tasks

## 1. Constraint data (core/data)

- [x] 1.1 Add `RouteConstraint` and `ConnectionRecord.route?` (D1), the shape check in `validate-records.ts`, `route` in `CONNECTION_FIELDS`, value comparison in `equal.ts` if needed, and `translateConstraints(route, dx, dy)`; export the type from `src/core/index.ts`; verify `validate-records.test.ts` and a new `route-constraints.test.ts` titled ROU-03a, ROU-12: valid pins accepted, non-finite `at`, unknown kind or orientation rejected, an update op of `route` applies, inverts and redoes, an empty list is stored as absent, and translation shifts vertical pins by dx and horizontal pins by dy only

## 2. Snapshot (core/io)

- [x] 2.1 Add `route?` to `ConnectionSnapshot`, accept it in `parse-connection.ts`, map it in `connectionToRecord`/`connectionToSnapshot` (omitted when empty) and check that `diff.ts` emits a `route` update (D2); verify `load.test.ts`, `export.test.ts`, `diff.test.ts` and `document.test.ts` cases titled ROU-03a, SER-01: "Pinned segment survives reload" (save, load, equal constraints), "Invalid constraint rejected on load" names the connection, a snapshot without `route` loads unchanged, and the format version is still 1

## 3. Commands (core/edit, core/io/fragment)

- [x] 3.1 Add `setRoute` and `resetRoutes` to the `Command` union and planners (D9); verify `route-commands.test.ts` titled ROU-03c, ROU-03d, ROU-12, INT-08: `setRoute` yields one patch with one connection update of `route` only, `resetRoutes` clears two connections in one patch and is rejected when none has constraints, and undo restores the previous constraints
- [x] 3.2 Shift pins in `planMoveNodes` for connections whose both endpoint nodes move, and in fragment remap and paste placement (D10); verify `transform-nodes.test.ts` and the paste/duplicate tests titled ROU-03e, EDT-03, EDT-04: "Moving both ends" shifts the pin in the same patch, moving one endpoint keeps it ("Endpoint moves after a pin"), and "Duplicate keeps the shape" shifts the copy's pin by the duplicate offset

## 4. Routing (core/space)

- [x] 4.1 Add `constraints` to `RouteInput` and `realized?` to `ConnectionRoute`; pass `record.route ?? []` from `buildConnectionEntry` and from `ghost-entries.ts` (D3); verify `geometry-scene-routes.test.ts` titled ROU-03a, ROU-08 that a `route` update op rebuilds only that connection and that a Bezier kind ignores pins ("Route kind ignores constraints")
- [x] 4.2 Implement `routing/orthogonal-pins.ts` and use it from `orthogonal-router.ts` when pins exist (D4); verify `orthogonal-pins.test.ts` titled ROU-03c, ROU-07, ROU-01c with exact vertex lists: one vertical pin in an S, one horizontal pin in a U, two vertical pins in a row (free connecting segment at the midpoint), "Pin behind the target" (extra bends, last segment enters along the inward escape), a pin at the escape coordinate, `realized` indices for each case, swapped ends give the reversed vertices, every segment axis-aligned, and 1000 seeded random inputs with 1 to 3 pins are deterministic and NaN-free

## 5. View (view/render, view/interact, view/mount)

- [x] 5.1 Add the `RouteEditor` contract, `createRouteEditorRegistry` and the `routeEditors` mount option, exported from `nodeeditor-js/view` (D5); verify `route-editor-registry.test.ts` titled ROU-03b, REN-01 (register, duplicate rejected, replace notifies, unknown kind gives undefined) and `entry-points.test.ts` passes with the new names in one entry each
- [x] 5.2 Implement `createOrthogonalSegmentEditor()` (D6); verify `orthogonal-segment-editor.test.ts` titled ROU-03c, ROU-03d: handles only on inner segments with `pinned` from `realized`, dragging a free segment inserts a pin in walk order, dragging a pinned one replaces it, `activate` on a pinned handle removes only that pin and on a free handle returns undefined, cursors per orientation, and an L-shaped route has no handles
- [x] 5.3 Implement the route-edit tool before `selectMove` with drag, cancel and double-click (D7, `doubleClickMs` in `ToolOptions`); verify `route-edit-tool.test.ts` titled ROU-03b, ROU-03c, ROU-03d, INT-05, INT-08: a drag on a handle of a selected wire previews each move and commits one `setRoute`, Escape commits nothing, an unselected wire or a kind without an editor is not accepted ("Kind without an editor"), a press on the first segment is not accepted, two presses within `doubleClickMs` on a pinned handle commit the freed route, and two slow presses do not
- [x] 5.4 Add the `route` preview kind and painter, grips on selected editable wires and hover cursors (D8), and the `route.reset` view command (D9); verify `src/view/route-edit.browser.test.ts` titled ROU-03c, ROU-03d, ROU-01e in Chrome: grips are painted on a selected orthogonal wire, dragging the middle segment moves the painted segment and adds one history entry ("Move a middle segment"), undo restores it, a double-click frees it, `route.reset` clears two selected wires and is unavailable without pins, and "Editor replaced" uses a host editor

## 6. Docs, demo and gates

- [ ] 6.1 Register the segment editor for the orthogonal kind in `examples/plain-js`; update `docs/guide-view.md` (route editors, segment drag, reset, limits), `docs/geometry.md` (pin routing) and `docs/format.md` (`route` field); verify `npm run demo` shows grips on a selected orthogonal wire and the docs build-free check (`npm run lint`) passes
- [ ] 6.2 Run the gates: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:browser`, `npm run bench:browser` (quick, both route modes), `npm run bench:size`, `npm run build`; record results and sizes in `notes.md`

## Workflow follow-up

- The user tries segment dragging in the demo before archiving.
- Archive with the routing spec sync.
