# Tasks

Each section starts with a verification task. If it passes, keep the test as a regression test;
if it fails, the following fix task applies, otherwise mark it "not needed" in `notes.md`.

## 1. Host style

- [ ] 1.1 Verify in `examples/plain-js` and in `src/view/render/paint/host-style.browser.test.ts` named for the per-connection style at runtime rule, the theme tokens and overrides rule and the targeted invalidation rule: per-connection colour (by kind), width and dash from payload or a host function, runtime solid/dashed switch repaints only the scene layer with no history entry, selected and hovered state reaches a host node painter wrapper, hidden port glyph still paints nothing while its target works, `setTheme` light/dark switches without remount and keeps selection and viewport
- [ ] 1.2 Fix what 1.1 finds (smallest API: per-entity overrides or a style function); verify the same test passes and `npm run typecheck` is clean
- [ ] 1.3 Document the painter-wrapper pattern and theme mapping in `docs/guide-view.md`; verify `npm run lint`

## 2. Port targets and normals

- [ ] 2.1 Verify in `src/core/space/geometry/image-symbol-ports.test.ts` and a browser test named for the rule that glyph, target, label and anchor are separate, the image-symbol port normals and capture radius rule, the image-symbol node preset rule, the screen-space tolerances rule and the built-in route modes rule: corner and interior placement normals, explicit normal override, rotate and mirror move the normal, an orthogonal wire leaves along it, a 12 px capture radius with a hidden glyph at three zoom levels
- [ ] 2.2 Fix gaps (explicit normal or capture radius on a placement), including an interior port whose wire leaves along its normal; verify the same tests; drop the image-symbol port normals and capture radius rule from the delta if nothing was missing
- [ ] 2.3 Verify in `src/view/render/assets/host-symbols.test.ts` named for the host-supplied symbol images rule and the asset service with host resolver rule: one picture in two sizes and two tints, each tint under its own asset key, cached separately, and placement fractions computed in each picture's own coordinates; fix gaps and verify the same test

## 3. Packaging

- [ ] 3.1 Add `scripts/consumer-smoke.mjs` and `examples/consumer-smoke/` that packs, installs into a temp project, imports each entry point, runs `vite build` and `tsc --noEmit`, and repeats without React; add a second run that installs from a git URL pinned to a commit into an empty project and imports all four entry points; verify `node scripts/consumer-smoke.mjs` exits 0, named for the consumable build rule, the ESM package with typed entry points rule and the no global side effects rule
- [ ] 3.2 Fix export map, `.d.ts`, peer metadata (React 19 optional peer, ESM only) or install-time build failures (a `prepare` build script with the build tools available at install); verify 3.1 again and `npm run build`
- [ ] 3.3 Document the consumption path (a git dependency pinned to a tag or commit; a workspace link works only on a developer machine; a registry can come later) and keep `private: true` until a registry decision; verify docs lint and `npm pack --dry-run` file list

## 4. Coordinate conversion and external drop

- [ ] 4.1 Verify in `src/view/client-to-world.browser.test.ts` named for the external drop example rule and the examples rule: conversion inside a scrolled, translated and 0.5-scaled container, and after a window resize; record WebView status as manual/unverified
- [ ] 4.2 Add a palette-drop example to `examples/plain-js` using pointer events only; verify in the browser test that a drop creates one node and one history entry, and a drop outside creates none
- [ ] 4.3 Fix conversion defects found in 4.1; verify the same test

## 5. Demo checks

- [ ] 5.1 Marquee: verify in `marquee-tool.test.ts` and a browser test named for the selection rule that the existing `marquee` option behaves as specified: the default `direction` contains left-to-right and intersects right-to-left, `intersect` selects every node the rectangle touches (partial overlap) identically in both drag directions, and `contain` selects only fully covered nodes in both; the default does not change, so no code change is expected; fix only what the test finds and document the three values in `docs/interaction.md`
- [ ] 5.2 Selection origin: verify named for the selection change origin rule and the selection rule in `selection-model.test.ts`, the tool tests and `src/view/selection-event.browser.test.ts` that `replace`, `add`, `toggle`, `clear` and `apply` take an `origin` argument defaulting to `"api"`, that the `"selection"` event of `view.on` carries it, that every built-in tool (click, marquee, select-move, connect, route-edit) passes `"user"`, that pruning of entities that left the model (a delete command, a snapshot push, a reset) reports `"model"`, that selection by API needs no pointer event, and that selecting an unknown ID is ignored and reports no change; add the argument, the event field, and the model's reader passed to `apply` when the selection is bound (today only `bindToModel`'s pruning looks at the model); add the origin of the last change to the snapshot of the React selection hook, named for the selection change origin rule and the one event channel rule in `src/react/hooks.browser.test.ts`
- [ ] 5.3 Delete: verify named for the one committed edit per gesture rule and the keyboard editing shortcuts rule in the command/browser tests that Delete on nodes and connections is one history entry, removes attached connections in the same patch, and one undo restores all
- [ ] 5.4 Shortcuts: verify named for the input scoping rule and the shortcut unbinding and focus scope rule in `keymap.test.ts` and `input-scope.browser.test.ts` that the `keymap` option can omit or rebind any chord, that a host can add bare keys (R, F), that keys act only with editor focus or while a host predicate is true, and that keys typed in a text field never run a graph command; add the unbinding helper, bare-key bindings and predicate option if missing
- [ ] 5.5 Pointer behavior: verify named for the gesture lifecycle and cancellation rule in a browser test with synthetic `pointerType` pen and touch that capture holds when the pointer leaves the canvas, cancel ends the gesture, and `touch-action` does not scroll the page; record real WebView and pen runs as manual
- [ ] 5.6 Orthogonal router: verify named for the built-in route modes rule in `orthogonal-router.test.ts` that `cornerRadius` 8 rounds bends, a port offset applies before the first bend, and short segments clamp the radius; fix and document
- [ ] 5.7 Performance: run the React Flow comparison bench harness for 50, 200 and 500 nodes plus a 2000-node stress fixture; verify by a report under `bench/report` naming browser, DPR and date; flag results outside budgets to the owner
- [ ] 5.8 Record known limits (reduced accessibility, WebView and pen unverified, anything left unfixed) in `docs/architecture.md`; verify `npm run lint`

## 5a. Fit on first content

- [ ] 5a.1 Verify named for the fit on first content rule and the initial fit and zoom limits rule in `src/view/initial-fit.browser.test.ts` how `initialFit` behaves today with a model that is empty at mount: add a setting on the fit options (`initialFit` is `FitOptions | true` today; for example `when: "content"`) that fits once when the first non-empty content appears, and cover content arriving in several pushes (one fit only), a viewport already changed by the user or the host before content arrives (the view does not move), and unmount before content arrives (listeners and frames removed, no later fit); verify the same test, the React prop in `src/react/node-editor-options.browser.test.ts` accepts the value, and `docs/guide-view.md` and `docs/guide-react.md` name it; drop the fit on first content rule from the delta if the existing option already covers it

## 6. Gates

- [ ] 6.1 Run `npm run typecheck`, `npm test`, `npm run test:browser`, `npm run lint`; verify all pass
- [ ] 6.2 Reconcile the spec deltas with results (drop unneeded IDs; every requirement that stays has a test naming its ID), update `notes.md`; verify `openspec validate add-host-integration-checks`
