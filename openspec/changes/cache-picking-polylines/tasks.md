# Tasks

## 1. Benchmark (decides the rest)

- [ ] 1.1 Add the routed-pick and dense-crossing workloads to `bench/headless/scene.bench.ts` (seeded fixtures, D1) with p50, p95, p99 pick time and allocations per pick; verify `npm run bench` lists the new cases, named for the picking benchmark with routed connections rule, and two runs with one seed pick the same entities
- [ ] 1.2 Add the routed fixture to the browser bench (`bench/browser/`), pointer moving along a path; verify `npm run bench:browser` reports pick time per frame for it with browser, pixel ratio and date
- [ ] 1.3 Measure the share of pick time spent building polyline parts with a temporary counter in a local profiling run (not committed); verify by recording the numbers, machine, browser and date in `notes.md`
- [ ] 1.4 Apply the decision rule of D2 with the owner; verify by a decision entry in `notes.md`. If the cache is not justified, mark tasks 2.1 to 2.4 "not needed", remove the provisional requirement for prepared polyline parts from the delta spec, and go to 3.1

## 2. Cache (only if 1.4 says so)

- [ ] 2.1 Export `polylineParts` and add `nearestOnParts` in `src/core/space/geometry/polyline.ts`, with `nearestOnPolyline` built on them (D3); verify the existing `polyline.test.ts` passes unchanged and a new seeded property test in `polyline-parts.test.ts`, named for the prepared polyline parts for picking rule, shows equal distances and nearest points with and without prepared parts
- [ ] 2.2 Give the scene's connection entry lazily built parts per polyline piece and use them in `pickScene` (D3); verify `picking.test.ts` cases named for the prepared polyline parts for picking rule and the indexed culling and picking rule: identical hits on a seeded fixture with and without the cache, parts are built once per picked piece over 100 picks, an entry rebuilt after a node move has fresh parts, and no module-level state exists (a second scene does not see the first scene's parts)
- [ ] 2.3 Check the architecture and entry points; verify `npm test -- architecture` passes and `src/core/index.test.ts` shows no new core export
- [ ] 2.4 Re-run the benchmark of section 1 on the same machine and browser; verify by `notes.md` showing the p95 gain, and revert section 2 if the gain is below the threshold of D2

## 3. Gates

- [ ] 3.1 Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:browser`, `npm run build` and `openspec validate cache-picking-polylines --strict`; verify all pass (long-requirement warnings aside) and record results and the final decision in `notes.md`
