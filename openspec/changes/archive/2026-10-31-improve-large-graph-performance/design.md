# Design

## Context

See proposal.md for the measurements. These are the parts of today's code the fixes
touch:

- **Index entries.** `createGeometryScene` keeps one spatial-index entry per node
  (`n:<id>`, index bounds) and one per connection (`c:<id>`, the painted bounds of the
  whole path, grown by `connectionMargin`). Paths are `line` or `cubic` `PathGeometry`.
- **Picking.** `pickAt` runs a point query with radius `max(tolerance, max capture) / zoom`.
  Every connection key it returns gets `pathDistance` on the whole cubic (16 subdivisions
  plus Newton steps). A long wire's box covers a big area, so it is measured on most
  picks. Zoomed out, the radius in world units grows as well.
- **Rectangle queries.** `GeometryScene.queryRect` collects keys, then for each key slices
  the string, branches on its prefix, looks up the entry, re-tests the bounds and
  allocates a sort row. It then sorts all rows with a four-key comparator that ends in a
  string compare. At fit-all that is about 30k rows per frame.
- **Scene painting.** `paintEntries` paints by z-layer. Each connection, node and port
  gets its own `save()`, painter call and `restore()`. Ports use the port-glyph painter,
  one arc or rect each.
- **Level of detail.** `detailPolicy(zoom, theme)` returns `full` / `reduced` /
  `minimal`, with thresholds 0.6 and 0.25 (theme tokens). `minimal` hides text, but
  ports, painters and per-entity state changes stay the same.
- **Frame scheduling.** Pan and zoom mark background and scene dirty. The scheduler
  repaints each dirty layer once per animation frame.

## Goals / Non-Goals

**Goals:**

- Drag-time pick p95 at most 2 ms in F-LARGE. Zoomed out, a pick costs
  about the same as zoomed in.
- Fit-all zoom and pan of F-LARGE at p95 at most 33.3 ms, with exact frames.
- The culled F-LARGE pan at DPR 2 meets p95 ≤ 16.7 ms again, through the shared savings in
  query and paint cost.
- No regressions elsewhere in the baseline. Idle stays at zero frames. Bundle size stays
  within budget.

**Non-Goals:**

- Painter API redesign. Host node painters keep working unchanged at every level above
  overview.
- Changing what `queryRect` returns or its documented order, except that paths are now
  culled by their piece boxes (D1).

## Decisions

### D1. Connections are indexed per path segment

Each connection's path is split into `k` sub-paths for the index. A line is one segment.
A cubic is split at equal parameter steps by de Casteljau subdivision, which gives each
piece exact control points, and the box around a piece's control points contains the
piece. `k = clamp(ceil(approxLength / 800 world units), 1, 12)`, where `approxLength` is
the control-polygon length. Each piece is indexed as `c:<id>#<i>` with its box grown by
`connectionMargin`. The connection entry stores its pieces (`segments: PathGeometry[]`),
and its painted bounds stay the union, used for culling and the painter.

- **Pick:** connection keys are grouped by ID. Exact distance is computed only on the
  pieces whose box was returned, using `pathDistance` on each sub-path. The connection
  hits if any piece is within tolerance. Distance work is then bounded by the pieces near
  the pointer, not by how long the wire is.
- **`queryRect`:** pieces of one connection are de-duplicated. A connection is returned
  when its overall painted bounds and at least one of its margin-grown piece boxes
  intersect the rectangle. That is tighter than the overall box alone: an S-curve whose
  box touches the viewport but whose stroke does not is no longer returned (the indexed culling by painted bounds rule is
  refined to say so). The painter and the marquee re-test the path, so neither changes
  what it draws or selects.
- **Updates:** moving a node rewrites that connection's pieces. The count may change, so
  stale `#i` keys above the new count are removed. That still touches only incident
  connections (the indexed culling and picking rule "Incremental index update").

Alternatives considered:

- **A coarse per-connection polyline test before `pathDistance`.** Cheaper to build, but
  every long wire is still a broad-phase candidate. Candidate count is the problem, not
  the cost of the exact test.
- **A second index for connections only.** No benefit over key prefixes, and it doubles
  the query cost.
- **Fixed `k`.** Wastes entries on the many short wires. A length-based `k` keeps the
  F-LARGE entry count near 1.5× today's rather than 12×.

Cost: index build gets slower, and `queryRect` visits more keys. The step was tuned on
F-LARGE: at 160 world units the 20k wires became 104k pieces, which doubled the fit-all
culling query and quadrupled the build. At 800 they become about 35k pieces (1.7 per
wire); the fit-all query is then on par with one entry per wire, picking is about 3×
faster than before at every zoom, and the build stays well under its 1 s budget. A
benchmark guards it.

### D2. `queryRect` without strings and generic sorting

- **Entry lookup.** The scene keeps a `Map<string, IndexedRef>` from index key to
  `{ kind, entry }`. That removes the per-key `slice` and `startsWith`. (It is rebuilt
  with the entry, so it never goes stale.)
- **Ordering.** Rows go into per-layer arrays in place of one big array, and each array
  is sorted by `(z, seq)` with numeric comparisons. The ID tie-break stays as the last
  key: the model allocates `seq` from one counter, but a patch's add op may pass its own
  `seq` (only checked to be a positive integer), and the `GraphReader` contract does not
  promise uniqueness. It runs only when `z` and `seq` both tie, so it costs nothing in
  the usual case. Connections (all at `z = 0`) are sorted by packing `seq` and the row
  number into one float and sorting a `Float64Array` natively. Pieces are de-duplicated
  without a set: a path is kept only at the lowest-numbered piece the query returned. The
  AABB tree collects a subtree whose box lies inside the query without further tests.
  The order is unchanged.
- **Full-view cache.** When the query rectangle contains the union of all indexed bounds
  (the fit-all case), the sorted result is cached under a scene version counter that every
  index write bumps. A zoom sweep at fit-all then reuses one list until something
  changes.

Alternative: a persistent paint-ordered list filtered per frame. That is O(N) per query
even for small viewports, so it was rejected for the culled case.

### D3. An `overview` detail level painted in batches

`DetailLevel` gains `overview`, chosen when `zoom < theme.lodOverviewBelow` (new token,
default 0.15; F-LARGE fit-all at 1440×900 is below that). At overview, the scene layer
does not call node, port or connection painters. It draws the following itself:

- **Nodes.** The hit bounds are added to one path per resolved `(fill, stroke)` style
  pair, then filled and stroked once. Image symbols are not drawn: a node is a few pixels
  wide at this zoom.
- **Connections.** Each path is added to one path per resolved stroke style, then stroked
  once. Below about 3 CSS px of on-screen length (control polygon), a cubic is drawn as
  a line.
- **Ports.** Not drawn (D4 hides them from a higher zoom already). Wire endpoints still
  end at the anchors, so the level of detail rule's attachment distinction holds. Port visibility follows
  `lodHidePortsBelow` alone: with that token at 0 (ports at every zoom, as the level of detail rule allows),
  the overview still draws ports through their glyph painters and they stay pickable, so
  a port is never pickable without being drawn. (Clarified during implementation.)
- **Always drawn individually, after the batches.** Selection outlines (nodes and
  connections), diagnostics and status badges, and, once Slice B adds them, junction
  markers. These lists are small, so they keep their per-entity code paths.

Canvas state is set once per batch. Nothing per entity calls `save` or `restore`.

Why the scene layer and not the painters: painters are free-form host code, so batching
needs a known shape. A node with special overview needs can be handled later with an
optional `overview(ctx, input)` painter method. That is an addition, not a breaking
change, and it is deferred.

Alternative: shrink detail inside each painter. Per-entity call and state overhead would
remain. That overhead is most of the cost in the profile.

### D4. Hide ports when zoomed out, and fewer state changes elsewhere

Port glyphs and capture radii are constant in CSS pixels, which makes them easy to hit
when zoomed in. Zoomed out, they clutter the scene and dominate paint cost (1.07 s of the
6 s zoom-sweep profile). A new theme token, `lodHidePortsBelow` (default 0.25, the
current `minimal` threshold), sets a zoom below which ports are hidden:

- **Paint.** The scene layer does not paint ports.
- **Pick.** `pickAt` gets a `ports: false` option, and the view passes it below the
  threshold, so the broad-phase radius ignores capture radii and no port candidates are
  scored. A press over a hidden port therefore goes to select/move or empty-canvas pan,
  never to connect. The connect tool also cannot pick a hidden port as a target, because
  its candidates come from the same pick. Zooming in brings ports back.
- **Off switch.** Setting the token to 0 keeps ports at every zoom. Hosts that connect
  while zoomed far out can do that.
- **Connections stay visible**, simplified at overview (D3): they carry the graph's
  structure, and the user asked to hide only ports.

At `full`, `reduced` and `minimal` above the threshold, painters still get
`save`/`restore`, because they may change any state. There is one cheap win: port glyphs
are drawn without `save`/`restore`. The built-in glyph painter only sets fill, stroke and
line width, and the scene layer sets those explicitly before each glyph.

### D5. Opt-in gesture bitmap reuse

New mount option: `gestureBitmap?: { minVisible?: number; settleMs?: number;
maxZoomRatio?: number; maxUncovered?: number }`. It is off when absent. The defaults are
`minVisible: 3000` (visible nodes plus connections), `settleMs: 120`, `maxZoomRatio: 1.25`
and `maxUncovered: 0.25`. When it is on:

- After each exact scene paint, the scene canvas is copied into an offscreen
  canvas, and the viewport it was painted with is recorded.
- A frame whose only dirty reason is a viewport change, when the visible count is at
  least `minVisible`, draws the stored copy with the viewport delta transform instead of
  repainting. The background layer (grid) is cheap and still repaints exactly.
- Staleness limit: the copy is reused only while the zoom ratio to the stored frame stays
  within [1 / `maxZoomRatio`, `maxZoomRatio`] (default [0.8, 1.25]) and the fraction of
  the view the transformed copy does not cover is at most `maxUncovered` (default 0.25).
  Otherwise the frame paints exactly, which also refreshes the copy. Without this bound a
  gesture that never pauses never reaches the settle repaint: in the perf demo the zoom
  sweep showed the fit-all frame scaled up more than 3x (nodes blurred to blocks, wires
  to a haze), and 4 s into the continuous pan the copy had slid off screen, leaving only
  the grid. With the bound, the view is never more than the bounded zoom ratio and
  uncovered area away from an exact frame.
- One timer (re)starts on each viewport change. When it fires, it marks the scene dirty
  for an exact repaint. It is cleared by that repaint and by `dispose()`, so idle stays
  at zero frames.
- Any model change, selection change, hover change, theme change, asset arrival or
  resize forces an exact repaint on the next frame.
- Picking never uses the bitmap: it always reads the geometry scene.

Areas the stored frame did not cover (at most `maxUncovered` of the view) show only the
background until the next exact frame, and zooming in up to `maxZoomRatio` softens the
copy. That trade-off is acceptable for an opt-in option, and the guide documents it.

### D6. Benchmarks and baseline

- **Overview workloads.** New browser workloads, `overview-zoom` and `overview-pan`, at
  F-LARGE fit-all, DPR 1 and 2, with the bitmap option off. Each reports frame interval,
  latency, pick time and visible counts.
- **Targets.** Added to `bench/report/targets.ts` as the overview navigation target rule: p95 ≤ 33.3 ms; pick
  p95 ≤ 2 ms.
- **Headless benches.** Two existing benches gain variants: pick at fit-all zoom, and
  `queryRect` at fit-all.
- **Baseline.** A new baseline file is written. `SUMMARY.md` compares it with
  2026-10-30.

## Risks / Trade-offs

- [The index grows: about 1.5× entries, and slower build and incremental updates] →
  Benchmarks guard the projection build (≤ 1 s) and patch apply (≤ 4 ms). The length step
  in D1 is the knob if they regress.
- [The full-view cache goes stale] → It is keyed by a counter that every index write
  bumps, and a test compares cached and uncached results after mixed edits.
- [Overview looks different from the custom painter output a host expects] → It only
  applies below a theme threshold the host can lower (to 0 to turn it off). The guide
  says so.
- [The DPR 2 culled pan miss (16.8 vs 16.7 ms) does not close through the shared savings
  alone] → A specific task profiles that workload after D2 and D4. If it is still missed,
  the result is reported to the user with the profile. It is not accepted silently.
- [Bitmap reuse shows stale content during a gesture] → It is opt-in, any non-viewport
  change forces an exact frame, and picking ignores it.

## Migration Plan

Additive, with no data or snapshot changes. Host code with an exhaustive `switch` over
`DetailLevel` needs an `overview` case. Release notes and the view guide mention this.

## Open Questions

- The defaults `lodOverviewBelow` (0.15) and `lodHidePortsBelow` (0.25) and the D1 length
  step (now 800 world units, see D1) are first guesses. They are tuned against the demo and benchmarks during implementation,
  and that does not change the approach.
