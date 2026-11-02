# Design

## Context

- Routing: `RouteRegistry.get(kind)` picks a `ConnectionRouter` per connection kind
  (`core/space/routing/route-registry.ts`); `RouteInput` is `{ from, to }` and its header
  already reserves room for stored constraints. The orthogonal router builds candidate
  shapes `[p0, e0, …, e1, p1]` from escape points and chooses one
  (`orthogonal-candidates.ts`, `orthogonal-check.ts`), routing in a canonical end order
  and reversing the result when needed.
- Scene: `buildConnectionEntry` (`scene/scene-entries.ts`) holds the full record when it
  routes, and a connection `update` op already rebuilds that connection
  (`scene-update.ts`). Move previews re-route ghosts through `ghost-entries.ts`.
- Model: `ConnectionRecord` is `{ id, kind, from, to }`; patches update connection
  fields generically through `CONNECTION_FIELDS` (`data/patch/apply-ops.ts`); invert and
  diff are generic. Snapshots reject unknown keys (`parse-connection.ts`), and
  `FORMAT_VERSION` is 1 with host migrations for older versions.
- Copy: fragment remap spreads `connectionToRecord`, so a new field is copied, but world
  coordinates are not shifted by the paste offset today.
- Tools: hand-rolled state machines with precedence pan, resize, connect, select-move,
  empty-pan, marquee (`default-tools.ts`). Picking returns
  `{ kind: "connection", connectionId }` with no segment. There is no double-click input.
- Commands: core `Command` union planned in `edit/commands/plan.ts`; view commands in
  `view/interact/commands/builtin-commands.ts` (`modelEdit`).

## Goals / Non-Goals

**Goals:**
- Durable, validated route constraints that core handles without knowing route kinds.
- A per-kind route editor contract, with the orthogonal segment editor as its first
  implementation.
- Deterministic pin routing; one history entry per edit; correct copy, paste and moves.

**Non-Goals:**
- Waypoints, click-to-route, editors for Bezier or straight kinds, segment snapping,
  obstacle avoidance, endpoint reconnection by dragging ends.

## Decisions

### D1. A shared constraint vocabulary in core

`ConnectionRecord` gains `route?: readonly RouteConstraint[]`, with

```ts
type RouteConstraint = {
  readonly kind: "segment";
  readonly orientation: "horizontal" | "vertical";
  /** World y of a horizontal segment, world x of a vertical one. */
  readonly at: number;
};
```

ordered from `from` to `to`. The list is a closed union in core, not opaque data per
route kind, because core must validate it, shift it on paste and on whole moves, and diff
it, and core has no route registry. Pluggability sits in the editors and routers that
produce and read it; a later `{ kind: "waypoint", at: Point }` extends the union.
An empty list is stored as absent. Validation: array, known kind and orientation, finite
`at`.

Alternative: opaque JSON per route kind with per-kind validate and translate hooks.
Rejected because core would then need the view's registries to load, paste or move.

### D2. Snapshot field, format stays 1

`ConnectionSnapshot` gains `route?` with the same shape, omitted when empty
(`connectionToSnapshot`), accepted by `parse-connection.ts`. The field is additive and
the library is pre-release with no stored documents to migrate, so the format version
stays 1. The reserved top-level `routes` section stays reserved and empty.

### D3. Router input and output

`RouteInput` gains `constraints: readonly RouteConstraint[]` (empty when none).
`ConnectionRoute` gains `realized?: readonly number[]`: for each constraint, the index of
the path segment (between consecutive vertices of `polylineVertices(path)`) that lies
on it, or -1 when the router ignored it. Bezier and straight routers ignore constraints
and omit `realized`. The scene passes `record.route ?? []`; ghost routing does the same.

### D4. Pin routing (orthogonal router)

With no pins the router is unchanged. With pins it does not use the candidate families;
it builds one path deterministically:

1. Escape points `e0`, `e1` and directions `d0`, `d1` as today; the ends are put in the
   canonical order and the pin list is reversed with them, so the result does not depend
   on end order.
2. The path is `p0, e0`, then the pins in order, then `e1, p1`. The stub `p0→e0` is
   fixed; the segment after it may continue along `d0` or turn, never reverse, and the
   segment before `e1` must arrive along `-d1`.
3. Walk from `e0`. To reach a vertical pin at `x = a` from the current point `c`, the
   next segment is horizontal to `(a, c.y)`; for a horizontal pin it is vertical to
   `(c.x, b)`. When that move is along the current direction but backwards, or the
   previous segment already has that orientation (two pins of the same orientation in a
   row), insert a free perpendicular segment first. Its coordinate is the midpoint
   between the current coordinate and the next fixed coordinate on that axis (the next
   pin of the other orientation, or `e1`); when they are equal, it is offset by the
   clearance in the direction of `d0` or away from the previous segment.
4. From the last pin, reach `e1` so that the final segment enters along `-d1`, with the
   same insertion rule, then append `p1`.
5. Merge collinear points, compute `realized` by matching each pin to the segment on its
   line in walk order, and build `polylinePath(points, cornerRadius)`.

Outcome: `complete`; `clearOf` is `endpoint-nodes` when the `orthogonal-check` body test
passes and `nothing` otherwise. A pinned route that crosses its own nodes is the user's
choice and is drawn as such.

The module is `core/space/routing/orthogonal-pins.ts`, tested with exact vertex lists.

### D5. Route editor contract (view)

```ts
interface RouteEditor {
  /** Handles on a connection entry, in world space; for painting and hit testing. */
  handles(entry: ConnectionEntry): readonly RouteHandle[];
  /** Handle under a world point within `tolerance` world units, if any. */
  hit(entry: ConnectionEntry, world: Point<"world">, tolerance: number): RouteHandle | undefined;
  /** Constraints while a handle is dragged from `start` to `world`. */
  drag(entry: ConnectionEntry, handle: RouteHandle, start: Point<"world">, world: Point<"world">): readonly RouteConstraint[];
  /** Constraints after a double-click on a handle; `undefined` does nothing. */
  activate(entry: ConnectionEntry, handle: RouteHandle): readonly RouteConstraint[] | undefined;
  cursor(handle: RouteHandle): "ew-resize" | "ns-resize" | "move";
}
interface RouteHandle { readonly id: string; readonly at: Point<"world">; readonly pinned: boolean }
```

A `RouteEditorRegistry` (`register(kind, editor)`, `replace`, `get`, `onChange`) is a
mount option `routeEditors`, created empty by default, separate from the route registry.
The demo and docs register `createOrthogonalSegmentEditor()` next to the
orthogonal router for the same kind.

### D6. Orthogonal segment editor

- Handles: one per inner segment of the routed path (segment indices 1 to n-2), at the
  segment midpoint; `pinned` when `realized` contains that index.
- Drag of segment `i` with orientation `o`: the new coordinate is the start coordinate
  plus the pointer delta on the perpendicular axis. If `i` is realized by pin `k`,
  replace pin `k`; otherwise insert a new pin at the position that keeps walk order
  (after the last pin realized by a segment before `i`). Other pins are kept.
- Double-click on a pinned handle removes its pin; on a free handle does nothing.
- Cursor: `ew-resize` for vertical segments, `ns-resize` for horizontal ones.

Pure functions in `view/interact/route-edit/orthogonal-segment-editor.ts`; the geometry
helpers (segment of a path, insertion index) are tested headlessly.

### D7. Route-edit tool

A new tool before `selectMove` in `default-tools.ts`. It accepts a primary press when the
top connection hit is selected, its kind has an editor, and `editor.hit` finds a handle
within the pick tolerance. States: `idle`, `pressed` (handle, start, time), `dragging`.
Past the drag threshold it emits `preview { kind: "route", connection, route }` each
move and a `setRoute` commit on release (one entry); Escape or cancel clears the
preview. A release without a drag records the press; a second press on the same handle
within 500 ms and the drag threshold distance is a double-click and commits
`editor.activate` when it returns constraints. Both values join `ToolOptions`
(`doubleClickMs`). Hover over a handle sets the editor's cursor through the existing
cursor effect.

### D8. Preview and painting

`ToolPreview` gains `{ kind: "route", connection, route }`. The preview host hides the
real entry and paints a ghost routed with the tentative constraints (reusing
`ghost-entries.ts`), like the move preview. Grips are painted on the scene layer next to
`drawConnectionSelection` for selected connections whose kind has an editor: a small
square at each handle, filled when pinned, outlined when free, sized in screen pixels.

### D9. Commands

Core: `setRoute { connection, route }` (one connection update op of `route`, label
"Edit route") and `resetRoutes { connections }` (one update per connection that has
constraints; rejected as empty when none). View: `route.reset` via `modelEdit`, available
when a selected connection has constraints; no default key binding.

### D10. Whole moves and paste

`planMoveNodes` adds, for each connection whose two endpoint nodes are both moved, an
update shifting its pins by the move delta (x for vertical pins, y for horizontal).
Fragment remap and paste placement shift pins by the placement offset the same way. A
small `translateConstraints(route, dx, dy)` in `core/data` serves both.

## Risks / Trade-offs

- Straight and L-shaped orthogonal wires have no inner segment, so they cannot be edited
  until waypoints or end-segment dragging exist → stated in the guide; the user chose
  inner segments only.
- Pins in absolute coordinates can produce long detours after big node moves → kept on
  purpose ("keep the pin"); double-click or reset frees them.
- Pin routing ignores bodies of unrelated nodes, like automatic routing.
- Synthesized double-click may differ from the platform's double-click interval → the
  interval is an option.
- Moving both ends shifts pins, a choice beyond the text from the persistent route constraints rule; without it a moved group
  would leave its wires' middles behind.
