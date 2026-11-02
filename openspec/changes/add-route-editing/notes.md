# Notes

## Log

- 1.1 Constraint data: `RouteConstraint`, `ConnectionRecord.route?`, shape check in
  `validateConnectionRecord` (exported helper `isRouteShape`), `route` in
  `CONNECTION_FIELDS`, `normalizeRoute` and `translateConstraints` in
  `core/data/model/route-constraints.ts`. Tests: `route-constraints.test.ts`.
- 2.1 Snapshot: `ConnectionSnapshot.route?`, parsed in `parse-connection.ts` (error path
  `connections[i].route[j]`, entity = connection id), omitted when empty, `route` in the
  diff keys. Format version stays 1.
- 3.1 Commands: `setRoute`, `resetRoutes` in `edit/commands/route-commands.ts`.
- 3.2 `planMoveNodes` shifts pins of connections whose two nodes both move; fragment
  remap shifts copied pins by the placement delta.
- 4.1 `RouteInput.constraints` (required), `ConnectionRoute.realized?`,
  `ConnectionEntry.realized?`; the scene and the ghost entries pass `record.route ?? []`.
- 4.2 `routing/orthogonal-pins.ts`, used from `orthogonal-router.ts`.

- 5.1 Contract and registry in `view/render/registries/route-editor-registry.ts` (render
  layer, so the scene layer can paint grips); `routeEditors` mount option and
  `view.routeEditors`; `ToolContext.routeEditors`. `polylineVertices` is now exported from
  `src/core/index.ts` (it was internal).
- 5.2 `createOrthogonalSegmentEditor()` in `view/interact/route-edit/`. Handle ids are
  `v:<i>` / `h:<i>` (orientation, segment index in `polylineVertices(path)`).
- 5.3 `createRouteEditTool()` in `tools/route-edit-tool.ts`, placed after `connect` and
  before `selectMove`; `doubleClickMs` (default 500) in `ToolOptions`.
- 5.4 `route` preview (`route-preview-painter.ts`, `ghostWithRoute`), grips
  (`render/paint/route-grips.ts`, drawn by the scene layer for selected connections whose
  kind has an editor), hover cursors (`ew-resize`, `ns-resize` added to `CursorKind`),
  `route.reset` view command.
- 6.1 Demo registers the editor for `delayed` and `default` (`examples/plain-js/routes.ts`);
  docs in guide-view, geometry, format, interaction.
- 6.2 Gates, on battery power (`pmset`: Battery Power, 64%): lint, typecheck, `npm test`
  (130 files, 800 tests), `npm run test:browser` (39 files, 195 tests), `npm run build`,
  `npm run bench:browser` default and `BENCH_ROUTES=orthogonal` (6 files, 10 tests passed
  each; numbers not recorded, CPU throttled), `npm run bench:size`: core 36.2 KiB gzip
  (budget 75), view 46.1 KiB (budget 150), advanced 27.4, react 46.1.

## Deviations / open points

- New rejection code `nothing-to-do` (used by `resetRoutes` when no listed connection has
  constraints). D9 says "rejected as empty" without naming a code.
- `ConnectionEntry` gained `realized?` (not in D3) because the segment editor reads it from
  the entry (D5, D6).
- D10 move shifting: when both endpoint nodes of a connection move by different offsets in
  one `moveNodes`, the pins shift by the mean of the two offsets (equal offsets, the
  whole-group case, give exactly that offset). A node whose position does not change
  counts as not moved. The move ghost (`ghost-entries.ts`) applies the same shift so the
  preview matches the commit.
- D4 free-segment offset when the midpoint equals the start coordinate: the text says "in
  the direction of d0 or away from the previous segment", which is ambiguous for a free
  segment between two pins. Implemented: next to a source stub the free line takes the
  stub's clearance (no offset needed); next to the target stub it is offset by the
  clearance outward along the target escape direction; elsewhere it is offset by the
  clearance toward the positive axis direction. All are deterministic in the canonical
  end order, so the deterministic and stable routing rule holds.
- D4 pins on a stub's own line (same orientation and coordinate as the first or last
  stub) at the start or end of the list are realized by that stub and removed from the
  walk; when nothing else remains the automatic route is used and `realized` is computed
  on it. This keeps "a pin at the stub line" from forcing detours.
- A pinned route whose pins make a zero-length segment (for example two vertical pins at
  the same x around a horizontal pin) reports -1 for the collapsed pin.
- The route-edit tool keeps the last click in a closure (`createRouteEditTool()`, one per
  `defaultToolSlots()` call, so per view) because the router starts every gesture from the
  tool's idle state; a state-only double-click memory is impossible without keeping the
  gesture alive. `routeEditTool` is therefore a factory, not a constant like the others.
- The double-click is committed on the second release, not the second press.
- Handles hit-test the whole segment (within the pick tolerance), not only the grip square;
  the grip at the midpoint is the visual cue.
- The route-edit tool needs the topmost node-or-connection hit to be the selected
  connection; a node drawn over a wire's segment wins, as for any press.
- Grips are drawn by the scene layer (under nodes); the route preview draws them on the
  interaction layer while the drag runs.
- Dragging a free segment back to its start still pins it (a new pin at the same
  coordinate); only an unchanged constraint list commits nothing.
- The tool test and editor test use the S-shaped wire, which has one inner segment (stubs
  are the first and last segments); "L-shaped" is covered by a straight wire (no inner
  segment) since the harness nodes only have left/right ports.
- Hover cursor does a second `pick` per mouse move, only while something is selected.
- Demo: no button for `route.reset` (no default key either); it is reachable through
  `view.commands.run("route.reset")`. Grips were not checked by eye; `demo:build` passes.
- The first browser bench after this change was not compared against a baseline; the
  machine was on battery.
