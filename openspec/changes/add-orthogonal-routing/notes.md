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
