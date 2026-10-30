# Proposal

## Why

The Slice A baseline (2026-10-30) missed two budgets, and the interactive performance demo
showed a case the baseline never measures. Picking during a drag in F-LARGE took 2.7 ms at
p95 against a 2 ms target. Panning F-LARGE at device pixel ratio 2 took 16.8 ms at p95
against 16.7. And with the whole F-LARGE graph on screen (fit-all), zooming runs at
33–38 fps with frames up to 200 ms.

Profiles show two causes:

- **Picking.** Each connection is indexed as one bounding box, so a long wire is a pick
  candidate almost everywhere. Every pick then measures the exact distance to many curves.
  The indexed culling and picking rule already requires indexing path segments; the code does not do it yet.
- **Zoomed-out painting.** Every frame repaints all 10k nodes, about 40k ports and 20k
  wires at full detail, with a `save`/`restore` per entity. The geometry scene's
  rectangle query is a large share of each frame on top of that.

The demo's 1.5–2.2 s "hitch" when starting a large move came from the demo's own grab
search, not from the library. It is already fixed (`f0a748a`) and is out of scope here.

## What Changes

- **Segment-indexed picking.** Each connection path goes into the spatial index as
  several boxes (one per path segment) instead of one box around the whole path. Pick
  candidates then come only from boxes near the pointer, and incremental updates still
  touch only the moved node's wires.
- **Hidden ports when zoomed out.** Ports keep a constant size on screen, so on a big
  zoomed-out graph they clutter the view. Below a theme threshold (default: the current
  `minimal` level), ports are neither drawn nor pickable. A press there then pans,
  selects or moves; it never starts a connection. Connections stay visible. The
  threshold can be set to 0 to keep ports at every zoom.
- **Overview detail level.** A new `overview` level sits below `minimal`. Nodes are drawn as plain filled outlines, and
  connections as simple strokes, both batched by style into a few draw calls. Selected
  nodes, error and status indicators, junction markers and wire endpoints stay visible.
- **Less canvas state churn.** The scene layer groups entities that share a style and sets
  canvas state once per group, not with a `save`/`restore` per entity.
- **Faster scene rectangle query.** The geometry scene's `queryRect` stops re-sorting or
  copying the full result set on every call.
- **Opt-in gesture bitmap reuse.** A new view option. While a pan or zoom gesture is
  running on a large visible set, the view redraws the last scene frame translated or
  scaled. When the gesture rests, it repaints exactly. Off by default.
- **Overview benchmark target.** A new labeled target, the overview navigation target rule: zoom and pan at fit-all
  in F-LARGE at 30 fps or better. A new browser workload measures it, and a new baseline
  is recorded.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `performance`: adds the overview navigation target rule, an overview interaction target for the whole of F-LARGE
  on screen.
- `canvas-view`: adds the gesture bitmap reuse rule, opt-in gesture bitmap reuse. The level of detail rule gains an `overview`
  detail level that keeps the elements the level of detail rule already requires.
- `geometry`: culls a path by the union of its margin-grown segment boxes instead
  of its overall bounding box, so a path whose stroke stays outside the viewport is not
  drawn.

Implemented or refined requirements: the interaction budgets rule, the query and update budgets rule and the overview navigation target rule (new), the indexed culling and picking rule and the low-detail rendering rule,
the indexed culling by painted bounds rule, the culled painting rule, the level of detail rule and the gesture bitmap reuse rule (new).

## Out of scope

- The move-start hitch: it was a demo artifact and is already fixed.
- WebGL or OffscreenCanvas/worker rendering, and SVG-to-Path2D conversion.
- Aggregating or clustering nodes into summary glyphs. Every node is still drawn
  individually, only simplified.
- React Flow comparison and any routing work. Both belong to later slices.
- Changing the existing 60 fps budgets for culled F-LARGE and F-TYPICAL.

## Impact

- `src/core/space/scene/` (geometry scene index entries, `queryRect`, picking) and
  `src/core/space/spatial-index/` (multiple boxes per key, or a segment key scheme).
- `src/view/render/paint/` (level of detail, scene layer batching, fallback and preset
  painters' overview path) and `src/view/mount-view.ts` (gesture bitmap reuse option).
- `ThemeTokens` gains `lodOverviewBelow` and `lodHidePortsBelow` thresholds; `PickOptions` gains `ports`. `DetailLevel` gains `overview`.
  Custom painters receive the new level and may ignore it. Not breaking, but an
  exhaustive `switch` on `DetailLevel` in host code needs a new branch.
- `bench/` (overview workload, targets, new baseline file) and `examples/perf`
  (demo toggle for the bitmap option).
- Docs: `docs/guide-view.md`, `docs/geometry.md`, `bench/README.md`.
