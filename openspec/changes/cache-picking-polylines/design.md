# Design

## Context

- `pickScene` (`core/space/scene/picking.ts`) queries the spatial index around the pointer,
  sorts the keys, and for each connection piece not yet hit calls `pathDistance(piece,
  point)`. For a polyline piece that is `nearestOnPolyline`, which calls `parts(path)`:
  it recomputes the vertices, the turn at each corner, the arc of each rounded corner and the
  length of each part, and allocates the part list, on every call.
- Connection entries (`scene-entries.ts`) hold `segments` (the pieces, at most `MAX_PIECES` =
  12 per path, split at about `PIECE_LENGTH` = 800 world units) and `segmentBounds`. An entry
  is rebuilt when its connection or an end node changes, so anything stored on it is fresh by
  construction.
- The bench suite (`bench/headless/scene.bench.ts`) already has pick workloads at random
  points on F-LARGE at zoom 1 and at the fit-all zoom; its connections are not all routed
  orthogonally with corner radii, so polyline parts may not dominate there.
- Project convention: no module-level singletons; every instance owns its state.

## Goals / Non-Goals

**Goals:** a number that says whether rebuilding parts matters; a cache only if it does;
identical pick results with and without it.

**Non-Goals:** other path kinds, the piece split, the index, painting.

## Decisions

### D1. Measure before changing anything

Add workloads, seeded and repeatable:

- **Routed pick, headless:** F-LARGE with every connection routed orthogonally with a corner
  radius of 8, 1000 picks at seeded points along connection paths (so every pick measures
  pieces), at zoom 1 and at the fit-all zoom.
- **Dense crossings, headless:** the F-DENSE-like stress layout (high-degree nodes, parallel
  connections, many crossings) if `close-archive-gaps` has added it, else a seeded local
  grid of 200 crossing orthogonal connections, with picks at the crossings.
- **Browser:** the same routed fixture in the browser bench, pointer moved along a path for
  10 seconds, reporting pick time per frame.

Each reports p50, p95 and p99 pick time, allocations per pick (headless: heap delta over the
run divided by picks, with a forced collection before and after when available), and a
split of time in `parts` versus the rest (by a temporary counter in a profiling build, not
shipped).

### D2. Decision rule (open to the owner)

Implement the cache only if, on the routed fixture, p95 pick time is above 1 ms (half the
2 ms picking budget) or building parts is at least 30 % of pick time. Keep it only if it
lowers p95 pick time by at least 20 % on the same machine and browser, with identical pick
results. Otherwise record the numbers in `notes.md` and close the change as not needed,
keeping the benchmark.

### D3. Where the cache lives (if built)

Options:

| Option | Where | Trade-off |
| --- | --- | --- |
| A. Lazy field on the scene's connection entry | `entry.parts[i]`, built on the first pick that measures piece `i` | Owned by the scene instance; freed with the entry; no router change; first pick pays once. |
| B. Eager field built with the entry | built for every polyline piece when the entry is built | Simplest read path, but costs time and memory for pieces never picked (most of them). |
| C. Module-level memo keyed by the piece object (`WeakMap`) | in `polyline.ts` | No entry change, but a module-level singleton, which the project forbids, and shared across scenes. |
| D. Parts carried in `PathGeometry` | every router returns them | Changes a public type and every router, including host routers. |

Decision: **A**. The scene computes the parts from the piece it already holds, so a host
router does not need to know about them, and the convention holds. The entry is immutable
from the outside; the lazy array is private to the scene module and filled in place, which
does not change any value a reader sees.

`polyline.ts` gains `polylineParts(path)` (the current private `parts`, exported for the
scene) and `nearestOnParts(parts, p)`; `nearestOnPolyline` becomes `nearestOnParts(
polylineParts(path), p)`, so results are identical by construction. Picking calls
`nearestOnParts(entry.partsOf(i), point)` for polyline pieces and `pathDistance` for the
others. Nothing new is exported from the core entry.

### D4. Equality guard

A property test compares, for seeded random polylines with radii and seeded points, the
distance and nearest point from the cached path with the uncached one; they must be equal
(not merely close), since the same function computes both.

## Risks / Trade-offs

- A benchmark on one machine can mislead; the numbers name machine, browser and pixel
  ratio, and the decision uses the same machine before and after.
- The cache grows with the number of pieces ever picked, bounded by the pieces in the scene
  (at most 12 per connection); it is freed when entries are rebuilt or the scene is
  disposed.

## Open questions for the owner

1. Are the thresholds of D2 (1 ms p95 or 30 % share to start; 20 % gain to keep) right?
2. Should the benchmark keep running in the regular bench suite after the decision, or only
   when picking code changes?
