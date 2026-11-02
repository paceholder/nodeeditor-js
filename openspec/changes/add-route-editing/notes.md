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
  end order, so ROU-07 holds.
- D4 pins on a stub's own line (same orientation and coordinate as the first or last
  stub) at the start or end of the list are realized by that stub and removed from the
  walk; when nothing else remains the automatic route is used and `realized` is computed
  on it. This keeps "a pin at the stub line" from forcing detours.
- A pinned route whose pins make a zero-length segment (for example two vertical pins at
  the same x around a horizontal pin) reports -1 for the collapsed pin.
