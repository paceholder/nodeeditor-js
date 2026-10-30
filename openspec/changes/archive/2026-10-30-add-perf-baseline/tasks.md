# Tasks

## 1. Setup

- [x] 1.1 Create `bench/` layout, `tsconfig.bench.json`, and add its pass to the `typecheck` script; verify `npm run typecheck` covers `bench/` and `scripts/` and `npm pack --dry-run` lists no `bench/` files
- [x] 1.2 Add `bench/vitest.bench.config.ts` with a `node` bench project and a `browser` project (installed Google Chrome via `channel: "chrome"`, never a downloaded browser; 1440×900, `deviceScaleFactor` 1 and 2, production build alias), a `unit` project for the tests under `bench/` and `scripts/` (`npm run test:bench`), plus the D7 npm scripts; verify `npm test` still excludes `bench/` and `npm run bench -- --run` starts
- [x] 1.3 Depends on `add-canvas-view-foundation` task 6.6 (`renderStats()`); confirm the harness can read painted/culled node and path counts, `framesPainted`, and `lastPaintedInputSeq` from it, verified by `npm run typecheck`

## 2. Fixtures

- [x] 2.1 Implement `prng.ts`, `fixture-specs.ts`, `fixture-types.ts`, and `generate-fixture.ts`; verify `generate-fixture.test.ts` named for the repeatable benchmark suite rule shows the same seed gives identical `JSON.stringify` output, that node and connection counts match each spec, and that average ports per node is within 3.5–4.5 for F-TYPICAL
- [x] 2.2 Verify each generated fixture passes `validateSnapshot` and includes connections whose path crosses the 1440×900 viewport with both endpoints off-screen, in a test named for the shared snapshot validator rule and the indexed culling and picking rule

## 3. Statistics and reporting

- [x] 3.1 Implement `report/stats.ts` (nearest-rank p50/p95/p99, counts); verify `stats.test.ts` named for the repeatable benchmark suite rule against hand-computed values, including single-sample and even-length inputs
- [x] 3.2 Implement `report/provenance.ts` and `report/write-baseline.ts` (D6 schema, `SUMMARY.md`, target status per result, quick runs refused as baseline); verify `write-baseline.test.ts` named for the repeatable benchmark suite rule with synthetic results produces schema-valid JSON and lists missed targets in the summary

## 4. Headless benchmarks

- [x] 4.1 Implement `headless/snapshot.bench.ts`, `scene.bench.ts`, and `patch.bench.ts`; verify `npm run bench` completes and prints results for validate, load, export, diff, scene build, culling query, picking, and one-node patch on F-LARGE
- [x] 4.2 Add a test named for the indexed culling and picking rule and the incremental index updates rule in `bench/headless/incremental.test.ts` verifying that moving one node in F-LARGE updates only that node's and its incident connections' index entries (instrumented index wrapper counts updates)

## 5. Browser harness

- [x] 5.1 Implement `browser/harness.ts` and `workloads.ts` (real pointer and wheel events through the view root, frame sampler, latency and picking timers, results written through the browser-mode server file command); verify a `BENCH_QUICK=1 npm run bench:browser` run on F-TYPICAL writes samples for pan, zoom, and drag at both DPRs
- [x] 5.2 Implement `frames.browser.test.ts` for F-TYPICAL and culled F-LARGE; verify a quick run reports frame interval, latency, picking time, and visible counts per workload, fixture, and DPR, with visible F-LARGE nodes ≤ 1k
- [x] 5.3 Implement `idle.browser.test.ts` named for the idle and lifecycle rule and the dirty-driven frame scheduling rule; verify it reports zero animation-frame requests over 5 s of inactivity after first paint

## 6. Bundle size

- [x] 6.1 Add `esbuild` as an explicit devDependency and implement `scripts/bundle-size.mjs` (per-entry esbuild bundle, gzip level 9, table and JSON output, `--enforce` flag); verify `npm run build && npm run bench:size` prints core, view, and react sizes and that `--enforce` exits non-zero when a budget is artificially lowered via an env override
- [x] 6.2 Add a test named for the bundle-size budgets rule in `scripts/bundle-size.test.ts` (run in Node) for the budget comparison and status logic

## 7. Baseline

- [x] 7.1 Run `npm run bench:baseline` (headed Chromium, full durations) and commit `bench/baseline/<date>-chromium.json` and `SUMMARY.md`; verify the summary lists every target from the interaction budgets rule, the query and update budgets rule and the bundle-size budgets rule with met or missed and records machine provenance
- [x] 7.2 Document how to run the suite, read the baseline, and add a fixture in `bench/README.md`, including the latency approximation and the React Flow converter planned for Slice E; verify the documented commands run as written
- [x] 7.3 Run `npm run typecheck && npm test && npm run lint`; verify all pass with each bench file under 300 lines

## 8. Interactive performance demo

- [x] 8.1 Add `examples/perf/` and `npm run demo:perf` (same Vite setup as `examples/plain-js`): a page that generates a graph with the fixture generator, with a picker for F-SMALL, F-TYPICAL, F-LARGE and a custom node count (up to at least 20k nodes), fully interactive with the default tools; verify it loads F-LARGE with no console errors
- [x] 8.2 Show a live stats panel fed by `renderStats()` and a frame sampler: frame rate, per-layer paint time, painted and culled node and path counts, and model size; it updates without itself causing repaints of the canvas layers while idle; verify the panel values change while panning and stop changing when idle
- [x] 8.3 Add stress actions: zoom sweep from fit-all to 1:1 and back, continuous pan, move a large selection, and an F-LIVE style status-update stream; verify each runs and reports its frame-rate summary in the panel

## Workflow follow-up

- Archive the change after review with `/opsx:archive add-perf-baseline`.
- Record budget misses from the baseline as inputs to the Slice B/E planning.
