# Performance baseline 2026-10-30

- Commit: 69cc8b014f07
- Build: production
- Browser: chrome 156.0.8078.80 (headed)
- Machine: darwin 25.6.0, Apple M1 Pro, 8 cores, 16 GiB

## Results

| Runtime | Workload | Fixture | DPR | Metric | p50 | p95 | p99 | Samples | Visible nodes/paths | Target | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| node | snapshot validate | F-LARGE | - | validateMs | 54.97 | 75.83 | 75.83 | 15 | - | - | no-target |
| node | snapshot load | F-LARGE | - | loadMs | 180 | 203 | 203 | 15 | - | - | no-target |
| node | snapshot export | F-LARGE | - | exportMs | 12.37 | 20.54 | 20.54 | 15 | - | - | no-target |
| node | snapshot diff (100 nodes moved) | F-LARGE | - | diffMs | 40.13 | 43.55 | 43.55 | 15 | - | - | no-target |
| node | scene + index build | F-LARGE | - | projectionBuildMs | 125 | 156 | 156 | 10 | - | p95 <= 1000 | met |
| node | culling query 1440x900 at zoom 1 | F-LARGE | - | candidateQueryMs | 0.32 | 0.44 | 0.52 | 1659 | - | p95 <= 2 | met |
| node | culling query 1440x900 at zoom 0.5 | F-LARGE | - | candidateQueryMs | 0.73 | 0.99 | 1.17 | 780 | - | p95 <= 2 | met |
| node | pick at random point (zoom 1) | F-LARGE | - | pickMs | 0.26 | 0.55 | 0.82 | 1776 | - | p95 <= 2 | met |
| node | patch apply + scene/index update | F-LARGE | - | patchApplyMs | 0.01 | 0.01 | 0.02 | 59892 | - | p95 <= 4 | met |
| node | patch apply, model only | F-LARGE | - | patchApplyMs | 0.00 | 0.00 | 0.01 | 201212 | - | p95 <= 4 | met |
| browser | pan | F-LARGE | 1 | frameIntervalMs | 8.30 | 9.70 | 16.60 | 10622 | 677/1947 | p95 <= 16.7, p99 <= 33.3 | met |
| browser | pan | F-LARGE | 1 | latencyMs | 12.80 | 17.10 | 19.80 | 10624 | 677/1947 | p95 <= 33 | met |
| browser | pan | F-LARGE | 1 | pickMs | 0.70 | 0.90 | 1.20 | 10623 | 677/1947 | p95 <= 2 | met |
| browser | zoom | F-LARGE | 1 | frameIntervalMs | 8.30 | 9.30 | 10.10 | 10795 | 665/1913 | p95 <= 16.7, p99 <= 33.3 | met |
| browser | zoom | F-LARGE | 1 | latencyMs | 11.90 | 16.40 | 17.10 | 10793 | 665/1913 | p95 <= 33 | met |
| browser | zoom | F-LARGE | 1 | pickMs | 0.70 | 0.90 | 1.10 | 10795 | 665/1913 | p95 <= 2 | met |
| browser | drag | F-LARGE | 1 | frameIntervalMs | 8.30 | 9.60 | 10.20 | 10802 | 664/1912 | p95 <= 16.7, p99 <= 33.3 | met |
| browser | drag | F-LARGE | 1 | latencyMs | 12.30 | 16.60 | 18.10 | 10800 | 664/1912 | p95 <= 33 | met |
| browser | drag | F-LARGE | 1 | pickMs | 1.60 | 2.70 | 3.50 | 10801 | 664/1912 | p95 <= 2 | missed |
| browser | pan | F-LARGE | 2 | frameIntervalMs | 8.40 | 16.80 | 25.00 | 9046 | 677/1947 | p95 <= 16.7, p99 <= 33.3 | missed |
| browser | pan | F-LARGE | 2 | latencyMs | 15.50 | 24.00 | 30.00 | 9047 | 677/1947 | p95 <= 33 | met |
| browser | pan | F-LARGE | 2 | pickMs | 0.70 | 0.90 | 1.10 | 9045 | 677/1947 | p95 <= 2 | met |
| browser | zoom | F-LARGE | 2 | frameIntervalMs | 8.30 | 16.60 | 23.90 | 9808 | 665/1913 | p95 <= 16.7, p99 <= 33.3 | met |
| browser | zoom | F-LARGE | 2 | latencyMs | 13.10 | 21.90 | 28.40 | 9807 | 665/1913 | p95 <= 33 | met |
| browser | zoom | F-LARGE | 2 | pickMs | 0.80 | 1.10 | 1.40 | 9807 | 665/1913 | p95 <= 2 | met |
| browser | drag | F-LARGE | 2 | frameIntervalMs | 8.30 | 9.60 | 10.20 | 10801 | 664/1912 | p95 <= 16.7, p99 <= 33.3 | met |
| browser | drag | F-LARGE | 2 | latencyMs | 12.40 | 16.70 | 18.30 | 10799 | 664/1912 | p95 <= 33 | met |
| browser | drag | F-LARGE | 2 | pickMs | 1.50 | 2.70 | 3.50 | 10799 | 664/1912 | p95 <= 2 | missed |
| browser | pan | F-TYPICAL | 1 | frameIntervalMs | 8.30 | 9.50 | 10.10 | 10803 | 126/412 | p95 <= 16.7, p99 <= 33.3 | met |
| browser | pan | F-TYPICAL | 1 | latencyMs | 11.70 | 16.40 | 21.10 | 10803 | 126/412 | p95 <= 33 | met |
| browser | pan | F-TYPICAL | 1 | pickMs | 0.10 | 0.20 | 0.20 | 10803 | 126/412 | p95 <= 2 | met |
| browser | zoom | F-TYPICAL | 1 | frameIntervalMs | 8.30 | 9.60 | 10.30 | 10732 | 1000/2000 | p95 <= 16.7, p99 <= 33.3 | met |
| browser | zoom | F-TYPICAL | 1 | latencyMs | 12.20 | 16.50 | 18.00 | 10732 | 1000/2000 | p95 <= 33 | met |
| browser | zoom | F-TYPICAL | 1 | pickMs | 0.10 | 0.20 | 0.30 | 10731 | 1000/2000 | p95 <= 2 | met |
| browser | drag | F-TYPICAL | 1 | frameIntervalMs | 8.30 | 9.70 | 10.20 | 10799 | 122/381 | p95 <= 16.7, p99 <= 33.3 | met |
| browser | drag | F-TYPICAL | 1 | latencyMs | 12.30 | 16.30 | 17.50 | 10798 | 122/381 | p95 <= 33 | met |
| browser | drag | F-TYPICAL | 1 | pickMs | 0.30 | 0.50 | 0.70 | 10798 | 122/381 | p95 <= 2 | met |
| browser | pan | F-TYPICAL | 2 | frameIntervalMs | 8.30 | 9.50 | 10.10 | 10804 | 126/412 | p95 <= 16.7, p99 <= 33.3 | met |
| browser | pan | F-TYPICAL | 2 | latencyMs | 11.80 | 16.40 | 21.10 | 10805 | 126/412 | p95 <= 33 | met |
| browser | pan | F-TYPICAL | 2 | pickMs | 0.10 | 0.20 | 0.20 | 10803 | 126/412 | p95 <= 2 | met |
| browser | zoom | F-TYPICAL | 2 | frameIntervalMs | 8.30 | 9.60 | 10.30 | 10707 | 1000/2000 | p95 <= 16.7, p99 <= 33.3 | met |
| browser | zoom | F-TYPICAL | 2 | latencyMs | 12.20 | 16.50 | 17.90 | 10707 | 1000/2000 | p95 <= 33 | met |
| browser | zoom | F-TYPICAL | 2 | pickMs | 0.10 | 0.20 | 0.30 | 10705 | 1000/2000 | p95 <= 2 | met |
| browser | drag | F-TYPICAL | 2 | frameIntervalMs | 8.30 | 9.70 | 10.20 | 10800 | 122/381 | p95 <= 16.7, p99 <= 33.3 | met |
| browser | drag | F-TYPICAL | 2 | latencyMs | 12.40 | 16.40 | 17.70 | 10800 | 122/381 | p95 <= 33 | met |
| browser | drag | F-TYPICAL | 2 | pickMs | 0.20 | 0.60 | 0.80 | 10798 | 122/381 | p95 <= 2 | met |
| browser | idle | F-TYPICAL | 1 | idleFrameRequests | 0.00 | 0.00 | 0.00 | 1 | - | p95 <= 0, p99 <= 0 | met |
| browser | idle | F-TYPICAL | 2 | idleFrameRequests | 0.00 | 0.00 | 0.00 | 1 | - | p95 <= 0, p99 <= 0 | met |

## Bundle size (gzip)

| Entry | Size KiB | Budget KiB | Status |
| --- | --- | --- | --- |
| core | 26.1 | 75.0 | met |
| view | 45.2 | 150.0 | met |
| react | 45.2 | - | no-target |

## Notes

- Frame interval is the gap between consecutive requestAnimationFrame timestamps while a scripted workload dispatches one input event per frame. Pooled over 3 repeats of 30 s after a 1 s warm-up each; never pooled across DPRs.
- Pointer-to-preview latency approximates presentation time: the first animation frame after the one that painted the input's preview, minus the event's dispatch time. Events are dispatched at a random phase of the frame (seeded), as device input arrives. The floor is one display period and the ceiling two, so on a 60 Hz display the 33 ms target means no dropped frame; a 120 Hz display (the headed Mac) has more headroom.
- Picking time is one ViewHandle.pick call per frame at the pointer position, timed with performance.now() (100 microsecond resolution in this browser).
- F-LARGE workloads keep the zoom at or above 0.4 so at most about 1k nodes are visible; F-TYPICAL pan and drag run at zoom 1, its zoom sweep covers 0.25 to 2.
- Browser ran headed on a real display.

## Missed targets

- drag / F-LARGE / DPR 1 / pickMs: p95 2.70, p99 3.50 (target p95 <= 2)
- pan / F-LARGE / DPR 2 / frameIntervalMs: p95 16.80, p99 25.00 (target p95 <= 16.7, p99 <= 33.3)
- drag / F-LARGE / DPR 2 / pickMs: p95 2.70, p99 3.50 (target p95 <= 2)
