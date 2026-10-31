# Performance baseline 2026-10-30

- Commit: a6aa81899d99
- Build: production
- Browser: chrome 156.0.8078.80 (headed)
- Machine: darwin 25.6.0, Apple M1 Pro, 8 cores, 16 GiB

## Results

| Runtime | Workload | Fixture | DPR | Metric | p50 | p95 | p99 | Samples | Visible nodes/paths | Target | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| node | snapshot validate | F-LARGE | - | validateMs | 53.45 | 63.59 | 63.59 | 15 | - | - | no-target |
| node | snapshot load | F-LARGE | - | loadMs | 178 | 196 | 196 | 15 | - | - | no-target |
| node | snapshot export | F-LARGE | - | exportMs | 12.01 | 13.62 | 13.62 | 15 | - | - | no-target |
| node | snapshot diff (100 nodes moved) | F-LARGE | - | diffMs | 39.51 | 48.74 | 48.74 | 15 | - | - | no-target |
| node | scene + index build | F-LARGE | - | projectionBuildMs | 209 | 264 | 264 | 10 | - | p95 <= 1000 | met |
| node | culling query 1440x900 at zoom 1 | F-LARGE | - | candidateQueryMs | 0.35 | 0.52 | 0.64 | 1474 | - | p95 <= 2 | met |
| node | culling query 1440x900 at zoom 0.5 | F-LARGE | - | candidateQueryMs | 0.97 | 1.36 | 1.56 | 587 | - | p95 <= 2 | met |
| node | pick at random point (zoom 1) | F-LARGE | - | pickMs | 0.09 | 0.17 | 0.25 | 5325 | - | p95 <= 2 | met |
| node | pick at random point (fit-all zoom) | F-LARGE | - | pickMs | 0.15 | 0.26 | 0.45 | 3111 | - | p95 <= 2 | met |
| node | pick at random point (fit-all zoom, ports hidden) | F-LARGE | - | pickMs | 0.11 | 0.19 | 0.37 | 4406 | - | p95 <= 2 | met |
| node | culling query at fit-all | F-LARGE | - | candidateQueryMs | 18.09 | 20.13 | 20.55 | 64 | - | p95 <= 2 | missed |
| node | culling query at fit-all viewport | F-LARGE | - | candidateQueryMs | 0.02 | 0.03 | 0.40 | 18605 | - | p95 <= 2 | met |
| node | patch apply + scene/index update | F-LARGE | - | patchApplyMs | 0.01 | 0.01 | 0.02 | 47386 | - | p95 <= 4 | met |
| node | patch apply, model only | F-LARGE | - | patchApplyMs | 0.00 | 0.00 | 0.01 | 198751 | - | p95 <= 4 | met |
| browser | pan | F-LARGE | 1 | frameIntervalMs | 8.30 | 9.80 | 10.30 | 10793 | 677/1830 | p95 <= 16.7, p99 <= 33.3 | met |
| browser | pan | F-LARGE | 1 | latencyMs | 12.60 | 15.90 | 18.90 | 10794 | 677/1830 | p95 <= 33 | met |
| browser | pan | F-LARGE | 1 | pickMs | 0.20 | 0.30 | 0.40 | 10792 | 677/1830 | p95 <= 2 | met |
| browser | zoom | F-LARGE | 1 | frameIntervalMs | 8.30 | 10.00 | 10.30 | 10803 | 665/1808 | p95 <= 16.7, p99 <= 33.3 | met |
| browser | zoom | F-LARGE | 1 | latencyMs | 12.20 | 16.40 | 17.50 | 10803 | 665/1808 | p95 <= 33 | met |
| browser | zoom | F-LARGE | 1 | pickMs | 0.20 | 0.30 | 0.40 | 10801 | 665/1808 | p95 <= 2 | met |
| browser | drag | F-LARGE | 1 | frameIntervalMs | 8.30 | 10.10 | 10.30 | 10800 | 664/1807 | p95 <= 16.7, p99 <= 33.3 | met |
| browser | drag | F-LARGE | 1 | latencyMs | 12.40 | 16.40 | 17.80 | 10800 | 664/1807 | p95 <= 33 | met |
| browser | drag | F-LARGE | 1 | pickMs | 0.50 | 1.00 | 1.30 | 10800 | 664/1807 | p95 <= 2 | met |
| browser | overview-pan | F-LARGE | 1 | frameIntervalMs | 8.30 | 16.80 | 25.10 | 9258 | 10000/20000 | p95 <= 33.3 | met |
| browser | overview-pan | F-LARGE | 1 | latencyMs | 13.60 | 24.60 | 29.30 | 9258 | 10000/20000 | p95 <= 33 | met |
| browser | overview-pan | F-LARGE | 1 | pickMs | 0.00 | 0.20 | 0.30 | 9258 | 10000/20000 | p95 <= 2 | met |
| browser | overview-zoom | F-LARGE | 1 | frameIntervalMs | 16.60 | 25.10 | 33.30 | 6142 | 10000/20000 | p95 <= 33.3 | met |
| browser | overview-zoom | F-LARGE | 1 | latencyMs | 18.00 | 29.90 | 33.40 | 6141 | 10000/20000 | p95 <= 33 | met |
| browser | overview-zoom | F-LARGE | 1 | pickMs | 0.30 | 0.40 | 0.40 | 6141 | 10000/20000 | p95 <= 2 | met |
| browser | pan | F-LARGE | 2 | frameIntervalMs | 8.40 | 16.60 | 18.10 | 9599 | 677/1830 | p95 <= 16.7, p99 <= 33.3 | met |
| browser | pan | F-LARGE | 2 | latencyMs | 14.30 | 21.20 | 26.40 | 9600 | 677/1830 | p95 <= 33 | met |
| browser | pan | F-LARGE | 2 | pickMs | 0.20 | 0.30 | 0.40 | 9600 | 677/1830 | p95 <= 2 | met |
| browser | zoom | F-LARGE | 2 | frameIntervalMs | 8.30 | 10.10 | 15.50 | 10651 | 665/1808 | p95 <= 16.7, p99 <= 33.3 | met |
| browser | zoom | F-LARGE | 2 | latencyMs | 12.30 | 16.80 | 18.90 | 10650 | 665/1808 | p95 <= 33 | met |
| browser | zoom | F-LARGE | 2 | pickMs | 0.20 | 0.30 | 0.40 | 10650 | 665/1808 | p95 <= 2 | met |
| browser | drag | F-LARGE | 2 | frameIntervalMs | 8.30 | 10.10 | 10.30 | 10803 | 664/1807 | p95 <= 16.7, p99 <= 33.3 | met |
| browser | drag | F-LARGE | 2 | latencyMs | 12.50 | 16.50 | 17.90 | 10803 | 664/1807 | p95 <= 33 | met |
| browser | drag | F-LARGE | 2 | pickMs | 0.50 | 0.90 | 1.30 | 10802 | 664/1807 | p95 <= 2 | met |
| browser | overview-pan | F-LARGE | 2 | frameIntervalMs | 8.30 | 16.80 | 25.10 | 9269 | 10000/20000 | p95 <= 33.3 | met |
| browser | overview-pan | F-LARGE | 2 | latencyMs | 13.70 | 25.40 | 30.40 | 9271 | 10000/20000 | p95 <= 33 | met |
| browser | overview-pan | F-LARGE | 2 | pickMs | 0.00 | 0.20 | 0.30 | 9268 | 10000/20000 | p95 <= 2 | met |
| browser | overview-zoom | F-LARGE | 2 | frameIntervalMs | 9.70 | 25.10 | 33.30 | 6396 | 10000/20000 | p95 <= 33.3 | met |
| browser | overview-zoom | F-LARGE | 2 | latencyMs | 18.60 | 31.80 | 34.20 | 6398 | 10000/20000 | p95 <= 33 | met |
| browser | overview-zoom | F-LARGE | 2 | pickMs | 0.30 | 0.40 | 0.40 | 6396 | 10000/20000 | p95 <= 2 | met |
| browser | pan | F-TYPICAL | 1 | frameIntervalMs | 8.30 | 9.10 | 9.30 | 10803 | 126/402 | p95 <= 16.7, p99 <= 33.3 | met |
| browser | pan | F-TYPICAL | 1 | latencyMs | 11.70 | 16.40 | 21.30 | 10803 | 126/402 | p95 <= 33 | met |
| browser | pan | F-TYPICAL | 1 | pickMs | 0.10 | 0.20 | 0.20 | 10803 | 126/402 | p95 <= 2 | met |
| browser | zoom | F-TYPICAL | 1 | frameIntervalMs | 8.30 | 9.00 | 9.30 | 10800 | 1000/2000 | p95 <= 16.7, p99 <= 33.3 | met |
| browser | zoom | F-TYPICAL | 1 | latencyMs | 12.00 | 16.00 | 16.70 | 10800 | 1000/2000 | p95 <= 33 | met |
| browser | zoom | F-TYPICAL | 1 | pickMs | 0.10 | 0.20 | 0.20 | 10799 | 1000/2000 | p95 <= 2 | met |
| browser | drag | F-TYPICAL | 1 | frameIntervalMs | 8.30 | 9.30 | 10.20 | 10805 | 122/375 | p95 <= 16.7, p99 <= 33.3 | met |
| browser | drag | F-TYPICAL | 1 | latencyMs | 12.30 | 16.00 | 17.20 | 10805 | 122/375 | p95 <= 33 | met |
| browser | drag | F-TYPICAL | 1 | pickMs | 0.20 | 0.30 | 0.40 | 10804 | 122/375 | p95 <= 2 | met |
| browser | pan | F-TYPICAL | 2 | frameIntervalMs | 8.30 | 9.90 | 10.20 | 10803 | 126/402 | p95 <= 16.7, p99 <= 33.3 | met |
| browser | pan | F-TYPICAL | 2 | latencyMs | 12.00 | 16.50 | 22.10 | 10803 | 126/402 | p95 <= 33 | met |
| browser | pan | F-TYPICAL | 2 | pickMs | 0.10 | 0.20 | 0.20 | 10803 | 126/402 | p95 <= 2 | met |
| browser | zoom | F-TYPICAL | 2 | frameIntervalMs | 8.30 | 9.90 | 10.30 | 10799 | 1000/2000 | p95 <= 16.7, p99 <= 33.3 | met |
| browser | zoom | F-TYPICAL | 2 | latencyMs | 12.20 | 16.30 | 17.40 | 10799 | 1000/2000 | p95 <= 33 | met |
| browser | zoom | F-TYPICAL | 2 | pickMs | 0.10 | 0.20 | 0.20 | 10797 | 1000/2000 | p95 <= 2 | met |
| browser | drag | F-TYPICAL | 2 | frameIntervalMs | 8.30 | 10.10 | 10.30 | 10805 | 122/375 | p95 <= 16.7, p99 <= 33.3 | met |
| browser | drag | F-TYPICAL | 2 | latencyMs | 12.50 | 16.50 | 17.80 | 10805 | 122/375 | p95 <= 33 | met |
| browser | drag | F-TYPICAL | 2 | pickMs | 0.20 | 0.30 | 0.50 | 10804 | 122/375 | p95 <= 2 | met |
| browser | idle | F-TYPICAL | 1 | idleFrameRequests | 0.00 | 0.00 | 0.00 | 1 | - | p95 <= 0, p99 <= 0 | met |
| browser | idle | F-TYPICAL | 2 | idleFrameRequests | 0.00 | 0.00 | 0.00 | 1 | - | p95 <= 0, p99 <= 0 | met |

## Bundle size (gzip)

| Entry | Size KiB | Budget KiB | Status |
| --- | --- | --- | --- |
| core | 27.4 | 75.0 | met |
| view | 28.3 | 150.0 | met |
| advanced | 13.6 | - | no-target |
| react | 28.3 | - | no-target |

## Comparison with 2026-10-30-chrome.json

Earlier run: commit 69cc8b014f07, chrome 156.0.8078.80 (headed).

| Runtime | Workload | Fixture | DPR | Metric | p95 before | p95 now | p99 before | p99 now | Status before | Status now |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| node | snapshot validate | F-LARGE | - | validateMs | 75.83 | 63.59 | 75.83 | 63.59 | no-target | no-target |
| node | snapshot load | F-LARGE | - | loadMs | 203 | 196 | 203 | 196 | no-target | no-target |
| node | snapshot export | F-LARGE | - | exportMs | 20.54 | 13.62 | 20.54 | 13.62 | no-target | no-target |
| node | snapshot diff (100 nodes moved) | F-LARGE | - | diffMs | 43.55 | 48.74 | 43.55 | 48.74 | no-target | no-target |
| node | scene + index build | F-LARGE | - | projectionBuildMs | 156 | 264 | 156 | 264 | met | met |
| node | culling query 1440x900 at zoom 1 | F-LARGE | - | candidateQueryMs | 0.44 | 0.52 | 0.52 | 0.64 | met | met |
| node | culling query 1440x900 at zoom 0.5 | F-LARGE | - | candidateQueryMs | 0.99 | 1.36 | 1.17 | 1.56 | met | met |
| node | pick at random point (zoom 1) | F-LARGE | - | pickMs | 0.55 | 0.17 | 0.82 | 0.25 | met | met |
| node | pick at random point (fit-all zoom) | F-LARGE | - | pickMs | - | 0.26 | - | 0.45 | - | met |
| node | pick at random point (fit-all zoom, ports hidden) | F-LARGE | - | pickMs | - | 0.19 | - | 0.37 | - | met |
| node | culling query at fit-all | F-LARGE | - | candidateQueryMs | - | 20.13 | - | 20.55 | - | missed |
| node | culling query at fit-all viewport | F-LARGE | - | candidateQueryMs | - | 0.03 | - | 0.40 | - | met |
| node | patch apply + scene/index update | F-LARGE | - | patchApplyMs | 0.01 | 0.01 | 0.02 | 0.02 | met | met |
| node | patch apply, model only | F-LARGE | - | patchApplyMs | 0.00 | 0.00 | 0.01 | 0.01 | met | met |
| browser | pan | F-LARGE | 1 | frameIntervalMs | 9.70 | 9.80 | 16.60 | 10.30 | met | met |
| browser | pan | F-LARGE | 1 | latencyMs | 17.10 | 15.90 | 19.80 | 18.90 | met | met |
| browser | pan | F-LARGE | 1 | pickMs | 0.90 | 0.30 | 1.20 | 0.40 | met | met |
| browser | zoom | F-LARGE | 1 | frameIntervalMs | 9.30 | 10.00 | 10.10 | 10.30 | met | met |
| browser | zoom | F-LARGE | 1 | latencyMs | 16.40 | 16.40 | 17.10 | 17.50 | met | met |
| browser | zoom | F-LARGE | 1 | pickMs | 0.90 | 0.30 | 1.10 | 0.40 | met | met |
| browser | drag | F-LARGE | 1 | frameIntervalMs | 9.60 | 10.10 | 10.20 | 10.30 | met | met |
| browser | drag | F-LARGE | 1 | latencyMs | 16.60 | 16.40 | 18.10 | 17.80 | met | met |
| browser | drag | F-LARGE | 1 | pickMs | 2.70 | 1.00 | 3.50 | 1.30 | missed | met |
| browser | overview-pan | F-LARGE | 1 | frameIntervalMs | - | 16.80 | - | 25.10 | - | met |
| browser | overview-pan | F-LARGE | 1 | latencyMs | - | 24.60 | - | 29.30 | - | met |
| browser | overview-pan | F-LARGE | 1 | pickMs | - | 0.20 | - | 0.30 | - | met |
| browser | overview-zoom | F-LARGE | 1 | frameIntervalMs | - | 25.10 | - | 33.30 | - | met |
| browser | overview-zoom | F-LARGE | 1 | latencyMs | - | 29.90 | - | 33.40 | - | met |
| browser | overview-zoom | F-LARGE | 1 | pickMs | - | 0.40 | - | 0.40 | - | met |
| browser | pan | F-LARGE | 2 | frameIntervalMs | 16.80 | 16.60 | 25.00 | 18.10 | missed | met |
| browser | pan | F-LARGE | 2 | latencyMs | 24.00 | 21.20 | 30.00 | 26.40 | met | met |
| browser | pan | F-LARGE | 2 | pickMs | 0.90 | 0.30 | 1.10 | 0.40 | met | met |
| browser | zoom | F-LARGE | 2 | frameIntervalMs | 16.60 | 10.10 | 23.90 | 15.50 | met | met |
| browser | zoom | F-LARGE | 2 | latencyMs | 21.90 | 16.80 | 28.40 | 18.90 | met | met |
| browser | zoom | F-LARGE | 2 | pickMs | 1.10 | 0.30 | 1.40 | 0.40 | met | met |
| browser | drag | F-LARGE | 2 | frameIntervalMs | 9.60 | 10.10 | 10.20 | 10.30 | met | met |
| browser | drag | F-LARGE | 2 | latencyMs | 16.70 | 16.50 | 18.30 | 17.90 | met | met |
| browser | drag | F-LARGE | 2 | pickMs | 2.70 | 0.90 | 3.50 | 1.30 | missed | met |
| browser | overview-pan | F-LARGE | 2 | frameIntervalMs | - | 16.80 | - | 25.10 | - | met |
| browser | overview-pan | F-LARGE | 2 | latencyMs | - | 25.40 | - | 30.40 | - | met |
| browser | overview-pan | F-LARGE | 2 | pickMs | - | 0.20 | - | 0.30 | - | met |
| browser | overview-zoom | F-LARGE | 2 | frameIntervalMs | - | 25.10 | - | 33.30 | - | met |
| browser | overview-zoom | F-LARGE | 2 | latencyMs | - | 31.80 | - | 34.20 | - | met |
| browser | overview-zoom | F-LARGE | 2 | pickMs | - | 0.40 | - | 0.40 | - | met |
| browser | pan | F-TYPICAL | 1 | frameIntervalMs | 9.50 | 9.10 | 10.10 | 9.30 | met | met |
| browser | pan | F-TYPICAL | 1 | latencyMs | 16.40 | 16.40 | 21.10 | 21.30 | met | met |
| browser | pan | F-TYPICAL | 1 | pickMs | 0.20 | 0.20 | 0.20 | 0.20 | met | met |
| browser | zoom | F-TYPICAL | 1 | frameIntervalMs | 9.60 | 9.00 | 10.30 | 9.30 | met | met |
| browser | zoom | F-TYPICAL | 1 | latencyMs | 16.50 | 16.00 | 18.00 | 16.70 | met | met |
| browser | zoom | F-TYPICAL | 1 | pickMs | 0.20 | 0.20 | 0.30 | 0.20 | met | met |
| browser | drag | F-TYPICAL | 1 | frameIntervalMs | 9.70 | 9.30 | 10.20 | 10.20 | met | met |
| browser | drag | F-TYPICAL | 1 | latencyMs | 16.30 | 16.00 | 17.50 | 17.20 | met | met |
| browser | drag | F-TYPICAL | 1 | pickMs | 0.50 | 0.30 | 0.70 | 0.40 | met | met |
| browser | pan | F-TYPICAL | 2 | frameIntervalMs | 9.50 | 9.90 | 10.10 | 10.20 | met | met |
| browser | pan | F-TYPICAL | 2 | latencyMs | 16.40 | 16.50 | 21.10 | 22.10 | met | met |
| browser | pan | F-TYPICAL | 2 | pickMs | 0.20 | 0.20 | 0.20 | 0.20 | met | met |
| browser | zoom | F-TYPICAL | 2 | frameIntervalMs | 9.60 | 9.90 | 10.30 | 10.30 | met | met |
| browser | zoom | F-TYPICAL | 2 | latencyMs | 16.50 | 16.30 | 17.90 | 17.40 | met | met |
| browser | zoom | F-TYPICAL | 2 | pickMs | 0.20 | 0.20 | 0.30 | 0.20 | met | met |
| browser | drag | F-TYPICAL | 2 | frameIntervalMs | 9.70 | 10.10 | 10.20 | 10.30 | met | met |
| browser | drag | F-TYPICAL | 2 | latencyMs | 16.40 | 16.50 | 17.70 | 17.80 | met | met |
| browser | drag | F-TYPICAL | 2 | pickMs | 0.60 | 0.30 | 0.80 | 0.50 | met | met |
| browser | idle | F-TYPICAL | 1 | idleFrameRequests | 0.00 | 0.00 | 0.00 | 0.00 | met | met |
| browser | idle | F-TYPICAL | 2 | idleFrameRequests | 0.00 | 0.00 | 0.00 | 0.00 | met | met |

| Bundle entry | KiB before | KiB now |
| --- | --- | --- |
| core | 26.1 | 27.4 |
| view | 45.2 | 28.3 |
| advanced | - | 13.6 |
| react | 45.2 | 28.3 |

## Notes

- Frame interval is the gap between consecutive requestAnimationFrame timestamps while a scripted workload dispatches one input event per frame. Pooled over 3 repeats of 30 s after a 1 s warm-up each; never pooled across DPRs.
- Pointer-to-preview latency approximates presentation time: the first animation frame after the one that painted the input's preview, minus the event's dispatch time. Events are dispatched at a random phase of the frame (seeded), as device input arrives. The floor is one display period and the ceiling two, so on a 60 Hz display the 33 ms target means no dropped frame; a 120 Hz display (the headed Mac) has more headroom.
- Picking time is one ViewHandle.pick call per frame at the pointer position, timed with performance.now() (100 microsecond resolution in this browser).
- F-LARGE workloads keep the zoom at or above 0.4 so at most about 1k nodes are visible; F-TYPICAL pan and drag run at zoom 1, its zoom sweep covers 0.25 to 2.
- overview-pan and overview-zoom run F-LARGE at fit-all zoom with every node visible, the sweep from 0.8 to 1.25 times the fit zoom; their frame-interval target is p95 <= 33.3 ms. Gesture bitmap reuse is off, so every frame is an exact repaint.
- Browser ran headed on a real display.

## Missed targets

- culling query at fit-all / F-LARGE / candidateQueryMs: p95 20.13, p99 20.55 (target p95 <= 2)
