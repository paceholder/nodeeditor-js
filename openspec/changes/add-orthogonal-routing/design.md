# Design

## Context

See proposal.md for the motivation. These are the parts of today's code this change
builds on:

- **Path geometry.** `src/core/space/geometry/path-geometry.ts` (272 lines) defines
  `PathGeometry = line | cubic` in world space, with `pathPointAt`, `pathBounds` (exact),
  `nearestPoint`, `pathDistance`, `endTangents` and `isFinitePath`, each an exhaustive
  switch. Its header already says the union is "open for later members (for example a
  polyline for orthogonal routes)". Every member has `p0` and `p1`, and the connection
  painter reads them directly for the endpoint dots.
- **Index pieces.** `path-pieces.ts` splits a path into at most `MAX_PIECES = 12` pieces of
  about `PIECE_LENGTH = 800` world units (de Casteljau for cubics). The scene indexes each
  piece as `c:<id>#<i>` by its control box grown by the stroke margin, and picking
  measures `pathDistance` only on pieces whose box is within tolerance.
- **Route modes.** `connection-paths.ts` has `RouteMode = "straight" | "bezier"`,
  `straightPath`, `bezierPath` and `buildPath(mode, from, to)`. The public names already
  match the user's: the smooth mode is `"bezier"`, and `"straight"` exists. The
  `PathGeometry` kinds `line` and `cubic` are geometry terms, not route-mode names.
- **Scene.** `createGeometryScene(source, { routeMode?: (record) => RouteMode })` builds a
  `ConnectionEntry { path, paintedBounds, segments, segmentBounds }` per connection in
  `scene-entries.ts` from the two anchors (world position and outward normal). The
  default is Bezier for every connection. The view never passes `routeMode`
  (`platform/model-binding.ts`), so every view draws Bezier. A node change rebuilds only
  that node and its incident connections; a geometry registration change
  rebuilds nodes of that type.
- **Anchors.** Normals come from the node geometry in local space and are transformed to
  world space with the node transform, so they already follow quarter-turn rotation and
  mirroring. Card ports have axis normals; image-symbol ports may have any explicit
  normal (`port-layout.ts`), so a normal can be diagonal. `normalize(v, fallback)` already
  guards zero vectors.
- **Connection kinds.** `ConnectionRecord.kind` is `"default"` unless a policy sets
  another. Connection painters are registered per kind (`painters.connections`); the
  demo registers `default`, `direct` and `delayed`.
- **View drawing.** `render/primitives/trace-path.ts` is the single place that turns a
  `PathGeometry` into canvas commands; the connection painter, selection outline,
  overview and connect preview all use it. The overview (`overview-painter.ts`) strokes
  one canvas path per resolved style and turns a cubic shorter than 3 CSS px into a line.
- **Previews.** `ghost-entries.ts` re-routes the incident connections of moved or resized
  nodes with a hard-coded `buildPath("bezier", ...)`; `connect-preview-painter.ts` also
  hard-codes Bezier, with a free end whose normal points back at the source.
- **Records.** Connections store no route data. The snapshot format reserves a `routes`
  section (docs/format.md), unused.
- **Sizes and budgets.** core about 30.9 KiB and view about 41.8 KiB gzip against 75 and 150.
  F-LARGE scene build p95 264 ms (target 1 s), pick p95 0.17 ms (target 2 ms).
  `mount-view.ts` is 338 lines (accepted exception), `examples/plain-js/main.ts` 294.

## Goals / Non-Goals

**Goals:**

- One path representation for orthogonal routes that the later editing change can keep:
  stored user constraints will be inputs to the router, the polyline stays its output.
- Routing stays a pure, synchronous, constant-time-per-connection function of the two
  ends, so the existing incremental scene updates, previews and budgets hold.
- Painting, picking, bounds and culling use the same path, rounded corners included.
- Nothing changes for a host that registers no route.

**Non-Goals:**

- Obstacle avoidance, route editing, crossing styles, labels (see proposal, Out of scope).
- Asynchronous or worker routing.
- A visual marker for unroutable routes (Open Questions).

## Decisions

### D1. `PathGeometry` gains a `polyline` member

```ts
| {
    readonly kind: "polyline";
    readonly p0: Point<W>;
    /** Interior vertices (bends), in order from p0 to p1. */
    readonly via: readonly Point<W>[];
    readonly p1: Point<W>;
    /** Arc radius at each interior vertex, already fitted; omitted means all sharp. */
    readonly radii?: readonly number[];
  }
```

- `p0`/`p1` stay on every member, so endpoint readers (dots, arrowheads via
  `endTangents`) need no switch. A polyline with no `via` is a straight two-point wire.
- The polyline is general (any angles), not "orthogonal", so a later straight route with
  waypoints can reuse it. Orthogonality is a property of the router's output, tested
  there.
- **Rounded corners live in the geometry, as fitted radii.** The constructor
  `polylinePath(points, cornerRadius)` fits each corner's radius so the arc's tangent
  length is at most half of each adjacent segment (so neighbouring arcs never overlap and
  a split at a segment midpoint never cuts an arc). Storing the fitted values, not the
  requested one, means a piece of the path (D2) draws and picks exactly the same arcs as
  the whole path. Arcs follow `arcTo` semantics, so `tracePath` emits `moveTo`, then
  `arcTo` per rounded corner (`lineTo` per sharp one), then `lineTo(p1)`.
- New `geometry/polyline.ts` holds the polyline math, so `path-geometry.ts` stays under
  300 lines and only dispatches: bounds (the vertex box; it contains the rounded path
  because arcs cut inward, and it is exact for sharp corners), nearest point and distance
  (per straight part and per arc: distance to the centre minus radius when the angle
  lies within the arc, else the nearer arc end), `t` as the arc-length fraction, end
  tangents (first and last non-zero part; a fully degenerate path reports +x as today),
  and finiteness (points and radii).

Alternatives considered:

- **A separate `orthogonal` kind with axis-only segments.** Narrower than needed and
  useless for later straight waypoints.
- **Corner radius as a painter option only.** The painted wire would differ from the
  picked and culled one by up to 0.41 × radius at each corner, against the user's rule
  that picking and bounds use the same path. See Open Questions for the
  placement of the option.
- **Arcs as their own `PathGeometry` parts (a path of mixed segments).** More general but
  every consumer would loop over a second union; fitted radii on a polyline cover what
  the routers produce.

### D2. Index pieces of a polyline keep each corner whole

`splitPath` splits a polyline at the midpoints of its interior segments, so each piece
holds one corner (with its arc) and the half segments on either side; a single-segment
polyline is one piece. A segment longer than `PIECE_LENGTH` is additionally split at
equal steps, with split points moved outside any arc. When the count would exceed
`MAX_PIECES`, consecutive pieces are merged into evenly sized groups, by index. Pieces
are polylines carrying the fitted radii of their corners, so `pathDistance` on a piece is
exact. `controlBounds` of a polyline is its vertex box. Joint points are shared exactly,
and the first and last piece keep the path's endpoints (the same invariants the cubic
split has today).

Why: an orthogonal route has at most about seven segments, so one piece per corner keeps
the index boxes tight (an L-shaped wire's overall box is mostly empty) while the piece
count stays well under the cap for F-LARGE.

### D3. Routers and a route registry keyed by connection kind (core)

New folder `src/core/space/routing/` (inside the `core/space` layer row; no table change):

```ts
interface RouteEnd {
  readonly position: Point<"world">;
  readonly normal: Point<"world">;           // outward, may be zero or diagonal
  readonly body: Rect<"world"> | undefined;  // the end node's body box; none for a free end
}
interface RouteInput { readonly from: RouteEnd; readonly to: RouteEnd }
interface RouteOutcome {
  readonly status: "complete" | "provisional" | "unroutable";
  readonly clearOf: "nothing" | "endpoint-nodes";
}
interface RouteResult { readonly path: PathGeometry; readonly outcome: RouteOutcome }
interface ConnectionRouter { route(input: RouteInput): RouteResult }

createStraightRouter(): ConnectionRouter;
createBezierRouter(): ConnectionRouter;
createOrthogonalRouter(options?: { clearance?: number; cornerRadius?: number }): ConnectionRouter;

interface RouteRegistry {
  get(kind: string): ConnectionRouter;        // registered router or the default
  readonly defaultRouter: ConnectionRouter;
  has(kind: string): boolean;
  register(kind: string, router: ConnectionRouter): Result<void, Rejection>; // duplicate-type
  replace(kind: string, router: ConnectionRouter): void;
  onChange(handler: (kind: string) => void): () => void;
}
createRouteRegistry(options?: { default?: ConnectionRouter }): RouteRegistry; // default: Bezier
```

- **Per kind, like painters** (user decision): one kind orthogonal, another Bezier. No
  per-connection override. The registry's default is the "view default"; a host that
  wants every unregistered kind orthogonal passes `default: createOrthogonalRouter()`.
- **Factories, not mode strings.** A registry of mode strings would make core import the
  orthogonal router unconditionally. With factories, a host that never calls
  `createOrthogonalRouter` does not bundle it, and the router interface is the
  "routing" registration of the built-in route modes rule and the independent extension contracts rule. A host may register its own router object;
  documenting it as a supported extension point waits for the obstacle-avoidance change,
  which will settle the async contract.
- **Input is a struct with room to grow.** The editing change adds an optional
  `constraints` field to `RouteInput` (stored per connection); the obstacle
  change adds an obstacle query. Neither reshapes the output.
- **The outcome** is minimal: straight and Bezier report
  `{ complete, nothing }`; orthogonal reports `{ complete, endpoint-nodes }` or
  `{ unroutable, nothing }` (D6). `provisional` is in the union for async refinement but
  no built-in router returns it yet. `clearOf: "all-nodes"` is added by the obstacle
  change; until then no built-in route can claim to be obstacle-free.
- **Breaking.** `GeometrySceneOptions.routeMode` is replaced by `routes?: RouteRegistry`,
  and `buildPath`/`RouteMode` are removed (pre-release, no shims). `straightPath` and
  `bezierPath` stay as geometry helpers that the basic routers wrap.

The registry lives in core because the scene, which computes paths, is in core and must
stay headless. The view re-exports nothing from core; hosts import
`createRouteRegistry` and the router factories from `nodeeditor-js`.

### D4. The orthogonal router: a fixed candidate set, scored

Routing is a pure function of the two ends; no search grid, no state. Steps:

1. **Escape directions**. Each normal is snapped to the nearer axis, horizontal
   on a tie. A zero or non-finite normal uses the outward normal of the side of `body`
   nearest the anchor (ties in the order right, bottom, left, top), and without a body,
   or with the anchor at the body centre, the dominant axis toward the other end
   (horizontal on a tie; +x when the ends coincide). Port direction (input, output,
   undirected) is never read.
2. **Escape points** `E0 = p0 + d0·c`, `E1 = p1 + d1·c` with clearance `c` (default 20
   world units, the Bezier minimum handle).
3. **Candidates**, each a vertex list from `p0` to `p1`:
   - *straight*: `p0, p1` when the ports face each other (`d1 = −d0`), are aligned within
     1e-6 world units, and `p1` lies ahead of `p0`;
   - *L*: one corner on the line through `p0` along `d0` and the line through `p1` along
     `d1`, when `d0 ⟂ d1` and the corner lies ahead of each port by at least `c`;
   - *midpoint S*: `p0, (m, p0.y), (m, p1.y), p1` (or the vertical analogue), with `m`
     halfway between the ports, when the ports face each other and `m` lies ahead of
     both. This is also what implements the port escape and clearance rule's close facing ports: the escape segments
     are shortened to half the distance;
   - *escape connectors*: `p0, E0, …, E1, p1` where `…` is one corner (two choices) or a
     middle segment perpendicular to an axis at a coordinate from a fixed set: `E0` and
     `E1`'s own coordinates (these give the U-shapes), their midpoint, the midpoint of
     the gap between the two bodies when they are apart by more than `2c`, and the union
     of both bodies expanded by `c` on each side (around above, below, left, right).
   About fifteen candidates. Each is simplified (collinear vertices merged, zero-length
   segments dropped).
4. **Validity.** A candidate is valid when it never reverses direction (no 180-degree
   turn, which would run back over a stub), and no segment intersects the open interior
   of either body, except that the first segment is exempt from the source body and the
   last from the target body (the escape at the node's own port; for a connection to the
   same node both exemptions apply to that one body).
5. **Choice.** Among valid candidates: fewest bends, then shortest length, then a fixed
   family order (straight, L, midpoint S, escape connectors), then the smaller middle
   coordinate (above before below, left before right), then the smaller first-corner
   `(y, x)`. Every key is geometric, so swapping `from` and `to` yields the same route
   reversed, which an undirected connection relies on.
6. **Fallback.** With no valid candidate the router returns the best candidate by the
   same keys, ignoring validity, with outcome `{ unroutable, nothing }`.
7. **Corners.** The vertex list goes through `polylinePath(points, cornerRadius)`
   (default radius 0: sharp).
8. **Free end** (connection-drag preview with an orthogonal default, no body): the
   checks against a missing body are skipped.

Cost is constant per connection (about fifteen candidates of at most seven segments
against two boxes), so routing adds a few microseconds per connection to the scene build
and none to picking.

The body box is the node's world body bounds (`NodeEntry.bodyBounds`), not its painted
bounds: painted margins hold labels and glows, and routing around them would make every
wire detour. Files: `orthogonal-router.ts` (factory, steps 6 and 7), `escape.ts`
(step 1), `orthogonal-candidates.ts` (steps 2 and 3), `orthogonal-check.ts` (steps 4
and 5), each well under 300 lines.

Alternatives considered:

- **A visibility-graph or grid search (A*), as obstacle routers do.** It finds the same
  shapes for two boxes at much higher cost and with tie-breaks that are hard to keep
  deterministic. It belongs to the obstacle-avoidance change, which may build on the
  same candidate checks.
- **A case table per pair of facing directions (16 cases).** It is what simple editors
  ship, but each case hides its own tie-breaks, and the self-connection and overlap cases
  multiply. The candidate set covers them uniformly and is easy to test.

### D5. Scene and view wiring

- `buildConnectionEntry` gets the router for `record.kind` and the two node entries, and
  passes `bodyBounds` with each end. `ConnectionEntry` gains `route: RouteOutcome |
  undefined` (undefined when pathless). Margin-grown bounds and pieces are as today.
- The scene subscribes to `routes.onChange(kind)` and recomputes only the connections of
  that kind (a scan of connection entries, on registration changes only), like geometry
  registration changes recompute only nodes of a type. No patch, no model event, no
  history entry.
- A node move, rotation, mirror or resize already rebuilds incident connections, which
  is all an endpoint-only router depends on.
- View: `MountOptions.routes?: RouteRegistry` (a fresh registry when omitted),
  `ViewHandle.routes`, passed to `bindModel`, and `routes.onChange` marks the scene layer
  dirty. `ConnectionPaintInput` gains `route: RouteOutcome`, so a custom painter can mark
  an unroutable route.
- `tracePath` handles `polyline` (with `arcTo`). The connection painter needs no change:
  endpoint dots use `p0`/`p1`, the arrowhead uses `endTangents`, which for an orthogonal
  route is the escape direction, and a dash runs continuously around corners because the
  wire is one canvas path. Arrowheads fit inside the escape segment at the default
  clearance (arrow length is 5 × line width).

### D6. Previews use the same routers

- **Move and resize previews** (`ghost-entries.ts`): the ghost source gets the registry,
  and each incident connection is routed with `routes.get(record.kind)`, passing the
  changed node entries' body bounds. Today's hard-coded Bezier is a latent bug once kinds
  differ.
- **Connection-drag preview**: always `routes.defaultRouter`, for the free end and when
  snapped to a target. The kind is decided by the policy at commit, sometimes by a host
  chooser; the evaluation carries no kind, and a preview that changes shape as
  the pointer crosses targets would be jumpy. A host whose wires are all orthogonal sets
  the default to orthogonal and gets an orthogonal preview. The free end keeps its normal
  pointing back at the source; the orthogonal router snaps it to an axis, which gives an
  L or S that follows the pointer.

### D7. Overview batching

`traceSimplified` in `overview-painter.ts` handles polylines: when the vertex box is
under 3 CSS px on screen it draws a line from `p0` to `p1`; otherwise it traces the
vertices with `lineTo` and drops the arcs (an overview stroke may be simplified, the level of detail rule,
and endpoints still meet the ports). Polylines join the same style batches as other
paths, so the stroke count per frame is unchanged.

### D8. Determinism and degenerate input

The router uses no `Map` or object iteration, no randomness and no accumulated state;
the candidate list is built in a fixed order. Equal inputs give bit-identical vertex
lists. Coincident anchors give a two-point polyline at that point, `complete`,
with finite bounds and distances. Non-finite anchors stay pathless as today.

### D9. Performance evidence

- Headless (`bench/headless/scene.bench.ts`): the existing F-LARGE rows (scene and index
  build, culling at zoom 1 and 0.5, pick at zoom 1 and fit-all) gain an orthogonal
  variant built with an all-orthogonal registry (default router orthogonal, radius 6).
  Targets as today: build p95 ≤ 1 s, query and pick p95 ≤ 2 ms.
- `bench/headless/incremental.test.ts`: moving one node with orthogonal routes writes only
  that node's and its incident pieces' index entries, and the
  one-node patch with scene update stays ≤ 4 ms p95.
- Browser: `bench/fixtures/fixture-view.ts` takes a route option, and
  `BENCH_ROUTES=orthogonal` runs the pan, drag and overview workloads on F-LARGE with
  orthogonal routes, rows labelled with the route. A quick run is compared with the
  2026-10-30 baseline and recorded in notes.md; a new baseline file is not required.
- a script test bundles a consumer that imports only `createGeometryScene` and
  `createRouteRegistry`, and one that also imports `createOrthogonalRouter`; the first
  must be smaller by the router's size (at least 1 KiB).

### D10. Files and layering

| Layer | New or changed file |
| --- | --- |
| core/space | `geometry/path-geometry.ts`, new `geometry/polyline.ts`, `geometry/path-pieces.ts`, `geometry/connection-paths.ts` (drops `buildPath`, `RouteMode`), `geometry/index.ts`; new `routing/route-types.ts`, `routing/route-registry.ts`, `routing/basic-routers.ts`, `routing/escape.ts`, `routing/orthogonal-candidates.ts`, `routing/orthogonal-check.ts`, `routing/orthogonal-router.ts`, `routing/index.ts`; `scene/scene-entries.ts`, `scene/geometry-scene.ts`, `scene/scene-update.ts` |
| core/facade | `src/core/index.ts` exports |
| view/platform | `model-binding.ts` (routes, dirty on change) |
| view/render | `primitives/trace-path.ts`, `paint/overview-painter.ts`, `paint/scene-layer.ts`, `registries/painter-types.ts`, `paint/previews/ghost-entries.ts`, `move-preview-painter.ts`, `resize-preview-painter.ts`, `connect-preview-painter.ts`, `preview-host.ts` |
| view/mount | `view-types.ts` (`routes`), `mount-view.ts` (about +3 lines, the accepted exception) |

Inside `core/space`, `routing/` imports `geometry/`, and `scene/` imports both;
`geometry/` imports neither, so there is no cycle.

## Risks / Trade-offs

- [Wires cross unrelated nodes until the obstacle change] → The outcome says
  `endpoint-nodes`, never more; docs and the demo say so. Hosts who need avoidance now
  keep Bezier for those kinds.
- [Ports a hair off alignment get a tiny S-jog instead of a straight wire] → Alignment
  uses a 1e-6 tolerance so the output stays exactly orthogonal; hosts with grid snapping
  get exact alignment. Revisit with editing, where the user can straighten a segment.
- [Ports inside the body box (concave outlines) can make every candidate invalid] → The
  route falls back and reports `unroutable`; the fallback still meets the ports.
- [Fewest bends first can pick a long U over a shorter four-bend route] → Rare with two
  boxes; the candidate tests include such layouts so the behavior is pinned, and the
  scoring can be tuned without changing the representation.
- [Hosts that switched on `PathGeometry["kind"]` or used `routeMode`/`buildPath` break]
  → Pre-release; TypeScript's exhaustiveness check points at every site.
- [Long far-apart wires in F-LARGE now have up to five corners] → Pieces stay at most 12
  and per-corner pieces are tighter than cubic control boxes; the orthogonal bench rows
  prove the budgets.

## Migration Plan

Additive for hosts that register no route, apart from type changes:
`GeometrySceneOptions.routeMode` becomes `routes`, `buildPath` and `RouteMode` are gone,
`PathGeometry` has a third member, `ConnectionEntry` and `ConnectionPaintInput` gain
`route`, `MountOptions` and `ViewHandle` gain `routes`. No data migration; the snapshot
format and the model are unchanged.

## Resolved Questions

Answered by the user on 2026-11-01, before the proposal:

- **Slicing.** This change is the automatic orthogonal shape only, with no user editing.
  Later separate changes: route editing, wire jumps at crossings, obstacle
  avoidance around unrelated nodes, possibly as an optional router.
- **Default shape.** An S-shape with the fewest turns that leaves and enters each port
  along its facing direction (the anchor normal, which follows rotation and mirroring)
  with a configurable clearance stub. Aligned facing ports give a straight
  segment; offset facing ports an S with the middle segment at the midpoint; same-facing
  ports a U; perpendicular facings an L where possible. Backwards wires go around their
  own two nodes, above or below, whichever is shorter, with a deterministic tie-break,
  and never cross their own endpoint nodes. Unrelated nodes are ignored until the
  obstacle-avoidance change, and such routes are not advertised as obstacle-free (D3,
  D4). Undirected ports and zero or degenerate normals get a defined fallback (D4 step 1).
- **Corners.** Sharp 90-degree corners by default; a `cornerRadius` option rounds them;
  picking and bounds use the same path (D1).
- **Naming.** Route modes are "orthogonal" and "bezier". The code already calls the
  smooth mode `"bezier"` and has `"straight"` (kept), so no public rename is needed. The
  `PathGeometry` kinds `line`, `cubic` and the new `polyline` are geometry terms and
  stay.
- **Mode selection.** Per connection kind, registered like painters; the view default is
  Bezier, so nothing changes for existing hosts; no per-connection override (D3).
- **For `add-orthogonal-route-editing` (decided now, not built here):**
  - dragging a middle segment sideways moves it, and its neighbours stretch;
  - a double-click on a segment splits it into a small step that can be dragged;
  - dragging a segment into line with its neighbour merges the extra bends;
  - manual segments keep their world position when a node moves; only the end pieces
    next to the moved node adapt.

  This change prepares for it without storing anything: the router's input is a struct
  that gains an optional `constraints` field (manual segment positions, persisted
  separately from automatic vertices in the reserved snapshot `routes` section, the persistent route constraints rule),
  and the router's output stays a polyline whose vertices are always derived.

Answered by the user after review (2026-11-01), each as recommended:

- **Corner radius** is an option of the orthogonal router
  (`createOrthogonalRouter({ cornerRadius })`), carried in the geometry, so drawing,
  picking and culling share one path (D1). This replaces the earlier "painter option"
  wording.
- **Backwards wires between separated nodes** may take the shorter between-channel route
  (the third scenario of the rule that an orthogonal route stays clear of its endpoint nodes); "above or below" stays the rule when the nodes overlap
  vertically.
- **Unroutable routes** get no visual mark in this change; a diagnostic decoration comes
  with the obstacle-avoidance change, where such routes become common.

## Open Questions

None.
