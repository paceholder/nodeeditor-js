# Tasks

Each section starts with a verification task. If it passes, keep the test as a regression test;
if it fails, the following fix task applies, otherwise mark it "not needed" in `notes.md`.

## 1. Host style (G8)

- [ ] 1.1 Verify in `examples/plain-js` and in `src/view/render/paint/host-style.browser.test.ts` titled VIS-05, VIS-01, REN-04: per-connection colour, width and dash from payload or a host function, runtime dash switch repaints only the scene layer with no history entry, selected and hovered state reaches a host node painter wrapper, hidden port glyph still paints nothing while its target works, `setTheme` light/dark keeps selection and viewport
- [ ] 1.2 Fix what 1.1 finds (smallest API: per-entity overrides or a style function); verify the same test passes and `npm run typecheck` is clean
- [ ] 1.3 Document the painter-wrapper pattern and theme mapping in `docs/guide-view.md`; verify `npm run lint`

## 2. Port targets and normals (G12)

- [ ] 2.1 Verify in `src/core/space/geometry/image-symbol-ports.test.ts` and a browser test titled PRT-05, PRT-05a, PRE-01, GEO-05, ROU-01: corner and interior placement normals, explicit normal override, rotate and mirror move the normal, an orthogonal wire leaves along it, a 12 px capture radius with a hidden glyph at three zoom levels
- [ ] 2.2 Fix gaps (explicit normal or capture radius on a placement); verify the same tests; drop PRT-05a from the delta if nothing was missing

## 3. Packaging (G11)

- [ ] 3.1 Add `scripts/consumer-smoke.mjs` and `examples/consumer-smoke/` that packs, installs into a temp project, imports each entry point, runs `vite build` and `tsc --noEmit`, and repeats without React; verify `node scripts/consumer-smoke.mjs` exits 0, titled PKG-09, PKG-01, PKG-05
- [ ] 3.2 Fix export map, `.d.ts` or peer metadata failures; verify 3.1 again and `npm run build`
- [ ] 3.3 Document the consumption path (the host links the repository directly: git or workspace link; a registry can come later) and keep `private`/version unless the owner decides otherwise; verify docs lint and `npm pack --dry-run` file list

## 4. Coordinate conversion and external drop (G13)

- [ ] 4.1 Verify in `src/view/client-to-world.browser.test.ts` titled PKG-10, PKG-04: conversion inside a scrolled, translated and 0.5-scaled container, and after a window resize; record WebView status as manual/unverified
- [ ] 4.2 Add a palette-drop example to `examples/plain-js` using pointer events only; verify in the browser test that a drop creates one node and one history entry, and a drop outside creates none
- [ ] 4.3 Fix conversion defects found in 4.1; verify the same test

## 5. Demo checks (section 4 of the analysis)

- [ ] 5.1 Marquee: verify in `marquee-tool.test.ts` and a browser test titled INT-02 that a marquee selects every node it touches (partial overlap) in both drag directions, identically; change the direction-dependent rule accordingly and update the interaction spec and docs
- [ ] 5.2 Selection echo: verify titled INT-15, INT-02 in `selection-model.test.ts` that `selection.on` events distinguish programmatic from user changes and that API selection needs no pointer event; add `origin` if missing
- [ ] 5.3 Delete: verify titled INT-08, UX-01 in the command/browser tests that Delete on nodes and connections is one history entry, removes attached connections in the same patch, and one undo restores all
- [ ] 5.4 Shortcuts: verify titled INT-06, INT-16 in `keymap.test.ts` and `input-scope.browser.test.ts` that the `keymap` option can omit R and F (or any chord) and that keys act only with editor focus; add chord/command unbinding helper if missing
- [ ] 5.5 Pointer behavior: verify titled INT-05 in a browser test with synthetic `pointerType` pen and touch that capture holds when the pointer leaves the canvas, cancel ends the gesture, and `touch-action` does not scroll the page; record real WebView and pen runs as manual
- [ ] 5.6 Orthogonal router: verify titled ROU-01 in `orthogonal-router.test.ts` that `cornerRadius` 8 rounds bends, a port offset applies before the first bend, and short segments clamp the radius; fix and document
- [ ] 5.7 Performance: run the bench suite for 50, 200 and 500 nodes with the comparison harness (PERF-07, PERF-07a); verify by a report under `bench/report` naming browser, DPR and date; flag results outside budgets to the owner
- [ ] 5.8 Record known limits (reduced accessibility, WebView and pen unverified, anything left unfixed) in `docs/architecture.md`; verify `npm run lint`

## 6. Gates

- [ ] 6.1 Run `npm run typecheck`, `npm test`, `npm run test:browser`, `npm run lint`; verify all pass
- [ ] 6.2 Reconcile the spec deltas with results (drop unneeded IDs), update `notes.md`; verify `openspec validate add-host-integration-checks`
