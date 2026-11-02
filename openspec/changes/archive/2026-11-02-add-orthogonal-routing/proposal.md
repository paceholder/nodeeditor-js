# Proposal

## Why

Every connection is drawn as a cubic Bezier today. The built-in route modes rule promises straight, Bezier and
orthogonal route modes, and orthogonal routing is one of the R1 features the settled
decisions keep, but there is no orthogonal path, no way to pick a route per connection
kind, and `PathGeometry` has only `line` and `cubic`. A physical-system schematic is
normally drawn with horizontal and vertical wires, so this is the next gap after the
interaction work of Slice B.

This change is the first of several routing changes. It adds the automatic orthogonal
shape only. Editing a route, wire jumps at crossings and avoiding unrelated nodes are
separate later changes (see Out of scope).

## What Changes

- **Polyline path geometry (core).** `PathGeometry` gains a `polyline` member: the two
  endpoints, the interior vertices, and an optional per-corner radius. Bounds, nearest
  point, distance, end tangents, finiteness and the index pieces of the indexed culling and picking rule support it,
  with rounded corners included exactly, so painting, picking, bounds and culling use one
  path. **BREAKING** for host code that switches exhaustively on `PathGeometry["kind"]`.
- **Routers and a route registry per connection kind (core).** A router turns two
  connection ends (anchor, outward normal, the end node's body box) into a path and a
  route outcome. Built-in routers: straight, Bezier and orthogonal, each made by a
  factory, so an unused router is not bundled. A route registry maps a connection kind to
  a router, like the painter registries do, with a default for unregistered kinds:
  Bezier, so nothing changes for existing hosts. Changing a registration recomputes only
  the paths of that kind, with no patch and no history entry. **BREAKING**: the geometry
  scene's `routeMode` option and the `buildPath` helper are replaced by the registry.
- **Automatic orthogonal shape.** Horizontal and vertical segments with the fewest bends,
  leaving and entering each port along its facing direction for a configurable clearance.
  Aligned facing ports get a straight wire; offset facing ports an S with the
  middle segment halfway; same-facing ports a U; perpendicular ports an L where possible.
  A wire whose target lies behind its source goes around its own two nodes (or between
  them when they are apart), on the shorter side, with a fixed tie-break, and never
  crosses its own endpoint nodes. Unrelated nodes are ignored for now. The result is
  deterministic and does not depend on which end is stored first.
- **Route outcome (core).** Each routed path carries a status (`complete`,
  `provisional`, `unroutable`) and what it is clear of (`nothing` or `endpoint-nodes`).
  An orthogonal route is never reported as obstacle-free. When no candidate avoids the
  endpoint nodes (for example overlapping nodes), the best candidate is drawn as a
  fallback with status `unroutable`. The outcome is on the scene entry and in the
  connection painter's input.
- **Sharp or rounded corners.** Corners are sharp by default; the orthogonal router's
  `cornerRadius` option rounds them with arcs that fit the adjacent segments.
- **View.** `mountView` takes a `routes` registry and the handle exposes it. Canvas
  tracing, the overview's batched strokes, the selection outline, arrowheads and dashes
  handle polylines. Move and resize previews route incident connections with their
  kind's router (today they always draw Bezier). The connection-drag preview uses the
  default router, since the kind is decided only at commit.
- **Performance evidence.** Orthogonal rows in the headless F-LARGE benches (scene build,
  culling, picking, one-node patch) and an orthogonal run of the browser drag and
  overview workloads, against the existing targets.
- **Demo.** The plain-js demo draws the "delayed" kind orthogonal with rounded corners
  and gets a checkbox that switches the default kind between Bezier and orthogonal live.

Implements or refines: the built-in route modes rule (route per connection kind, default Bezier), new the orthogonal route shape rule
(orthogonal shape), the rule that an orthogonal route stays clear of its endpoint nodes (own endpoint nodes), the escape direction fallback rule (escape direction fallback and
end-order independence), the sharp or rounded corners rule (rounded corners), the routes in previews rule (routes in previews), the port escape and clearance rule
(clearance per router, close facing ports), the route outcomes rule (status and clear-of scope). Evidence
also touches the custom path contract rule (custom path contract for the polyline), the obstacle-aware orthogonal routing rule (not advertised as
obstacle-free), the deterministic and stable routing rule (determinism), the bounded route invalidation rule (only incident routes recompute), the rule that route-only edits keep topology
(route changes are presentation only), the two-phase hit-testing rule, the finite ranges and degenerate inputs rule, the query and update budgets rule, the bounded dirty-driven work rule and the indexed culling and picking rule,
the level of detail rule and the low-detail rendering rule (overview), the independent extension contracts rule, the targeted invalidation rule and the tree-shakable features and default preset rule (unused router not bundled).

### Out of scope

Follow-up changes, in this order (user decision, 2026-11-01):

1. `add-orthogonal-route-editing`: moving and splitting segments, stored route
   constraints kept separate from automatic vertices, and their snapshot
   format. This change stores no route data and adds no editing.
2. Wire jumps or bridges at crossings (SHOULD).
3. Obstacle avoidance around unrelated nodes, possibly as an optional packaged
   router, with bounded non-incident invalidation and asynchronous routing.

Also out of scope: click-to-route, custom routers beyond the router contract
itself, labels on paths, a visual marker for unroutable routes, and
React bindings.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `routing`: selects the route by connection kind with a Bezier default; new
  the routing requirements define the orthogonal shape, endpoint-node clearance, escape
  direction fallback and end-order independence, rounded corners, and routes in
  previews; the port escape and clearance rule makes the clearance configurable and defines close facing ports;
  the route outcomes rule adds the clear-of scope to the outcome.

## Impact

- Core, space: `geometry/path-geometry.ts`, `geometry/path-pieces.ts`,
  `geometry/connection-paths.ts` (drops `buildPath`), new `geometry/polyline.ts`; new
  folder `src/core/space/routing/` (route types, registry, straight and Bezier routers,
  orthogonal router, candidates, checks, escape direction), inside the existing
  `core/space` row of `src/architecture.test.ts`; `scene/scene-entries.ts`,
  `scene/geometry-scene.ts`, `scene/scene-update.ts`; `src/core/index.ts` exports.
- View: `render/primitives/trace-path.ts`, `render/paint/overview-painter.ts`,
  `render/paint/scene-layer.ts`, `render/registries/painter-types.ts`, the preview
  painters and `preview-host.ts`, `platform/model-binding.ts`, `view-types.ts`,
  `mount-view.ts`.
- Bench: `bench/headless/scene.bench.ts`, `bench/headless/incremental.test.ts`,
  `bench/headless/setup.ts`, `bench/fixtures/fixture-view.ts`, browser workloads.
  Scripts: a tree-shaking check for the tree-shakable features and default preset rule.
- Examples: new `examples/plain-js/routes.ts`, small wiring in `main.ts` and
  `index.html`.
- Docs: `docs/geometry.md`, `docs/guide-view.md`, `docs/architecture.md`.
- No new runtime dependencies. The snapshot format and the model are unchanged.
