# Notes

## Before (task 1.1)

Measured at commit de21154 (before any change in this proposal), production build,
headless Chrome, `BENCH_QUICK=1` (one 5 s run per workload, so a 5 s sample, not baseline
quality). F-LARGE fit-all is zoom 0.95 of the fit zoom (every node visible); the zoom
sweep runs 0.8 to 1.25 times that. Gesture bitmap reuse does not exist yet. Frame
intervals are quantized to the display period (16.7 ms), so 50 and 166.7 ms are 3 and 10
frames.

| Workload | DPR | Frame interval p50 / p95 (ms) | Latency p95 (ms) | Pick p95 (ms) | Visible nodes / paths |
| --- | --- | --- | --- | --- | --- |
| overview-pan | 1 | 50.0 / 166.6 | 191.3 | 1.4 | 9865 / 19950 |
| overview-pan | 2 | 50.0 / 166.6 | 190.8 | 1.3 | 10000 / 20000 |
| overview-zoom | 1 | 166.7 / 183.4 | 190.8 | 4.4 | 10000 / 20000 |
| overview-zoom | 2 | 83.4 / 183.4 | 188.4 | 4.4 | 10000 / 20000 |

targets from The overview navigation target rule: frame interval p95 <= 33.3 ms (missed by about 5x), pick p95 <= 2 ms
(zoom pick p95 is noisy at n = 34; a rerun gave 1.4 ms at DPR 1). For comparison, culled
F-LARGE pan at zoom 0.4 is 16.7 / 16.7 ms with 675 nodes visible.

## Before (task 1.2)

Headless (Node), F-LARGE, `npm run bench`, same commit (ms):

| Case | p50 | p95 | p99 |
| --- | --- | --- | --- |
| pick at random point (zoom 1) | 0.43 | 1.07 | 1.66 |
| pick at random point (fit-all zoom) | 0.48 | 1.03 | 1.34 |
| culling query 1440x900 at zoom 1 | 0.44 | 0.80 | 1.12 |
| culling query at fit-all (whole world) | 27.70 | 30.83 | 32.60 |

The fit-all `queryRect` alone costs about 28 ms, which is most of the frame budget for
the overview and the target of D2.

## Fit-all viewport query (after group 3, measured with groups 4–5)

The existing "culling query at fit-all" case queries the bare world box, which does not
contain every indexed bound (long wires and node edges stick out), so it never hits the
full-view cache of D2. A new case, "culling query at fit-all viewport", queries the
visible world rectangle of the fit-all viewport (world box plus the 5% margin), which is
what the view asks for. Headless, F-LARGE, `npm run bench` (ms):

| Commit | Case | p50 | p95 | p99 |
| --- | --- | --- | --- | --- |
| de21154 (before the change) | fit-all viewport | 24.61 | 29.01 | 29.73 |
| groups 1–2, before D2 | fit-all viewport | 38.12 | 42.15 | 43.44 |
| groups 1–5 | fit-all viewport | 0.03 | 0.05 | 0.78 |
| groups 1–5 | fit-all (bare world box, uncached) | 21.42 | 23.74 | 24.19 |

Segment indexing alone made the uncached fit-all query slower; D2's sorting
brings it back under the original, and the cache removes it from repeated fit-all frames.
Picking at the fit-all zoom: p95 0.36 ms with ports, 0.27 ms with `ports: false` (what the
view passes there), against 0.87 ms at de21154.

## After groups 4–5

Same setup as task 1.1 (`BENCH_QUICK=1 npm run bench:browser`, headless installed Chrome
156, production build, one 5 s run per workload). The DPR 2 frame workloads were rerun on
their own (`BENCH_DPR=2`, frames file only) after the first run lost its browser
connection mid-file. At F-LARGE fit-all the zoom is about 0.1, so every frame is
`overview` (batched, no painters) with ports hidden.

| Workload | DPR | Frame interval p50 / p95 (ms) | Latency p95 (ms) | Pick p95 (ms) | Visible nodes / paths |
| --- | --- | --- | --- | --- | --- |
| overview-pan | 1 | 16.7 / 33.3 (was 50.0 / 166.6) | 41.2 (was 191.3) | 0.3 (was 1.4) | 10000 / 20000 |
| overview-pan | 2 | 16.7 / 33.3 (was 50.0 / 166.6) | 42.7 (was 190.8) | 0.3 (was 1.3) | 10000 / 20000 |
| overview-zoom | 1 | 16.7 / 33.3 (was 166.7 / 183.4) | 40.7 (was 190.8) | 0.4 (was 4.4) | 10000 / 20000 |
| overview-zoom | 2 | 16.7 / 33.3 (was 83.4 / 183.4) | 44.5 (was 188.4) | 0.4 (was 4.4) | 10000 / 20000 |

The overview navigation target rule (frame interval p95 <= 33.3 ms, pick p95 <= 2 ms) is met in this quick run, at
the boundary for frames: p95 is two display periods. Culled F-LARGE in the same run: pan
16.7 / 16.7 ms at DPR 1 and 2 (the DPR 2 miss of 16.8 ms is gone in this sample), drag
pick p95 1.0 ms (DPR 1) and 0.8 ms (DPR 2). Baseline-quality numbers come in task 7.3.

## After group 6

Gesture bitmap reuse (D5) was measured with the perf demo (`examples/perf`, production
build via `vite preview`, installed Chrome headless through Playwright, 1440 x 900,
F-LARGE). Each row is one 12 s stress run. The toggle is the demo's "Gesture bitmap"
checkbox (`gestureBitmap: {}`), so the defaults apply: `minVisible` 3000, `settleMs` 120,
`maxZoomRatio` 1.25 and `maxUncovered` 0.25. "Exact / reused" counts scene frames since
mount (`renderStats().scenePaints`), including the wheel steps that set the start zoom.
No console errors or warnings appeared in any run, dev server or preview.

### First version, without the staleness limit

A continuous gesture never rests, so the settle repaint never came and the stored copy
only grew staler:

- In the zoom sweep, the fit-all frame was scaled up 3x or more, so nodes became blurred
  blocks and wires a blue haze.
- In the continuous pan, the copy slid off screen, and 4 s in the view showed only the
  grid.

| Run | DPR | Off: fps, p95 / p99 (ms) | On: fps, p95 / p99 (ms) | On: exact / reused |
| --- | --- | --- | --- | --- |
| Zoom sweep | 1 | 54, 33.3 / 33.4 | 60, 16.7 / 16.8 | 4 / 709 |
| Zoom sweep | 2 | 52, 33.4 / 33.4 | 60, 16.8 / 16.8 | 4 / 708 |
| Pan at zoom 0.21 (minimal) | 1 | 58, 16.8 / 33.4 | 60, 16.7 / 16.8 | 16 / 716 |
| Pan at zoom 0.1 (overview) | 1 | 58, 16.8 / 33.3 | 60, 16.8 / 16.8 | 21 / 726 |

### With the staleness limit (final)

A frame reuses the copy only while the zoom ratio to it stays within [0.8, 1.25] and at
most a quarter of the view is uncovered. Otherwise the frame is exact, which also
refreshes the copy.

| Run | DPR | Off: fps, p95 / p99 (ms) | On: fps, p95 / p99 (ms) | On: exact / reused |
| --- | --- | --- | --- | --- |
| Zoom sweep (fit-all to 1:1 and back) | 1 | 51, 33.4 / 50.0 | 59, 16.8 / 33.3 | 355 / 342 |
| Zoom sweep | 2 | 49, 33.4 / 50.1 | 58, 16.8 / 33.4 | 357 / 348 |
| Pan at zoom 0.4 (reduced, culled) | 1 | 59, 16.8 / 16.8 | 59, 16.7 / 16.8 | 707 / 0 |
| Pan at zoom 0.4 (reduced, culled) | 2 | 60, 16.7 / 16.8 | 60, 16.7 / 16.8 | 711 / 0 |
| Pan at zoom 0.21 (minimal) | 1 | 57, 16.8 / 33.4 | 60, 16.8 / 16.8 | 504 / 222 |
| Pan at zoom 0.1 (overview, fit-all) | 1 | 58, 16.8 / 33.3 | 60, 16.7 / 16.8 | 548 / 200 |
| Pan at zoom 0.1 (overview, fit-all) | 2 | 58, 16.8 / 33.4 | 60, 16.8 / 16.8 | 563 / 197 |

Most exact frames in the "on" runs are cheap: they come where fewer than `minVisible`
entities are visible, which happens when the sweep is zoomed in or the circular pan
passes the graph's edge. In those frames reuse is off, and the exact paint is fast
anyway. The bitmap carries the expensive large-visible-set frames between bound
crossings.

Where it helps:

- It brings the zoom sweep p95 from 33 ms to 16.8 ms at both DPRs.
- It removes the 33 ms p99 frames in the minimal and overview pans.
- It never engages in the culled pan at 0.4 (about 3k entities, at or under
  `minVisible`).

Seen in the demo with the option on:

- Mid-sweep at zoom 0.31, 4.4k entities visible, a reused frame: the image is readable,
  with labels slightly soft (at most 1.25x upscaling).
- 4 s into the pan at zoom 0.23: the graph is drawn, and the empty lower part is the
  graph's edge. The exact frame after Stop shows the same edge.
