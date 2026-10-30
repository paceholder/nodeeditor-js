# Design: add-geometry-and-spatial-index

## Context

See proposal.md for motivation. Core must stay DOM-free (`tsconfig.core.json`, `lib: ["ES2022"]`),
so no `DOMMatrix`, `Path2D`, or canvas types appear here. Entity snapshots, per-port durable
view data, adjacency queries, and committed-change events come from `add-graph-model-core`
and `add-patches-and-history`; this change consumes them and defines no model types.

## Goals / Non-Goals

**Goals:**
- One transform convention used by painting (later), bounds, anchors, normals, and picking.
- Picking and culling testable in Node with deterministic results.
- Incremental updates: moving one node touches only its entry and its incident paths.

**Non-Goals:**
- Text measurement. Painted bounds for labels use declared margins, and the view may refine them.
- Orthogonal routing, route constraints, and bundled lanes.
- Gesture handling. The tools change consumes `pick` and the conversions.

## Decisions

### D1. Module layout (each file 100–300 lines)

```
src/core/space/geometry/
  spaces.ts             branded point/vector/rect types per space, finiteness guards
  affine.ts             Affine2 {a,b,c,d,e,f}: compose, invert (rejects singular), apply
  rect.ts               Rect ops: union, intersect, inflate, contains, transformRect (AABB)
  node-transform.ts     NodeTransform (position, quarterTurns 0..3, mirrored) -> Affine2, exact
  viewport-transform.ts Viewport {zoom, panX, panY}, dpr; world<->viewport<->device; clampZoom
  limits.ts             documented ranges (MAX_WORLD_COORD, MIN/MAX_ZOOM) and validators
  shapes.ts             Shape union (rect | roundRect | ellipse | polygon): contains, distance, bounds
  path-geometry.ts      PathGeometry (line | cubic): bounds, nearestPoint, distance, endTangents
  connection-paths.ts   straightPath / bezierPath builders from two anchors + normals
  node-geometry.ts      NodeGeometry contract, PortAnchor, GeometryRegistry, placeholderGeometry
  presets/image-symbol-geometry.ts
  presets/card-geometry.ts
src/core/space/spatial-index/
  spatial-index.ts      SpatialIndex<K> interface
  aabb-tree.ts          dynamic AABB tree with fattened bounds
  brute-force-index.ts  reference implementation (tests, tiny graphs)
src/core/space/scene/
  geometry-scene.ts     derived cache + incremental update from change events
  scene-entries.ts      per-node / per-connection cached records
  picking.ts            pick(point, options) -> ordered HitCandidate[]; queryRect for culling
```

### D2. Coordinate spaces as branded types

```ts
type Space = "local" | "world" | "viewport" | "device";
type Point<S extends Space> = { readonly x: number; readonly y: number; readonly __space?: S };
type Rect<S extends Space> = { readonly x: number; readonly y: number; readonly w: number; readonly h: number; readonly __space?: S };
```

The phantom brand costs nothing at runtime, and the compiler rejects passing a viewport
point where a world point is expected. Alternative considered: plain `Vec2` with naming
conventions only. It was rejected because mixing spaces is the classic source of DPR and
zoom bugs.

### D3. Transform convention

`Affine2` uses the canvas `setTransform(a,b,c,d,e,f)` order: `x' = a·x + c·y + e`,
`y' = b·x + d·y + f`. The view can then hand a composed matrix straight to Canvas2D without
reordering.

Node transform: `world = T(position) · R(quarterTurns·90°) · M(mirrored)`. Mirroring is
applied first, about the node-local origin. Node-local origin is the **body center**, so
rotating and mirroring keep the node in place. `position` is the world location of that
origin. Quarter turns use exact 0/±1 matrix entries, so no trigonometric rounding occurs, and
an anchor rotated four times returns bit-identical. Normals transform by the linear part only.
They stay unit length because the linear part is orthonormal.

Viewport: `viewport = world · zoom + pan` and `device = viewport · dpr`. The full paint
matrix is `device ← viewport ← world ← local`, composed once per node per frame.

Alternatives considered:
- Top-left node origin: rotation would then need pivot compensation everywhere.
- Arbitrary rotation angles: not required. The Node transforms rule asks for quarter turns, and exactness keeps
  axis-aligned bounds tight.

### D4. Ranges and degenerate input

`limits.ts` documents |world coordinate| ≤ 1e7 and zoom in [1e-3, 1e3]. Views may narrow the
zoom range. Behavior:
- Non-finite inputs are rejected with a structured error.
- Zoom requests outside the range are clamped, and the clamping is documented.
- `invert` returns a Result and refuses |det| < 1e-12.
- Zero-size rectangles and coincident anchors are valid inputs. Every function returns
  finite results; a zero-length path's distance is the distance to its point.

### D5. Node geometry contract

```ts
interface PortAnchor { portId: string; position: Point<"local">; normal: Point<"local">; captureRadiusPx?: number }
interface NodeGeometry {
  bodyBounds(node: NodeView): Rect<"local">;
  hitShape(node: NodeView): Shape;            // precise, local space
  paintedBounds(node: NodeView): Rect<"local">; // ⊇ body; includes declared label/shadow margins
  anchors(node: NodeView): readonly PortAnchor[]; // in model port order
}
```

`NodeView` is the read-only node snapshot (with its ports and durable view data) from
`add-graph-model-core`; it is not redefined here. Hit bounds are derived as
`bounds(hitShape) ∪ port capture areas`. `GeometryRegistry` maps type key → geometry and
falls back to `placeholderGeometry` (rectangle from stored size, ports evenly spaced) for
unknown types. Painters never supply geometry.

### D6. Presets

- **Image-symbol:** the body is a rectangle of the stored size. The hit shape is that
  rectangle unless the type supplies an outline polygon. Port placement resolution, in order:
  per-port durable placement `{x, y}` as fractions of the body box plus an optional normal;
  then type-level placement; then even distribution along the side implied by direction (or
  left/right for undirected). Without an explicit normal, the normal points to the nearest
  body edge.
- **Card:** a title-bar height and row pitch from options. Ports sit in rows on left/right
  sides (horizontal layout) or top/bottom (vertical layout), ordered by model port order.
  Painted bounds add a label margin; there is no text measurement in core.

### D7. Paths

`PathGeometry = { kind: "line"; p0; p1 } | { kind: "cubic"; p0; c1; c2; p1 }`, all in world
space.
- Cubic bounds are exact: endpoints plus the roots of the derivative.
- Nearest point uses 16-way uniform subdivision followed by up to 4 Newton steps clamped to
  [0, 1]. This is deterministic.
- `bezierPath` places control points at `p ± n·k` with `k = clamp(|p1−p0|/2, 20, 200)` world
  units.
- `straightPath` ignores normals. Both handle `p0 == p1`.

The union is open for later `polyline` (orthogonal) members.

### D8. Spatial index: dynamic AABB tree

```ts
interface SpatialIndex<K extends string> {
  insert(key: K, bounds: Rect<"world">): void;
  update(key: K, bounds: Rect<"world">): void;   // no-op if still inside fattened box
  remove(key: K): void;
  queryRect(r: Rect<"world">, out: K[]): void;
  queryPoint(p: Point<"world">, radius: number, out: K[]): void;
  readonly size: number;
}
```

Choice: a dynamic AABB tree (a bounding volume hierarchy with fattened leaves and rotations
for balance, the structure physics engines use for moving bodies).

Alternatives considered:
- **Uniform grid hash:** simplest, but long connection boxes span many cells, and the cell
  size cannot suit both 1e-3 and 1e3 zoom.
- **Loose quadtree:** decent, but it needs fixed root bounds or regrowth, and it degrades on
  long thin boxes.
- **R-tree (rbush style):** strong queries, but node splitting is more code, and moving
  entries costs remove + insert.

The AABB tree handles mixed sizes, makes `update` O(1) when a node jitters inside its fat
margin, and fits in about 250 lines.

`queryRect` order follows tree layout. Consumers needing determinism sort keys with
a code-unit string comparison inside `geometry-scene` before returning, so the index stays
order-agnostic.

### D9. Geometry scene and picking

`GeometryScene` holds per-node world transform, world body/hit/painted bounds, and world
anchors, plus per-connection `PathGeometry` and painted bounds (stroke width + arrow margin).
It keeps one index keyed by entity key (`"n:<id>"`, `"c:<id>"`) over `hit ∪ painted` world
bounds.

Incremental update from committed-change events:
- Node add/remove/move/rotate/mirror/resize recomputes that node's record and the paths of
  its incident connections (via the adjacency index), and nothing else.
- A connection add/remove touches only that connection.
- Type-registry or geometry registration changes rebuild affected types only.

`pick(worldPoint, { zoom, tolerancePx, order })`:
1. Broad phase: `queryPoint` with radius = max(tolerancePx, max port capture radius) / zoom,
   so tolerances stay in CSS pixels.
2. Precise phase: ports (distance to anchor ≤ captureRadiusPx/zoom), node hit shapes
   (point transformed to local), and path distance ≤ tolerancePx/zoom.
3. Ordering: by the configured interactive layer order (default ports > nodes > connections,
   overridable per the z-order and interactive order rule), then by paint order descending (topmost first), then by ID.

Results are `HitCandidate = { kind: "port", nodeId, portId } | { kind: "node", nodeId } |
{ kind: "connection", connectionId, member?: string }`. `queryRect(worldRect, "painted")`
returns culling sets in paint order.

## Risks / Trade-offs

- [Painted bounds without text measurement may under-estimate long labels] → Presets
  declare generous margins; the view may register a measured overflow later without
  changing core contracts.
- [Newton nearest-point can miss on cusped cubics] → Subdivision seeds every interval, and
  tests cover S-curves and degenerate cubics against brute-force sampling.
- [AABB tree imbalance under adversarial insert order] → Rotation balancing plus a fuzz test
  comparing every query to the brute-force index over seeded random operations.
- [Per-port placement data depends on add-graph-model-core's durable view schema] → The
  preset reads placement through one function; if the schema names differ, only that
  function changes.
- [Sorting query results costs O(k log k)] → k is the visible set (≈1–3k at the F-LARGE
  target), which is acceptable; revisit in add-perf-baseline if it shows up in profiles.
