# Proposal

## Why

The browser benchmark is heavier than the work needs. A full run is 30 s × 3 repeats per
workload, about 13 min per device pixel ratio and route mode, so re-checking orthogonal and
Bezier routes at both ratios takes almost an hour of a machine that must stay untouched.
`npm run bench:browser`, the everyday check, runs at full length too. The user found this
excessive (2026-11-02).

## What Changes

- Full runs use 3 repeats of 10 s per workload instead of 3 × 30 s. The pooled 30 s per
  workload still matches the PERF-02 "dragged for 30 seconds" scenario. Each workload
  then has a third of today's samples (about 3,600 frames at 120 Hz instead of 10,800).
- `npm run bench:browser` runs quick by default (5 s, once). A full-length run takes
  `BENCH_QUICK=0`; `npm run bench:baseline` already sets it and stays full.
- Report notes, README and the earlier design text that state "30 s, three times" are
  updated.

Unchanged: both device pixel ratios (PERF-02, PERF-02e require them), the fixtures,
workloads, metrics, targets, the headless benches and the baseline file format. The
2026-10-30 baseline stays as recorded; it is not re-run here.

Requirement IDs: PERF-01 (suite), PERF-02, PERF-02e (durations and ratios kept within
what they require).

Out of scope: dropping a pixel ratio or a workload (that would change PERF-02/PERF-02e),
a new baseline run, and the headless (Node) benches.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. Tooling only; no requirement changes (`skip_specs: true`).

## Impact

- `bench/browser/harness.ts` (duration constant), `bench/vitest.bench.config.ts` (quick
  default), `bench/report/assemble.ts` (provenance note), `bench/README.md`.
- Expected time: about 5 min per ratio and route mode for a full run (was about 13 min);
  about 1.5 min for the quick default.
