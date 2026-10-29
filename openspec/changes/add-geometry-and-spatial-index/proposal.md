# Proposal: add-geometry-and-spatial-index

## Why

Painting, picking, port anchors, culling, and the later interaction tools all need one
shared, headless geometry contract. If each layer computed its own positions, a rotated or
mirrored node would be drawn in one place and picked in another. Slice A needs this
contract in core so it can be tested in Node before any canvas exists. It also needs a
spatial index, so culling and picking stay bounded on large graphs.

## What Changes

- Add named coordinate spaces (node-local, world, viewport CSS pixels, device pixels) with
  typed points/rects and forward and inverse conversions.
- Add one 2D affine transform convention. The node transform composes mirror, quarter-turn
  rotation, and translation with exact integer-rotation arithmetic. A viewport transform
  covers zoom and pan, and a device-pixel step applies the device pixel ratio.
- Add the node geometry contract: body bounds, precise hit shape, painted bounds, and port
  anchors with outward normals, all in node-local space and independent of painters. A
  registry keyed by node type has a placeholder geometry for unknown types.
- Add renderer-neutral hit shapes (rectangle, rounded rectangle, ellipse, polygon) with
  containment and distance tests.
- Add straight and cubic-Bezier connection path geometry: exact bounds, nearest point,
  distance, and endpoint tangents. Default path builders derive control points from anchor
  normals and are safe for coincident anchors.
- Add an in-house dynamic spatial index behind an interface (dynamic AABB tree with fattened
  bounds), plus a brute-force reference implementation for tests.
- Add a headless geometry scene: a derived cache of node transforms, world bounds, anchors,
  and connection paths. It is updated incrementally from committed-change events, and it
  answers rectangle queries for culling and ordered point picking for nodes, ports, and
  connections.
- Add geometry for the image-symbol preset (ports anywhere on the outline) and the card
  preset (labeled port rows, horizontal or vertical).
- Document supported coordinate and zoom ranges.

Requirements implemented: the named coordinate spaces rule, the one transform convention rule, the shared node transform rule, the Node geometry contract rule, the two-phase hit-testing rule, the hit result identity and order rule, the screen-space tolerances rule and the finite ranges and degenerate inputs rule,
the spatial index contract rule, the incremental index updates rule, the indexed culling by painted bounds rule and the deterministic index results rule; partially the custom shapes and portless nodes rule, the sizes and port layouts rule and the Node transforms rule (geometry side), the rule that glyph, target, label and anchor are separate
(capture area), the body, painted and hit bounds rule (bounds kinds), the built-in route modes rule (straight and Bezier modes only), the custom path contract rule
(path geometry data and nearest point), and the unknown types and missing assets rule (placeholder geometry).

Out of scope:
- Orthogonal and obstacle-aware routing, route constraints, and asynchronous routing.
  These come in later slices.
- Composite member lanes and bundled-path member hits. The hit-result shape reserves a
  member field, but it stays unused here.
- Resizing, docking geometry, and junction geometry.
- Any browser API. The rule that geometry stays correct under layout and display changes (page scroll, container offsets, DPR changes) is satisfied in
  add-canvas-view-foundation on top of these conversions.

## Capabilities

### New Capabilities
- None. The baseline specs `geometry`, `canvas-view`, `routing`, `node-types`, and `ports`
  already state these requirements; this change implements them.

### Modified Capabilities
- None. `skip_specs: true` is set because no requirement text changes.

## Impact

- New headless modules under `src/core/space/geometry/` and
  `src/core/space/spatial-index/`, exported from the `nodeeditor-js` core entry. They must
  pass the DOM-free `tsconfig.core.json` typecheck.
- Depends on `add-graph-model-core` (node, port, and connection snapshots; per-port durable
  view data; adjacency queries) and on `add-patches-and-history` (committed-change events
  carrying patches) for incremental scene updates.
- Consumed by `add-canvas-view-foundation` (culling, painting transforms) and
  `add-basic-tools` (picking, pointer-to-world conversion).
- No new runtime dependencies.
