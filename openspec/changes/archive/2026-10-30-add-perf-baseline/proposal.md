# Proposal

## Why

Performance is part of the product contract (performance spec), and the decision to draw on
a canvas rather than DOM nodes was made for speed. Slice A's exit evidence asks for an
"initial performance/bundle baseline". Without repeatable fixtures and numbers recorded
early, later slices cannot tell whether a change made things faster or slower. This change
adds seeded fixtures, headless and browser benchmarks, and a bundle-size report, and commits
the first baseline.

## What Changes

- **Seeded fixture generator.** It produces graph snapshots for F-SMALL (100 nodes / 200
  connections), F-TYPICAL (1k / 2k, about four ports per node), and F-LARGE (10k / 20k).
  The mix is image-symbol and card nodes, rotations and mirroring, directed and undirected
  typed ports, and mostly local connections. The same seed gives an identical snapshot. The
  F-LIVE parameters are declared but not run, because status decorations land later.
- **Headless benchmarks** (`vitest bench`, Node) for:
  - snapshot validate, load, export, and diff on F-LARGE;
  - geometry-scene and spatial-index construction;
  - point picking at random viewport points;
  - culling queries for a 1440×900 viewport;
  - applying a one-node-move patch with up to four incident connections.
- **Browser frame-time harness** (Vitest browser mode, Chromium, production build, viewport
  1440×900 CSS px, DPR 1 and 2). Scripted pan, zoom, and single-node drag on F-TYPICAL and
  culled F-LARGE, recording:
  - frame intervals,
  - pointer-to-preview latency,
  - picking time,
  - visible node and path counts.

  It also has an idle probe that counts animation-frame requests over 5 s of inactivity.
- **Bundle-size report.** Each entry point (core; view, which bundles the core code it uses
  plus the symbol renderer and tools; view/advanced; react) is bundled and minified the
  way a consumer would, gzip sizes are reported against the budgets from the bundle-size budgets rule (75 KiB core,
  150 KiB core + view), and a `--enforce` flag fails the run on overrun. In Slice A the
  report is informational; enforcement becomes a release gate in Slice E.
- **Report and baseline.** p50, p95, and p99 per workload, sample counts, visible counts,
  browser and version, DPR, OS and CPU description, git commit, and build mode. Results are
  written to `bench/baseline/` as committed JSON, plus a short Markdown summary.
- **npm scripts:** `bench`, `bench:browser`, `bench:size`, and `bench:baseline`, which runs
  all three and writes the baseline.

Implements: the repeatable benchmark suite rule (suite, seeds, scripts, percentiles, provenance), the interaction budgets rule and the query and update budgets rule, and
the bundle-size budgets rule as measured, labeled targets (not yet gates), the idle and lifecycle rule (idle probe), and evidence
for the bounded dirty-driven work rule and the indexed culling and picking rule (bounded work and incremental index updates are measured). This is
the Slice A exit item "initial performance/bundle baseline".

### Out of scope

- Comparison with React Flow. That comes in Slice E. The fixtures are plain
  snapshots with node positions, sizes, ports, and endpoints, so a converter to React Flow
  nodes, edges, and handles can be added then without changing the generator.
- F-LIVE runs: they need status decorations through the adapter. Only the
  fixture parameters are declared now.
- Memory and leak measurement across 30 mount/dispose cycles (the lifecycle part of the idle and lifecycle rule), and
  Firefox and WebKit runs. These come in Slice E with the browser matrix.
- Optimizations. This change only measures. Budget misses are recorded as findings.

## Capabilities

### New Capabilities

None. The requirements already exist in the baseline `performance` and `packaging` specs.
This change implements their measurement side without changing behavior, so its
`.openspec.yaml` sets `skip_specs: true`.

### Modified Capabilities

None.

## Impact

- New top-level `bench/` directory: fixtures, headless benches, the browser harness, the
  reporter, and `baseline/`. It is not part of the published package (`files: ["dist"]`).
- New `scripts/bundle-size.mjs`, plus `esbuild` added as an explicit devDependency. It is
  already present transitively through tsup.
- New npm scripts and a Vitest bench/browser configuration for `bench/`, kept separate from
  the unit tests so `npm test` stays fast.
- Depends on:
  - `add-graph-snapshot` (fixture format, validate, load, export, diff),
  - `add-geometry-and-spatial-index` (scene, index, picking),
  - `add-patches-and-history` (patch apply),
  - `add-canvas-view-foundation` (mount, render stats, browser test setup),
  - `add-basic-tools` (scripted drag through the move tool).
