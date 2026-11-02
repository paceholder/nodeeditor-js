# Proposal

## Why

Orthogonal wires now take an automatic shape, but users cannot adjust them. The persistent route constraints rule
requires manual route constraints that persist and survive endpoint movement, and the rule that route-only edits keep topology
requires such edits to change nothing but presentation. The user chose "auto shape first,
editing later"; this is the editing step. The user also asked that dragging and other
pointer mechanics on a route be pluggable per route kind, with only the orthogonal
segment behavior built now (2026-11-02).

## What Changes

- **Route constraints on connections.** A connection record gains an optional, ordered
  list of route constraints in world coordinates, stored apart from the automatic
  vertices. The first constraint kind is a pinned segment: "the vertical segment at
  x = 120" or "the horizontal segment at y = 40". The vocabulary lives in core so that
  validation, snapshots, undo, copy and paste handle it without knowing route kinds;
  waypoints (the rest of persistent route constraints, and click-to-route) are a later kind on the same
  list.
- **Routers read constraints.** `RouteInput` gains the connection's constraints. The
  orthogonal router routes through pinned segments in order and re-routes only the free
  parts; the result says which path segment realizes each constraint. Other built-in
  routers ignore constraints, which stay stored.
- **Pluggable route editors.** A new view registration maps a connection kind to a route
  editor: the handles it offers, its hit test, the constraints a drag produces, and what
  a double-click does. One generic route-edit tool delegates to the editor of the pressed
  connection's kind. Kinds without an editor behave as today.
- **Orthogonal segment editor.** On a selected orthogonal wire, every inner segment (not
  the first or last, which leave and enter the ports) shows a grip and can be dragged
  sideways. Dragging pins it; a pinned segment keeps its place when nodes move, and the
  router adds bends to reach it if needed. Double-clicking a pinned segment frees it.
- **Reset route command.** A view command clears all constraints of the selected
  connections, usable from a host context menu or keyboard binding.
- **Constraints follow copies and whole moves.** Paste and duplicate shift pins by the
  placement offset; moving both endpoint nodes of a connection in one move shifts its
  pins by the same offset.
- **Snapshot field.** Connection snapshots carry the constraints as an optional `route`
  list, omitted when empty. The document format stays version 1 (additive field).

Requirements: the persistent route constraints rule (segment part), the rule that route-only edits keep topology, the route outcomes rule, the deterministic and stable routing rule, the routes in previews rule, the gesture lifecycle and cancellation rule and the one committed edit per gesture rule,
the duplicate and paste fragments rule, the explicit external-reference handling on paste rule, the versioned local document format rule and the independent extension contracts rule. New: the routing requirements.

Out of scope: free waypoints and click-to-route, route editors for Bezier or
straight kinds, dragging the first or last segment, segment snapping, obstacle
avoidance, and changing a connection's endpoints by dragging its ends.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `routing`: adds the routing requirements (constraint data, route editor contract, orthogonal
  segment drag, freeing and reset, constraints on copy and whole moves). Persistent route constraints itself is
  unchanged; waypoints remain open under it.

## Impact

- Core: `ConnectionRecord`, record validation, patch field list, snapshot types, parse
  and export, fragment remap and paste offset, move planning, new commands (`setRoute`,
  `resetRoutes`), `RouteInput`/`ConnectionRoute`, orthogonal router and a pin-routing
  module, scene entry build.
- View: route-editor registry and mount option, route-edit tool before select-move,
  double-press detection, a route preview kind and painter, grips on selected wires,
  hover cursors, `route.reset` command, ghost routes passing constraints.
- Docs: `docs/guide-view.md`, `docs/geometry.md`, `docs/format.md`, and the demo
  (orthogonal kind gets the segment editor).
- Bundle size: view and core grow; budgets are checked by `bench:size`.
