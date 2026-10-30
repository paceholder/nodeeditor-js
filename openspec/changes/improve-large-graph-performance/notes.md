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

PERF-02e targets: frame interval p95 <= 33.3 ms (missed by about 5x), pick p95 <= 2 ms
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

PERF-02e (frame interval p95 <= 33.3 ms, pick p95 <= 2 ms) is met in this quick run, at
the boundary for frames: p95 is two display periods. Culled F-LARGE in the same run: pan
16.7 / 16.7 ms at DPR 1 and 2 (the DPR 2 miss of 16.8 ms is gone in this sample), drag
pick p95 1.0 ms (DPR 1) and 0.8 ms (DPR 2). Baseline-quality numbers come in task 7.3.
