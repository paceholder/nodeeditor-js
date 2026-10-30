# Tasks

## 1. Measurement first

- [x] 1.1 Add the `overview-zoom` and `overview-pan` browser workloads at F-LARGE fit-all (bitmap reuse off) and targets from the overview navigation target rule in `bench/report/targets.ts`; verify a `BENCH_QUICK=1 npm run bench:browser` run reports frame interval, latency, pick time and visible counts (about 10k nodes) for both at DPR 1 and 2, and record the before numbers in the change's notes
- [x] 1.2 Add headless variants for pick at fit-all zoom and `queryRect` at fit-all to `bench/headless/scene.bench.ts`; verify `npm run bench` prints both

## 2. Segment-indexed connections (D1)

- [x] 2.1 Add cubic subdivision (de Casteljau at equal parameter steps) and the length-based piece count to `src/core/space/geometry/path-pieces.ts` (next to `path-geometry.ts`); verify tests named for the indexed culling and picking rule that each piece's control-point box contains 200 sampled points of its piece, and that the union of piece boxes equals the whole path's bounds within 1e-9
- [x] 2.2 Store pieces on `ConnectionEntry` and index them as `c:<id>#<i>`, removing stale piece keys when the count shrinks; verify `geometry-scene.test.ts` that `queryRect` results match a brute-force reference (whole painted bounds and at least one piece box intersect) over 1k seeded edits, and `bench/headless/incremental.test.ts` still shows only incident entries updated
- [x] 2.3 Pick on returned pieces only, grouping by connection ID; verify `picking.test.ts` ("Long path far from the pointer") with an instrumented distance counter showing no exact distance for a long wire whose overall box contains the point but whose pieces do not, and the existing hit-testing and tolerance picking tests pass unchanged

## 3. Faster `queryRect` (D2)

- [x] 3.1 Replace key parsing with a key→entry map, per-layer arrays and numeric `(z, seq)` sorting; verify `geometry-scene.test.ts` shows identical order to the previous comparator on seeded scenes with equal `z` values
- [x] 3.2 Add the full-view result cache keyed by an index-write counter; verify a test shows cached and uncached results equal after interleaved moves, adds, removes and z changes, and that the second fit-all query does not call the index (counter)

## 4. Hidden ports when zoomed out (D4)

- [x] 4.1 Add the `lodHidePortsBelow` token (default 0.25) and `PickOptions.ports`; `pickAt` skips capture radii and port candidates when `ports` is false; verify `picking.test.ts` that a point on a port anchor yields the node, not the port, with `ports: false`
- [x] 4.2 The scene layer stops painting ports below the threshold, and the tool context passes `ports: false` below it; verify a browser test (the level of detail rule "Ports hidden when zoomed out") that no port glyph pixels appear at the anchor and a press there starts no connection (empty-pan or select-move becomes active), plus a tool-harness test of the same press
- [x] 4.3 Draw port glyphs without per-port `save`/`restore` above the threshold; verify existing port glyph and `scene-layer.browser.test.ts` pixel tests pass unchanged

## 5. Overview level (D3)

- [x] 5.1 Add `overview` to `DetailLevel` and the `lodOverviewBelow` token (default 0.15); verify `level-of-detail.test.ts` maps zooms to all four levels and that `selection`, `diagnostics` and `endpoints` stay `true`
- [x] 5.2 Batched overview painting in the scene layer: nodes by resolved fill and stroke, connections by resolved stroke, lines for tiny cubics, no painter calls; verify a browser test (the low-detail rendering rule "Overview keeps what matters") on a seeded graph with a selected node, a selected connection and a node in error: selection outlines and the error badge pixels are present, port glyphs absent, and `renderStats()` counts all visible entities as painted
- [x] 5.3 Verify the batching with an instrumented 2D context in a browser test: an overview frame of F-TYPICAL issues a number of `fill`/`stroke` calls bounded by the distinct style count plus selected and diagnostic entities, not by the entity count

## 6. Gesture bitmap reuse (D5)

- [x] 6.1 Add the `gestureBitmap` mount option and offscreen copy of the last exact scene frame; verify a browser test (the gesture bitmap reuse rule "Option off by default") that without the option every pan frame increments the exact scene paint counter
- [x] 6.2 Draw the transformed copy for viewport-only frames at or above `minVisible`, with the settle timer; verify browser tests (the gesture bitmap reuse rule "Settle repaint") that after a zoom stops an exact repaint happens within `settleMs` plus one frame and no animation frames are requested for 2 s afterwards, and that `dispose()` clears the timer
- [x] 6.3 Force exact frames on model, selection, hover, theme, asset and resize changes and keep picking geometric; verify browser tests (the gesture bitmap reuse rule "Change during a gesture") that a model change mid-pan shows on the next frame and `view.pick` results are identical with the option on and off
- [x] 6.4 Add a "Gesture bitmap" toggle to `examples/perf`; verify by running `npm run demo:perf` in headless Chrome (Playwright, `channel: "chrome"`) with no console errors and the zoom sweep reporting higher fps with the toggle on

## 7. Verification and baseline

- [ ] 7.1 Profile the culled F-LARGE pan at DPR 2 after groups 2–5; fix the top remaining cost if it is in the library, and verify with a full `npm run bench:browser` run that p95 ≤ 16.7 ms; if still missed, report the profile and numbers to the user before continuing
- [ ] 7.2 Run the gates: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:bench`, `npm run test:browser`, `npm run build` and `npm run bench:size` (core ≤ 75 KiB, view ≤ 150 KiB gzip); all pass
- [ ] 7.3 Record a new baseline with `npm run bench:baseline` (headed installed Chrome); verify the new `bench/baseline/<date>-chrome.json` and `SUMMARY.md` show drag pick, overview and DPR 2 pan status, and compare them with 2026-10-30 in the summary
- [ ] 7.4 Re-run the perf demo stresses (zoom sweep, pan, move, live stream) on F-LARGE and 20k nodes in headless Chrome and note the before/after numbers in `bench/README.md`

## 8. Documentation (separate commit)

- [ ] 8.1 Update `docs/guide-view.md` (overview level, port hiding, gesture bitmap option and its blur trade-off, `DetailLevel` switch note), `docs/geometry.md` (segment-indexed paths, `ports` pick option) and `bench/README.md` (overview workloads); verify every new option and token named in the code is mentioned, by grepping the docs for `lodOverviewBelow`, `lodHidePortsBelow`, `gestureBitmap` and `ports:`
