# Design

## Context

See proposal.md for motivation. The browser test setup comes from
`add-canvas-view-foundation`, which adds a Vitest `browser` project running
`*.browser.test.ts` in Chromium through the Playwright provider and emulates DPR with
`deviceScaleFactor`. Fixtures use the `GraphSnapshot` from `add-graph-snapshot`. The budgets
come from the performance spec: PERF-02, PERF-02a, and PERF-02c.

Emulators such as jsdom are not rendering-speed evidence (§17). All frame numbers come from
a real browser running the production build.

## Goals / Non-Goals

**Goals:**
- Deterministic fixtures: same seed, same snapshot (PERF-01).
- One command produces a complete, comparable baseline, with every measurement labelled by
  its provenance.
- Measurement code stays outside `src/`, so the shipped bundle never contains it.

**Non-Goals:**
- CI gating on budgets. Enforcement is behind a flag until Slice E.
- Statistical regression detection between runs. Slice A only records the baseline.
- Tuning the renderer.

## Decisions

### D1. Layout

```
bench/
  fixtures/
    prng.ts                 mulberry32 seeded PRNG
    fixture-specs.ts        F-SMALL / F-TYPICAL / F-LARGE / F-LIVE parameters
    generate-fixture.ts     spec + seed -> GraphSnapshot
    fixture-types.ts        node-type keys and geometry/painter registrations used by fixtures
    generate-fixture.test.ts
  headless/
    snapshot.bench.ts       validate / load / export / diff on F-LARGE
    scene.bench.ts          scene + index build, culling query, picking
    patch.bench.ts          one-node move patch with <= 4 incident connections
  browser/
    harness.ts              mount, scripted input driver, frame sampler
    workloads.ts            pan, zoom, drag scripts per fixture
    frames.browser.test.ts  runs workloads at DPR 1 and 2, records samples
    idle.browser.test.ts    idle rAF probe
  report/
    stats.ts                nearest-rank percentiles, summaries
    provenance.ts           git commit, OS/CPU, browser/version, DPR, build mode
    write-baseline.ts       merges results -> bench/baseline/*.json + SUMMARY.md
  baseline/                 committed results
  vitest.bench.config.ts    separate config: node bench + browser project, production build
scripts/
  bundle-size.mjs
```

`bench/` gets its own `tsconfig.bench.json`, which extends the root config and includes
`bench` and `scripts`. The `typecheck` script adds this pass. Biome already covers the whole
repository.

### D2. Fixture generation

`generateFixture(spec, seed): GraphSnapshot`:
- Nodes are placed on a jittered grid. The spacing is chosen so a 1440×900 viewport at
  zoom 1 shows about 100 nodes, and culled F-LARGE shows up to 1k nodes at the zoom used by
  the workloads.
- Node types: 70% image-symbol and 30% card. Image-symbol nodes get random quarter-turn
  rotation and mirroring. Card nodes have 2–6 ports and image-symbol nodes 2–4 ports, so
  the average is about four ports per node.
- Ports: 60% are typed undirected ports with one of four type keys; the rest are directed
  input and output ports.
- Connections pick a compatible port on a node within a small grid neighbourhood. This
  gives realistic short paths, plus about 5% long-range connections so some paths cross the
  viewport with both endpoints off-screen (PERF-04).
- IDs come from the default counter generator, so diffs are readable.

The generated snapshot must pass `validateSnapshot`, which the generator test checks.
Generation of all fixtures sorts nothing implicitly; every list is built in generation
order.

*Alternative considered:* committing generated fixture JSON files. Rejected because F-LARGE
is several megabytes; the generator plus seed is the reproducible artifact.

### D3. Headless benchmarks

These use `vitest bench` (tinybench) in Node with fixed seeds and a warm-up. Each bench
reports tinybench's statistics, and the reporter maps them to p50, p95, and p99 in the
baseline schema.

- Picking runs over 10 000 seeded viewport points.
- The patch bench moves a node chosen with the fixture's maximum incident degree capped at
  four, matching PERF-02a's "small local patch".

Node timings are recorded as headless evidence only. The PERF-02a budgets are judged on the
browser numbers (D4) because the browser is the target runtime.

### D4. Browser harness

The browser project runs against the production build (`dist/`, through a Vite alias), in
Chromium with a 1440×900 viewport and two instances at `deviceScaleFactor` 1 and 2.

Workloads (`workloads.ts`) drive real pointer and wheel events through the view root, so the
tools and input adapter are exercised:

| Workload | Description |
| --- | --- |
| `pan` | Constant-velocity pan loop |
| `zoom` | Wheel zoom in/out sweep around the cursor between 0.25 and 2 |
| `drag` | A single node dragged in a figure-eight path |

Duration is 30 s per workload, repeated three times (PERF-01). `BENCH_QUICK=1` shortens
runs to 5 s, once, for local iteration; quick results are marked in provenance and never
written as the baseline.

Measurements:
- **Frame interval:** consecutive `requestAnimationFrame` timestamps during the workload.
- **Pointer-to-preview latency:** `performance.now()` at the first rAF callback after the
  view reports that the preview for that input was painted, minus `event.timeStamp`. A view
  render-stats hook exposes "painted input sequence". This approximates presentation time;
  the limitation is documented in the summary.
- **Picking time:** `performance.now()` around `ViewHandle.pick` calls issued by the
  harness at the pointer position each frame.
- **Visible counts:** the culled node and path counts from the view's render stats.

The harness reads `ViewHandle.renderStats()`, owned by `add-canvas-view-foundation`: painted
node and path counts stand for the visible counts, plus `framesPainted` and
`lastPaintedInputSeq` (task 1.3).

Results leave the browser through Vitest browser mode's server-side file command, so the
harness never needs network access.

**Idle probe (PERF-02d):** mount F-TYPICAL, wait until the first paint settles, wrap
`requestAnimationFrame` with a counter, and assert zero requests over 5 s without input.

### D5. Bundle size

`scripts/bundle-size.mjs` bundles each entry with esbuild (`bundle`, `minify`, ESM, React
external) into memory and gzips the output with `node:zlib` at level 9. This measures what a
consumer pays per entry, independent of tsup's chunk splitting.

Reported entries:
- `core`: `src/core/index.ts`.
- `view`: `src/view/index.ts`. It does not re-export core, so this is the core code the
  view uses + symbol renderer + tools.
- `advanced`: `src/view/advanced.ts` (`nodeeditor-js/view/advanced`), without a budget.
- `react`: measured separately, with React external.

The output is a table plus JSON. `--enforce` exits non-zero if `core > 75 KiB` or
`view > 150 KiB`.

*Alternative considered:* summing tsup's dist chunks per entry by parsing imports. Rejected
as fragile; esbuild's metafile-free bundling is simpler and matches consumer reality.

### D6. Baseline schema and provenance

`bench/baseline/<yyyy-mm-dd>-<browser>.json` holds one file per baseline run:

```json
{ "schema": 1, "commit": "…", "build": "production", "quick": false,
  "machine": { "os": "…", "cpu": "…", "cores": 0, "memoryGiB": 0 },
  "browser": { "name": "chromium", "version": "…" },
  "results": [ { "workload": "drag", "fixture": "F-LARGE", "dpr": 2,
    "metric": "frameIntervalMs", "p50": 0, "p95": 0, "p99": 0, "samples": 0,
    "visible": { "nodes": 0, "paths": 0 }, "target": { "p95": 16.7, "p99": 33.3 },
    "status": "met" | "missed" | "no-target" } ],
  "bundle": [ { "entry": "core", "gzipBytes": 0, "budgetBytes": 76800, "status": "met" } ] }
```

`SUMMARY.md` renders the same data as tables and lists missed targets explicitly. Numbers
are never pooled across DPRs or browsers.

Percentiles use the nearest-rank method, implemented in `stats.ts` and unit-tested against
hand-computed values.

### D7. Scripts

| Script | Command |
| --- | --- |
| `bench` | `vitest bench --config bench/vitest.bench.config.ts --project node` |
| `bench:browser` | `npm run build && vitest run --config bench/vitest.bench.config.ts --project browser` |
| `bench:size` | `node scripts/bundle-size.mjs` |
| `bench:baseline` | runs all three without quick mode, then `write-baseline.ts` |

## Risks / Trade-offs

- [Headless Chromium frame pacing differs from a headed browser on a real display] →
  Provenance records headless or headed. The committed baseline is taken headed, and quick
  runs may be headless.
- [rAF-based latency approximates presentation time] → The limitation is documented, and
  the same method is used for every run so comparisons stay valid.
- [Baseline numbers depend on the machine] → Machine provenance is recorded. PERF-02
  numbers stay labelled as targets until measured on an agreed machine (approval is out of
  scope after the interview trim).
- [30 s × 3 × workloads × DPRs makes a long run] → `bench:baseline` is a manual command,
  and `BENCH_QUICK` exists for iteration.
- [Bench code drifting from the real API] → Benches import only public entry points (or
  `dist/` in the browser), so API changes break them at typecheck.
