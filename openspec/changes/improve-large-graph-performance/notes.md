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

## Task 7.1: culled F-LARGE pan at DPR 2 (not closed, reported)

### Profile

Perf demo (`examples/perf`, production build without minification so names survive,
`vite preview`), headless installed Chrome 156, 1440 x 900, DPR 2, F-LARGE at zoom 0.4
(about 680 nodes and 1.8k paths visible, `reduced` level, ports shown), "Continuous pan",
CPU profile at 100 µs sampling over 6 s (about 360 frames). The run itself reported 60
fps, p95 16.7 ms, p99 16.8 ms at 60 Hz.

Main-thread JavaScript per frame is about 9 ms (profiler on), almost all in the scene
paint:

| Inclusive part of the scene paint | Share | Per frame (ms) |
| --- | --- | --- |
| `paintConnections` (painter per wire) | 37% | 3.3 |
| `paintNodes` (painter per node) | 24% | 2.2 |
| `paintPorts` (glyph per port, no save/restore since 4.3) | 17% | 1.5 |
| `queryRect` (culled query, not the fit-all cache) | 17% | 1.6 |
| rest (grid, frame setup) | 5% | 0.4 |

Top self costs: canvas `save` 356 ms and `restore` 217 ms (together about 18% of frame
JavaScript; 437 ms of it is the per-wire `save`/`restore` in `paintConnections`), then
`fill`, `stroke`, `arc`, the painter bodies, and the AABB tree walk.

The largest remaining cost is the per-entity `save`/`restore` around node and connection
painters. Design D4 keeps it on purpose ("painters still get `save`/`restore`, because
they may change any state"); removing it is a painter contract change and out of this
change's scope. The second is the culled `queryRect` (sorting the ~2.5k visible
entries each frame); speeding it up further is not a small fix. Nothing was changed.

### Runs

Full `npm run bench:browser` (headless, 60 Hz, 3 x 30 s per workload), 14:26 to 14:53:
culled F-LARGE pan frame interval p50 / p95 / p99 16.7 / 16.7 / 16.8 ms at DPR 2 and
16.7 / 16.8 / 16.8 ms at DPR 1. At 60 Hz the p95 is one display period plus timestamp
jitter (F-TYPICAL pan shows the same 16.8), so the headless run cannot fail the workload
in a meaningful way. The DPR 2 p95 came out as 16.70000000001 and was reported as missed by
float noise; the status check now allows 1e-6 (commit 78a5079). The overview workloads:
p95 33.3 / 33.4 ms (DPR 1), 16.8 / 33.4 ms (DPR 2) for pan / zoom.

Headed baseline (`BENCH_BASELINE_SUFFIX=perf npm run bench:baseline`, 120 Hz display),
14:57 to 15:22, against the 2026-10-30 baseline (p95 / p99 ms):

| Row | 2026-10-30 | This run |
| --- | --- | --- |
| pan F-LARGE DPR 2 frame interval | 16.8 / 25.0 (missed) | 25.0 / 33.3 (missed) |
| pan F-LARGE DPR 2 latency | 24.0 / 30.0 | 35.6 / 52.4 (missed) |
| pan F-LARGE DPR 1 frame interval | 9.7 / 16.6 | 10.3 / 17.5 |
| drag F-LARGE DPR 1 / 2 pick | 2.7 / 2.7 (missed) | 0.5 / 0.7 (met) |
| overview-pan DPR 1 / 2 frame interval | - | 24.9 / 25.0 (met) |
| overview-zoom DPR 1 / 2 frame interval | - | 33.8 / 33.3 (DPR 1 missed) |
| node: snapshot validate (untouched code) | 75.8 | 275 |
| node: snapshot load (untouched code) | 203 | 368 |
| node: culling query at zoom 0.5 | 0.99 | 3.06 (missed) |

This run is not baseline quality: the machine was loaded by other processes during it
(load average 10 to 12 on 8 cores, 15 to 25% idle, mostly a separately running Chrome and
a Python process). Rows for code this change did not touch (snapshot validate, load and
diff) came out 1.8 to 3.6 times slower than on 2026-10-30, so the DPR 2 pan regression
cannot be attributed to the change from this run. It was not committed; the files are kept
outside the repository. The baseline has to be rerun on an idle machine before 7.3 and the
7.1 verdict on the headed 120 Hz display.
