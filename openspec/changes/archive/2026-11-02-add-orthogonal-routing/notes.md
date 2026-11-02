# Implementation notes

Deviations from design.md, clarifications made while implementing, observations, gate
results and size. The size baseline is `d4c2427` (the proposal commit, the same code as
the end of `add-connection-chooser`).

## Deviations and clarifications

- **`splitPath(polyline, count)` treats `count` as an upper bound**: a polyline's pieces
  follow its corners (D2; one piece when it is shorter than 800 units), so the count is
  not a free parameter; `pieceCount` of a
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
  offset (the shifted body box went through the unshifted inverse transform). Fixed
  with a browser test, and the fix was then folded into the view commit `ed10cce`
  (the history before the fold is tagged `pre-fold-ghost-fix`).

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
pieces (D2 as first written) give about 60k pieces on F-LARGE instead of 35k. An
experiment that keeps a polyline shorter than 800 units as one piece brought the
orthogonal build to 542 ms p95 and culling at zoom 0.5 to 1.36 ms, the same as Bezier;
the user approved it, and it is now applied (see "Follow-up on the open questions"). The incremental test confirms a
one-node move writes only that node's and its incident connections' piece keys with
orthogonal routes.

Browser, `BENCH_QUICK=1` (one 5 s run per workload), Bezier and orthogonal run back to
back in the same conditions, p95:

| F-LARGE workload (dpr 1 / 2) | Bezier frame / latency | Orthogonal frame / latency |
| --- | --- | --- |
| pan | 16.7 / 32.6, 16.8 / 33.2 | 16.7 / 33.2, 16.8 / 33.3 |
| zoom | 16.7 / 32.8, 16.7 / 33.1 | 16.7 / 32.5, 16.7 / 32.6 |
| drag | 16.8 / 31.4, 16.7 / 31.4 | 16.7 / 31.1, 16.8 / 30.9 |
| overview-pan | 33.3 / 38.4, 16.8 / 37.1 | 33.4 / 47.5, 33.4 / 46.5 |
| overview-zoom | 16.8 / 38.0, 33.3 / 41.9 | 33.4 / 45.6, 33.4 / 43.8 |

F-TYPICAL is the same for both (frame 16.7 to 16.8, latency 30.8 to 33.5). Culled pan,
zoom and drag on F-LARGE with orthogonal routes match Bezier: no dropped frames at
60 Hz, pick p95 at most 0.5 ms. The 2026-10-30 baseline ran on mains power at 120 Hz
(frame p95 about 10 ms, latency about 16 ms), so it is not directly comparable; against
the Bezier run of the same session the orthogonal rows show no regression outside the
overview. The overview frames sit at the 33.3 ms labelled target from the overview navigation target rule (33.4, one
dropped frame per two at 60 Hz) and latency is about 8 ms higher, because every wire
strokes three to five segments instead of one curve. A first orthogonal run measured
overview latency 51 to 61 ms; measuring the polyline box without allocating brought it
to 44 to 48 ms. The overview batching check passes with every wire orthogonal (same
bounded fill/stroke count, selected connection and error node still drawn).

The tree-shakable features and default preset rule: a consumer bundling `createGeometryScene` and `createRouteRegistry` is 23,909
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

## Open questions (resolved 2026-11-02)

Both approved by the user and done in task group 9:

- **Short polylines as one index piece: yes.** A polyline shorter than `PIECE_LENGTH`
  (800 units, the existing constant) is one piece; longer ones are split per corner as
  before, every corner whole inside one piece. D2 is revised with the reason. F-LARGE
  with every wire orthogonal now indexes 29,352 pieces (59,798 before; Bezier 34,650).
  Picking stays exact (the coarse box only narrows candidates); the tests from the indexed culling and picking rule now
  check "short is one piece" and "long keeps each corner whole in one piece", and the
  scene test checks both a short route (one piece, exact pick) and a long one (tight
  pieces).
- **Small orthogonal wires as a line in the overview: yes.** A polyline whose screen
  box is under 12 CSS px (`POLYLINE_LINE_BELOW_PX`, next to the cubic's
  `LINE_BELOW_PX = 3`) is stroked as one segment from start to end (D7). Normal
  zoom is unchanged.

## Follow-up on the open questions (task group 9)

Measured 2026-11-02 on AC power (`pmset -g batt`: "AC Power", charging). Headless
Chrome frames at 60 Hz (frame 16.7 ms), as in the earlier runs, so the latency target
still reads as "no dropped frame"; a system media-analysis process kept the load
average at about 4 to 10 during the runs (an unrelated compile at the start pushed it
above 30, and that first headless run is discarded).

Headless F-LARGE (`npm run bench`), p95 in ms, two quiet runs:

| Row | Bezier now | Orthogonal before (battery) | Orthogonal now | Target |
| --- | --- | --- | --- | --- |
| scene + index build | 295 / 312 | 750 | 534 / 524 | <= 1000 |
| culling 1440x900, zoom 1 | 0.51 / 0.55 | 0.67 | 0.42 / 0.42 | <= 2 |
| culling 1440x900, zoom 0.5 | 1.27 / 1.47 | 1.89 | 1.18 / 1.08 | <= 2 |
| pick, zoom 1 | 0.16 / 0.17 | 0.11 | 0.08 / 0.08 | <= 2 |
| pick, fit-all zoom | 0.28 / 0.27 | 0.22 | 0.17 / 0.16 | <= 2 |
| culling at fit-all (whole world) | 20.5 / 21.5 (missed) | 32.9 (missed) | 19.9 / 18.9 (missed) | <= 2 |
| one-node patch + scene/index update | 0.012 / 0.012 | 0.100 | 0.041 / 0.040 | <= 4 |

The orthogonal build is now about 1.7x the Bezier one (was 2.4x), and orthogonal
culling at zoom 0.5 is at or below Bezier, with margin to the 2 ms target.

Browser, `BENCH_QUICK=1`, Bezier then orthogonal back to back, F-LARGE p95 frame /
latency (dpr 1, dpr 2):

| Workload | Bezier | Orthogonal before (battery) | Orthogonal now |
| --- | --- | --- | --- |
| pan | 16.7 / 33.3, 16.7 / 33.3 | 16.7 / 33.2, 16.7 / 33.3 | 16.8 / 33.2, 16.7 / 33.2 |
| zoom | 16.7 / 32.8, 16.8 / 33.2 | 16.7 / 32.5, 16.7 / 32.6 | 16.7 / 33.2, 16.7 / 33.3 |
| drag | 16.7 / 31.9, 16.7 / 32.7 | 16.7 / 31.1, 16.8 / 30.9 | 16.7 / 32.8, 16.8 / 32.7 |
| overview-pan | 33.3 / 38.4, 33.3 / 37.0 | 33.4 / 47.5, 33.4 / 46.5 | 33.3 / 37.4, 33.3 / 32.4 |
| overview-zoom | 33.3 / 33.1, 33.3 / 32.0 | 33.4 / 45.6, 33.4 / 43.8 | 33.2 / 31.7, 16.8 / 33.1 |

The orthogonal overview latency dropped from 44 to 48 ms to 32 to 37 ms, the same as
Bezier in this session; the overview frame p95 sits at the 33.3 ms labelled target for
both route kinds. F-TYPICAL (Bezier): frame 16.7 to 16.8, latency 32.2 to 33.4. The
overview batching check passes in both route modes. Step 4 below (a baseline-quality
re-measure at 120 Hz like the 2026-10-30 baseline) is still open.

Gates after group 9: `npm run lint` 469 files, no findings; `npm run typecheck` clean;
`npm test` 124 files, 741 tests; `npm run test:browser` 38 files, 187 tests;
`npm run test:bench` 32 tests; bench browser project 10 tests in both route modes;
`npm run build` ok; `npm run bench:size` core 34.6 KiB, view 43.9 KiB, advanced
26.7 KiB, react 43.9 KiB (gzip), all budgets met.

## Documentation (group 8)

- `docs/geometry.md`: the polyline member and fitted radii, per-corner index pieces, and
  a routing section (router contract, registry per kind with a Bezier default, the
  orthogonal candidate set, validity, scoring, fallback, outcome scope and what is not
  avoided yet), with a Mermaid flowchart of the router.
- `docs/guide-view.md`: `routes` on `mountView` and the handle, `clearance` and
  `cornerRadius`, switching a kind live with `view.routes.replace`, the connect preview
  using `routes.defaultRouter`, and `route` in `ConnectionPaintInput`.
- `docs/architecture.md`: a QtNodes comparison row and section (QtNodes computes one
  cubic in its connection painter, with no routing step), `routing/` in the code map and
  the layer diagram, and the import order inside `space/`. The Mermaid blocks were not
  rendered in a browser this time (mermaid is not installed in the repo); the syntax
  follows the existing blocks.

## Status (2026-11-02)

Applied: all tasks ticked, gates green, not archived, nothing pushed. Before archiving:

1. Done 2026-11-02: the user tried the demo; "orthogonal wires look good".
2. Done 2026-11-02: the user approved both open questions; done in task group 9 and
   the perf gates re-run (see "Follow-up on the open questions").
3. Done: the ghost-preview fix is folded into the view commit `ed10cce`; the history
   before the fold is tagged `pre-fold-ghost-fix`.
4. Done 2026-11-02, reduced: the user found a full re-measure (4 runs, about 52 min)
   excessive, so one quick run replaced it (see "120 Hz quick check").
5. Archive with the spec sync (`/opsx:archive add-orthogonal-routing`).

## 120 Hz quick check (2026-11-02)

One quick headed run (`BENCH_QUICK=1 BENCH_HEADED=1 BENCH_DPR=2 BENCH_ROUTES=orthogonal`,
5 s and 1 repeat per workload, about 1.5 min) on mains power at 120 Hz. Quick numbers are
noisier than a baseline run; they are a sanity check, not a new baseline. p95, against the
Bezier 2026-10-30 baseline at DPR 2:

| Workload (F-LARGE) | Frame interval | Latency | Pick | Baseline latency (Bezier) |
| --- | --- | --- | --- | --- |
| pan | 9.2 | 17.0 | 0.2 | 21.2 |
| zoom | 9.1 | 16.2 | 0.2 | 16.8 |
| drag | 9.3 | 16.1 | 0.5 | 16.5 |
| overview-pan | 25.0 | 28.2 | 0.2 | 25.4 |
| overview-zoom | 25.0 | 26.1 | 0.3 | 31.8 |

F-TYPICAL pan, zoom and drag: frame interval p95 at most 9.1 ms, latency p95 at most 16.1
ms. Every target is met; orthogonal routes are level with the Bezier baseline.

The full browser bench (30 s, 3 repeats, two pixel ratios: about 13 min per ratio and
route mode) is to be made lighter in a separate small change, as the user asked.
