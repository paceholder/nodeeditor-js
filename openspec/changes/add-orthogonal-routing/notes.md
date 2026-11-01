# Implementation notes

Deviations from design.md, clarifications made while implementing, observations, gate
results and size. The size baseline is `d4c2427` (the proposal commit, the same code as
the end of `add-connection-chooser`).

## Deviations and clarifications

- **`splitPath(polyline, count)` treats `count` as an upper bound**: a polyline's pieces
  follow its corners (D2), so the count is not a free parameter; `pieceCount` of a
  polyline is the length of its default split. Lines and cubics are split as before.
- **Corner tangent length uses `|cross| / (1 + dot)`** for `tan(θ/2)`, so a 90-degree
  corner's tangent length is exactly its radius (`Math.tan(Math.PI / 4)` is not exactly
  1). Reversals, straight-through vertices and corners next to a zero-length segment get
  radius 0.
- **A cut on an interior zero-length segment** (two sharp corners at the same point) may
  lie on a vertex; the piece then repeats that point, which changes no distance or bound.
- **`buildPath` and `RouteMode` are removed with the preview change (task 4.3), not in
  task 2.1**: the scene (3.1) and the preview painters (4.3) still used them, and each
  commit must build and pass on its own. The registry and routers land first, the
  callers move over, then the old helper goes.
- **Final tie-break: the corners ordered by (y, x), compared in turn**, instead of "the
  smaller middle coordinate, then the smaller first corner (y, x)" (D4 step 5). It keeps
  the stated outcomes (above before below, left before right at equal heights) and,
  unlike "first corner", does not depend on which end is stored first. Lengths within a
  relative 1e-9 count as equal so float noise does not decide between equal detours.
- **Swapped ends are exact by construction**: the router orders the two ends
  canonically (position, escape direction, body), routes, and reverses the result when
  it swapped them, radii included. The candidate keys are order-independent anyway; this
  makes "the same vertices in reverse" bit-exact.
- **Validity also requires leaving along the source escape direction and entering
  along the reverse of the target's** (D4 step 4 lists only reversal and bodies). With
  the bodies exempt at their own end segments, a zero clearance or a stray candidate
  could otherwise leave a port backwards through its node.
- **"Same node" is detected by equal body rectangles**: `RouteEnd` carries no node ID.
  Two distinct nodes with identical boxes overlap completely and fall back anyway.
- **A perpendicular pair too close for an L** takes three bends with the jog at the
  midpoint between the escape points (all jog heights between them have equal length;
  the tie-break takes the highest).
- **`polylinePath` and the `Polyline` type are exported from core**, so a host router
  can build the same rounded geometry.
- **`RouteResult` is named `ConnectionRoute`** in core: `nodeeditor-js/view/advanced`
  already exports a `RouteResult` (the tool router's result), and the ESM package with typed entry points rule allows one
  import path per public name. `ConnectionRouter.route()` returns a `ConnectionRoute`.
- **The scene recomputes a kind in model order**: `connectionsOfKind` scans
  `reader.connections()`, not the scene's map, so the order of rebuilds is the model's.
  It runs only on registration changes.
- **Scene tests that need a resize register the node type with `resize: true`**: the
  fixture types have no capabilities, and the capability policy denies a resize.
