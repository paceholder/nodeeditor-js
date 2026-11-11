# Benchmarks

Seeded fixtures, headless and browser benchmarks, and a bundle-size report for the
performance requirements. Nothing here
ships in the package (`files: ["dist"]`). The measurement code imports the public entry
points only (`@paceholder/nodeeditor-js`, `@paceholder/nodeeditor-js/view`, `@paceholder/nodeeditor-js/view/advanced`).

## Running

| Command | What it does |
| --- | --- |
| `npm run bench` | Builds, then runs the headless benches (Node) on F-LARGE: validate, load, export, diff, scene and index build, culling query, picking, one-node patch; and a one-node snapshot push into 500 and 5000 node snapshot models. |
| `npm run bench:browser` | Builds, then runs the browser workloads and the idle probe in the installed Google Chrome (headless, both device pixel ratios). Quick by default; `BENCH_QUICK=0` runs full length. |
| `npm run bench:size` | Bundles `core`, `view`, `advanced` (`@paceholder/nodeeditor-js/view/advanced`) and `react` like a consumer would and prints gzip sizes against the budgets (`advanced` and `react` have none). `view` bundles only the core code it uses, since it does not re-export core. `node scripts/bundle-size.mjs --enforce` exits non-zero on overrun. |
| `npm run bench:baseline` | The full run: all of the above at full duration, then writes `bench/baseline/<date>-<browser>.json` and `SUMMARY.md`. |
| `npm run test:bench` | Unit tests of the fixtures, statistics, baseline writer and budget logic. `npm test` does not include them. |

Browser runs are quick unless `BENCH_QUICK=0`: each workload runs once for 5 s, about
1.5 min per device pixel ratio. Full length is three repeats of 10 s, pooled into 30 s per
workload, about 5 min per ratio; `npm run bench:baseline` always runs full length. Quick
results are marked as such and the baseline writer refuses them.

On macOS, `bench:browser` and `bench:baseline` hold a `caffeinate -d -i` assertion for
the length of the run (`scripts/keep-awake.mjs`) and warn when the machine is on battery.
If the display turns off mid-run, Chrome drops the test runner's connection ("Browser
connection was closed while running tests"), headed or headless, and idle system sleep
follows; on battery the CPU is throttled and the numbers are not comparable.

`npm run bench:baseline` runs the browser headed (a Chrome window opens; leave it alone
while it runs, a hidden or covered window can be throttled). Set `BENCH_HEADLESS=1` to
run it headless; the provenance records which one was used. Headed runs apply the
1440x900 viewport and the device pixel ratio through CDP metrics emulation, because
Playwright cannot combine a real window with `deviceScaleFactor`; headless runs set the
ratio on the browser context. Either way the machine's own display refresh rate decides
the frame period (a 120 Hz display gives 8.3 ms intervals).

Chrome comes from the machine (`channel: "chrome"`); no browser is ever downloaded. Raw
per-suite output goes to `bench/.results/` (git-ignored).

## Reading the baseline

`bench/baseline/<date>-chrome.json` follows the schema in
`openspec/changes/archive/2026-10-30-add-perf-baseline/design.md` (D6): commit, build mode, machine, browser
and version, headless or headed, and one row per workload, fixture, device pixel ratio and
metric with `p50`, `p95`, `p99`, sample count, visible node and path counts, the target,
and `met`, `missed` or `no-target`. `SUMMARY.md` renders the same data and lists every
missed target.

- Percentiles are nearest-rank values of the raw samples. Numbers are never pooled across
  device pixel ratios or browsers. The three 10 s repeats of one workload are pooled.
- `frameIntervalMs`: gap between consecutive `requestAnimationFrame` timestamps while a
  scripted workload (pan, zoom sweep, node drag) sends one real pointer or wheel event
  per frame through the view root.
- `latencyMs`: the pointer-to-preview latency is an approximation. Each input is tagged
  with `ViewHandle.noteInput`; the harness resolves it at the first animation frame after
  the one in which `renderStats().lastPaintedInputSeq` reached the tag, which stands for
  presentation. Events are dispatched at a seeded random phase of the frame, as device
  events arrive. The result lies between one and two display periods plus the work done,
  so on a 60 Hz display the 33 ms target means "no dropped frame". It is not photon
  latency.
- `pickMs`: one `ViewHandle.pick` call per frame at the pointer position, timed with
  `performance.now()` (100 microsecond resolution; values of 0.1 are the floor).
- The headless rows (`runtime: node`) are evidence only; the budgets from the query and update budgets rule are judged on
  the browser numbers where a row exists for them.
- `idleFrameRequests`: animation frames requested over 5 s without input after first
  paint. The target is zero.
- F-LARGE workloads stay at zoom 0.4 or more so that about 1k nodes or fewer are visible
  ("culled F-LARGE"); the visible column shows the maximum painted counts observed.
- `overview-pan` and `overview-zoom` (F-LARGE only) run the same scripts at
  fit-all zoom, with every node visible; the zoom sweep covers 0.8 to 1.25 times the fit
  zoom. Their frame-interval target is p95 <= 33.3 ms, labeled and non-failing.
- Provenance includes `+dirty` after the commit when the working tree had changes.
- A baseline file is never overwritten. A second run on the same day gets a counter
  (`<date>-chrome-2.json`), or a name given with `BENCH_BASELINE_SUFFIX=perf`
  (`<date>-chrome-perf.json`).
- `SUMMARY.md` ends with a comparison against the newest earlier baseline (latest `date`,
  then file modification time), or the file named by `BENCH_BASELINE_COMPARE`: p95, p99
  and status before and now for each row, and bundle sizes.
- Status allows float noise: a p95 of 16.70000000001 against a 16.7 target is met.

## Overview workloads

The culled workloads above keep about 1k nodes on screen. Two more cover the opposite
case, the whole F-LARGE graph on screen:

- `overview-pan` pans and `overview-zoom` sweeps the zoom between 0.8 and 1.25 times the
  fit-all zoom (about 0.1). Every node and wire is visible, the view is at the `overview`
  level (below `lodOverviewBelow`, 0.15) and ports are hidden (below `lodHidePortsBelow`,
  0.25), so these rows measure the batched overview painting and picking with
  `ports: false`.
- `gestureBitmap` stays off, so every measured frame is an exact repaint. The target is
  p95 <= 33.3 ms (one dropped frame at 60 Hz), labeled and non-failing; pick stays at 2 ms.
- `bench/browser/overview-batching.browser.test.ts` counts `fill` and `stroke`
  calls of one overview frame of F-TYPICAL through an instrumented 2D context: they are
  bounded by the number of distinct styles plus the selected and diagnostic entities, not
  by the entity count. It runs with `npm run bench:browser` and writes no results.
- Headless, `npm run bench` adds pick at fit-all zoom (with and without ports) and two
  fit-all culling queries: the bare world box, which misses the full-view cache, and the
  fit-all viewport, which is what the view asks for and hits it.

The perf demo has a "Gesture bitmap" checkbox (or `?bitmap=1`) to compare stress runs with
reuse on and off.

### Stress runs before and after improve-large-graph-performance

Perf demo stresses (`npm run demo:perf`, headless installed Chrome 156 through
Playwright, 1440x900, gesture bitmap off, one 12 s run each). Before is commit 86a7aa6
(on AC power); after is a6aa818 (on battery; a partial rerun on AC power matched it).
Frames per second, then p95 / worst frame interval in ms:

| Stress | Graph | DPR | Before | After |
| --- | --- | --- | --- | --- |
| Zoom sweep (fit-all to 1:1 and back) | F-LARGE (10k) | 1 | 40, 66.7 / 166.7 | 57, 33.3 / 33.4 |
| Zoom sweep | F-LARGE | 2 | 40, 66.7 / 166.7 | 57, 33.3 / 33.4 |
| Zoom sweep | 20k nodes | 1 | 35, 66.7 / 316.6 | 46, 50.0 / 83.4 |
| Zoom sweep | 20k nodes | 2 | 35, 66.7 / 316.7 | 47, 33.4 / 66.7 |
| Continuous pan | F-LARGE and 20k | 1, 2 | 60, 16.8 / 16.8 | 60, 16.8 / 16.8 |
| Move selection (about 200 to 270 nodes) | F-LARGE and 20k | 1, 2 | 60, commit 5.3 to 6.6 ms | 60, commit 6.9 to 8.0 ms |
| Live status stream (1,000 nodes at 30 Hz) | F-LARGE and 20k | 1, 2 | 60, patch apply p95 1.3 to 1.9 ms | 60 to 62, p95 1.3 to 1.9 ms |

The zoom sweep is the one stress that crosses into the fit-all overview, so it is where
the change shows; pan, move and live updates were already at the display rate. The move
commit is about 1.5 ms slower; segment indexing of the moved wires is the likely cause,
not yet profiled.

## Fixtures

`bench/fixtures/` holds a mulberry32 PRNG, the specs (`F-SMALL` 100 nodes and 200
connections, `F-TYPICAL` 1k and 2k, `F-LARGE` 10k and 20k, `F-LIVE` declared only), and
`generateFixture(spec, seed)`, which returns a plain `GraphSnapshot`. The same seed gives
an identical snapshot, so the fixture is the spec plus the seed (`DEFAULT_SEED`), never a
committed JSON file. The generator imports types only; `fixture-types.ts` and
`fixture-view.ts` hold the runtime registrations shared by the benchmarks and the demo.

To add a fixture:

1. Add a `FixtureSpec` to `fixture-specs.ts` (or call `customSpec(nodes)` for a one-off
   size) and list it in `FIXTURE_SPECS`.
2. If it needs other node types, register them in `fixture-types.ts` (node types and
   geometry) and `fixture-view.ts` (painters), and generate them in `generate-fixture.ts`.
3. Extend `generate-fixture.test.ts`: determinism for the seed, counts, `validateSnapshot`.
4. Use it from a bench: headless in `bench/headless/*.bench.ts`, browser in the `CASES`
   table of `bench/browser/frames.browser.test.ts` (choose a starting zoom that keeps
   the visible count where you want it).

Fixture snapshots hold node positions, sizes, ports and connection endpoints only, so a
converter to React Flow nodes, edges and handles can be added without touching the
generator. That converter, and the side-by-side comparison, are planned for
Slice E.

## Interactive demo

`npm run demo:perf` serves `examples/perf/`: the same fixtures and view configuration,
a size picker (custom sizes up to 50k nodes), a live statistics panel and stress actions.
It is for looking and for informal numbers; the committed baseline comes from the harness
above.
