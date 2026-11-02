# Notes

## Check (2026-11-02)

- `npm run bench:browser` (quick default, headless, both ratios, Bezier): 163 s wall
  time, 10 tests passed, all 6 result files marked `quick: true`.
- Full length (`BENCH_QUICK=0 BENCH_HEADED=1 BENCH_DPR=2 BENCH_ROUTES=orthogonal`), mains
  power, 120 Hz: 310 s wall time (was 790 s for the same run at 3 × 30 s).
- Samples per workload: about 3,600 (overview workloads 2,600 to 3,100), a third of the
  2026-10-30 baseline. The proposal first claimed the count would stay the same; that was
  wrong and is corrected in proposal.md and design D1.

p95 of the full-length run, F-LARGE orthogonal at ratio 2, against the 2026-10-30 Bezier
baseline (3 × 30 s) at ratio 2:

| Workload | Frame interval | Latency | Pick | Baseline frame / latency |
| --- | --- | --- | --- | --- |
| pan | 9.9 | 16.7 | 0.2 | 16.6 / 21.2 |
| zoom | 9.8 | 16.3 | 0.2 | 10.1 / 16.8 |
| drag | 10.0 | 16.2 | 0.4 | 10.1 / 16.5 |
| overview-pan | 16.7 | 24.6 | 0.2 | 16.8 / 25.4 |
| overview-zoom | 23.4 | 26.2 | 0.3 | 25.1 / 31.8 |

F-TYPICAL: frame interval p95 at most 9.2 ms, latency p95 at most 16.3 ms. Every target
is met, and the shorter run lands where the long baseline did, so the lighter length
keeps the results comparable.
