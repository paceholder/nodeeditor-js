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
  already exports a `RouteResult` (the tool router's result), and PKG-01 allows one
  import path per public name. `ConnectionRouter.route()` returns a `ConnectionRoute`.
- **The scene recomputes a kind in model order**: `connectionsOfKind` scans
  `reader.connections()`, not the scene's map, so the order of rebuilds is the model's
  (MOD-08). It runs only on registration changes.
- **Scene tests that need a resize register the node type with `resize: true`**: the
  fixture types have no capabilities, and the capability policy denies a resize.
- **The move preview shifts the ghost node's `bodyBounds`** with its transform and
  anchors, since the routers now read the body box; before, nothing read it.
- **The connect preview also passes the source body** (and the target body when
  snapped) to the default router; the free end has none.
- **`mount-view.ts` grew by 8 lines (346)**, not about 3: the core import no longer
  fits on one line once `createRouteRegistry` joins it (+4), plus `routes` in the
  registry default, the binding, the preview deps and the handle.
- **The overview batching case runs under `npm run bench:browser`** (it lives in
  `bench/browser/`, which `npm run test:browser` does not include); it was run with
  `BENCH_DPR=1` against the build. The fixture route option it needs
  (`createFixtureRoutes`, `mountFixture(..., routes)`) therefore landed with group 4.

## Demo check (task 6.1)

`npm run demo:build`, then `vite preview` on a spare port and a headless Playwright run in
the installed Chrome (`channel: "chrome"`, script kept out of the repo):

- dragging the sensor's "level" onto the controller's "setpoint" opened the picker;
  "Delayed link" created a dashed wire drawn orthogonally with rounded corners, leaving
  the sensor to the right and entering the controller from the left between the nodes;
- "Orthogonal wires" switched every default wire to orthogonal at once and back to
  Bezier when cleared, with no undo entry;
- dragging the pump with orthogonal wires attached drew both wires orthogonally on every
  frame of the preview and after the drop;
- no console errors. `examples/plain-js/main.ts` is 297 lines.
- The run found a bug from group 4: the move preview drew the dragged node at twice the
  offset (the shifted body box went through the unshifted inverse transform). Fixed in
  its own commit with a browser test.

## Performance (tasks 5.1 to 5.4)

The machine was on battery for every run below (macOS throttles the CPU; the display ran
at 60 Hz, so a frame is 16.7 ms and the 33 ms latency target means "no dropped frame").
The first headless runs also overlapped an unrelated compile (load average 12 to 15) and
are discarded. None of these numbers are baseline quality; the comparisons are made
within one run.

Headless F-LARGE (`npm run bench`, production build), p95 in ms, quietest run:

| Row | 2026-10-30 baseline (Bezier) | Bezier now | Orthogonal (radius 6) | Target |
| --- | --- | --- | --- | --- |
| scene + index build | 264 | 317 | 750 | <= 1000 |
| culling 1440x900, zoom 1 | 0.52 | 0.51 | 0.67 | <= 2 |
| culling 1440x900, zoom 0.5 | 1.36 | 1.25 | 1.89 | <= 2 |
| pick, zoom 1 | 0.17 | 0.17 | 0.11 | <= 2 |
| pick, fit-all zoom | 0.26 | 0.28 | 0.22 | <= 2 |
| culling at fit-all (whole world) | 20.1 (missed) | 21.9 (missed) | 32.9 (missed) | <= 2 |
| culling at fit-all viewport | 0.03 | 0.04 | 0.04 | <= 2 |
| one-node patch + scene/index update | 0.012 | 0.013 | 0.100 | <= 4 |

All targets the Bezier rows meet are met by the orthogonal rows; "culling at fit-all"
was already missed at the baseline (the view serves that query from its fit-all cache).
The orthogonal build costs about 2.4x the Bezier build, mostly index inserts: per-corner
pieces (D2) give about 60k pieces on F-LARGE instead of 35k. An experiment that keeps
a polyline shorter than 800 units as one piece brought the orthogonal build to 542 ms
p95 and culling at zoom 0.5 to 1.36 ms, the same as Bezier; it is not applied because D2
fixes one corner per piece (see Open questions). The incremental test confirms a
one-node move writes only that node's and its incident connections' piece keys with
orthogonal routes (PERF-04, IDX-02, ROU-08).

Browser, `BENCH_QUICK=1` (one 5 s run per workload), Bezier and orthogonal run back to
back in the same conditions, p95:

| F-LARGE workload (dpr 1 / 2) | Bezier frame / latency | Orthogonal frame / latency |
| --- | --- | --- |
| pan | 16.7 / 32.6, 16.8 / 33.2 | 16.7 / 33.2, 16.8 / 33.3 |
| zoom | 16.7 / 32.8, 16.7 / 33.1 | 16.7 / 32.5, 16.7 / 32.6 |
| drag | 16.8 / 31.4, 16.7 / 31.4 | 16.7 / 31.1, 16.8 / 30.9 |
| overview-pan (PERF-02e) | 33.3 / 38.4, 16.8 / 37.1 | 33.4 / 47.5, 33.4 / 46.5 |
| overview-zoom (PERF-02e) | 16.8 / 38.0, 33.3 / 41.9 | 33.4 / 45.6, 33.4 / 43.8 |

F-TYPICAL is the same for both (frame 16.7 to 16.8, latency 30.8 to 33.5). Culled pan,
zoom and drag on F-LARGE with orthogonal routes match Bezier: no dropped frames at
60 Hz, pick p95 at most 0.5 ms. The 2026-10-30 baseline ran on mains power at 120 Hz
(frame p95 about 10 ms, latency about 16 ms), so it is not directly comparable; against
the Bezier run of the same session the orthogonal rows show no regression outside the
overview. The overview frames sit at the 33.3 ms labelled PERF-02e target (33.4, one
dropped frame per two at 60 Hz) and latency is about 8 ms higher, because every wire
strokes three to five segments instead of one curve. A first orthogonal run measured
overview latency 51 to 61 ms; measuring the polyline box without allocating brought it
to 44 to 48 ms. The overview batching check passes with every wire orthogonal (same
bounded fill/stroke count, selected connection and error node still drawn).

PKG-08: a consumer bundling `createGeometryScene` and `createRouteRegistry` is 23,909
bytes minified (9,116 gzip); adding `createOrthogonalRouter` makes it 29,204 (11,074
gzip), so the orthogonal router is about 5.2 KiB minified, 1.9 KiB gzip, and is dropped
when unused.

## Gate results (task 7.1)

- `npm run lint`: 469 files, no findings.
- `npm run typecheck`: all four passes clean (including the core-only pass).
- `npm test`: 124 files, 739 tests passed (`src/architecture.test.ts` and, new, the
  `scripts/*.test.ts` files included).
- `npm run test:browser` (installed Google Chrome): 38 files, 186 tests passed.
- `npm run test:bench`: 32 tests passed. Bench browser project (overview batching, idle,
  frames): 10 tests passed in both route modes.
- `npm run build`: ok.
- `npm run bench:size` (gzip): core 34.6 KiB (budget 75), view 43.9 KiB (budget 150),
  advanced 26.7 KiB, react 43.9 KiB. All budgets met.
- Files over 300 lines among those changed: `src/view/mount-view.ts` (346, the accepted
  exception), and two existing test files that grew by a five-line helper
  (`geometry-scene.test.ts` 381, `picking.test.ts` 369). `path-geometry.ts` is 297,
  `examples/plain-js/main.ts` 297.

## Size

Measured with `git diff --numstat` from `d4c2427` to the end of this change, gzip from
`scripts/bundle-size.mjs` (exact bytes).

| Part | Lines added / removed |
| --- | --- |
| Library code (`src`, without tests) | +1257 / -85 |
| Tests (`src`) | +1645 / -19 |
| Bench, scripts, example | +204 / -74 |

Bundle (gzip): core 31,650 -> 35,405 bytes (+3,755: the core entry exports every
router), view 42,768 -> 44,930 (+2,162, of which the core it uses grows with the
scene's registry and routers), advanced 27,164 -> 27,300 (+136).

## Open questions

- **Short polylines as one index piece?** D2 gives every corner its own piece. On
  F-LARGE that makes the orthogonal scene build 2.4x the Bezier one and culling at zoom
  0.5 1.5x (1.89 ms p95 against a 2 ms target). Keeping a polyline shorter than 800
  units (the cubic piece length) as a single piece, still with every corner whole in one
  piece, measured 542 ms and 1.36 ms. Recommended for a follow-up if the margin matters;
  it changes D2 and the "one corner per piece" PERF-04 test.
- **Overview cost of orthogonal wires.** The overview frame p95 is at the 33.3 ms
  labelled target on battery. Drawing a polyline whose box is small on screen (for
  example under 12 CSS px) as a straight line, as cubics under 3 px already are, would
  cut most of the extra segments; it is a LAY-04 simplification choice for the user.
