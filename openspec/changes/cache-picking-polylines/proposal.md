# Proposal

## Why

Picking measures the exact distance from the pointer to each connection piece the spatial
index returns near it. For an orthogonal connection with rounded corners, each such
measurement rebuilds the piece's parts (straight segments and corner arcs) from its
vertices and radii, allocating a small list every time, although the piece has not changed
since the scene built it. The core hardening deferred this: connection paths are already
split into at most twelve indexed pieces, so a pick measures only a few pieces near the
pointer, and caching the parts either needs a module-level memo (against the project's rule
of no module-level singletons) or a new field that every router's output would have to carry.
Neither was worth it without a measured cost.

This change measures first. It adds a picking benchmark with many routed connections and
decides from the numbers: if the cost of rebuilding parts is large enough, it caches the
parts per piece on the scene's own connection entry (owned by the scene instance, built by
the scene, so routers are untouched); if not, the change closes as not needed and records
the numbers.

## What Changes

- **Benchmark first.** New picking workloads in the headless benchmark suite and the browser
  benchmark: many orthogonal connections with rounded corners, the pointer moving across
  dense crossings, at zoom 1 and at the fit-all zoom; reported as p50, p95 and p99 pick time
  and allocations per pick, with a profile split showing the share spent building parts.
- **Decision rule.** Caching is implemented only if the measured p95 pick time on the
  routed fixture exceeds half of the picking budget (2 ms at p95, so 1 ms), or if building
  parts takes at least 30 % of pick time; and it is kept only if it lowers p95 pick time by at
  least 20 % on the same machine and browser. The thresholds are open to the owner.
- **If justified: parts cached per piece.** The scene's connection entry gains lazily built
  parts for each polyline piece, created on the first pick that measures the piece and
  dropped with the entry when the connection or its nodes change (entries are already
  rebuilt then). Distance and nearest-point functions gain variants that take prepared parts;
  the existing functions keep their signatures and results. No module-level cache.
- **If not justified:** no code change; `notes.md` records the numbers, machine, browser and
  date, and the change is archived with its benchmark only (the benchmark stays, as a
  regression guard).

Requirements refined: the query and update budgets rule (picking budget), the indexed
culling and picking rule, the repeatable benchmark suite rule, and the no module-level
singletons convention of the project context.
New requirements: picking benchmark with routed connections; prepared polyline parts for
picking (provisional, dropped from the delta if the benchmark does not justify it).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `performance`: a picking workload with many routed connections, and, only if measured as
  worthwhile, picking without rebuilding unchanged polyline parts.

## Out of scope

- Caching for cubic or straight paths (their distance needs no part list).
- Changing the piece split (`PIECE_LENGTH`, `MAX_PIECES`) or the spatial index.
- Painting: the painter traces paths separately and is not measured here.
- Any change to router outputs or the `PathGeometry` type.

## Dependencies

None. Uses the existing bench harness (`bench/headless/scene.bench.ts`, `bench/browser/`)
and the seeded fixtures.
