# Design

## Context

`bench/browser/harness.ts` sets `DURATION_MS = QUICK ? 5_000 : 30_000` and
`REPEATS = QUICK ? 1 : 3`, plus a 1 s warm-up per repeat. `bench/vitest.bench.config.ts`
turns quick on only when `BENCH_QUICK=1`, so `npm run bench:browser` runs full length
headless at both pixel ratios. `scripts/baseline.mjs` passes `BENCH_QUICK=0` explicitly
and runs headed, one ratio per run. The baseline writer refuses quick results. The
2026-10-30 design (D4) fixed "30 s per workload, repeated three times"; the performance
spec itself only names 30 s in the PERF-02 drag scenario and requires ratios 1 and 2.

A full run measured on 2026-11-02 took 790 s for one ratio and route mode: 8 workloads ×
3 × 31 s ≈ 744 s of workload time plus fixture loading.

## Goals / Non-Goals

**Goals:**
- A full run of one ratio and route mode in about 5 min.
- The everyday command quick by default; full length still one variable away.
- Stay within PERF-01, PERF-02 and PERF-02e as written.

**Non-Goals:**
- Fewer pixel ratios or workloads, a new baseline, changes to the headless benches.

## Decisions

### D1. Three repeats of 10 s

Keep three repeats and shorten each to 10 s. Pooled, each workload has 30 s of samples,
which covers the PERF-02 30-second drag scenario. That is a third of the old 90 s (about
3,600 frames at 120 Hz instead of 10,800): p99 then rests on about 36 frames above it,
which is still stable enough for the 33.3 ms limit (checked in task 3.2). Three repeats keep the
spread between repeats visible, which a single 30 s repeat would hide. The warm-up stays
1 s, now a larger share of the run (8 workloads × 3 × 11 s ≈ 4.4 min plus loading).

Alternatives: 1 × 30 s (same time saving, but loses repeat-to-repeat spread); 2 × 15 s
(no clear gain over 3 × 10 s).

### D2. Quick by default, `BENCH_QUICK=0` for full length

The config reads quick unless `BENCH_QUICK=0` (today: quick only when `BENCH_QUICK=1`).
`npm run bench:browser` then takes about 1.5 min per ratio. `scripts/baseline.mjs` already
passes `BENCH_QUICK=0`, so baselines stay full, and the writer still refuses quick
results as a second guard. `BENCH_QUICK=1` keeps working.

### D3. Text follows the numbers

The provenance note in `bench/report/assemble.ts` ("Pooled over 3 repeats of 30 s") and
`bench/README.md` describe the new length and the new default. The archived 2026-10-30
design keeps its text as history; this design supersedes its D4 duration.

## Risks / Trade-offs

- Shorter repeats are a little more sensitive to a passing background load, since a
  disturbance is a larger share of one repeat → pooling three repeats and the p99 limit
  of 33.3 ms keep single spikes from deciding the result; re-run when the machine was busy.
- Numbers from the new full length are not strictly identical in method to the
  2026-10-30 baseline → comparisons note the run length; the next baseline uses the new
  length throughout.
- Quick default can be mistaken for a real measurement → quick results carry
  `quick: true` and the baseline writer refuses them, as today.
