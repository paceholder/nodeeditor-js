# Benchmarks

Seeded fixtures, headless and browser benchmarks, and a bundle-size report for the
performance requirements. Nothing here
ships in the package (`files: ["dist"]`). The measurement code imports the public entry
points only (`nodeeditor-js`, `nodeeditor-js/view`, `nodeeditor-js/view/advanced`).

## Running

| Command | What it does |
| --- | --- |
| `npm run bench` | Builds, then runs the headless benches (Node) on F-LARGE: validate, load, export, diff, scene and index build, culling query, picking, one-node patch. |
| `npm run bench:browser` | Builds, then runs the browser workloads and the idle probe in the installed Google Chrome (headless, both device pixel ratios). |
| `npm run bench:size` | Bundles `core`, `view`, `advanced` (`nodeeditor-js/view/advanced`) and `react` like a consumer would and prints gzip sizes against the budgets (`advanced` and `react` have none). `view` bundles only the core code it uses, since it does not re-export core. `node scripts/bundle-size.mjs --enforce` exits non-zero on overrun. |
| `npm run bench:baseline` | The full run: all of the above at full duration, then writes `bench/baseline/<date>-<browser>.json` and `SUMMARY.md`. |
| `npm run test:bench` | Unit tests of the fixtures, statistics, baseline writer and budget logic. `npm test` does not include them. |

Quick iteration: `BENCH_QUICK=1 npm run bench:browser` runs each workload once for 5 s
instead of three times 30 s. Quick results are marked as such and the baseline writer
refuses them.

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
  device pixel ratios or browsers. The three 30 s repeats of one workload are pooled.
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
- Provenance includes `+dirty` after the commit when the working tree had changes.

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
