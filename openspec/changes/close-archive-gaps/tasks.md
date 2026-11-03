# Tasks

## 1. Spec deltas

- [ ] 1.1 Land the spec deltas in `specs/` for performance, canvas-view, interaction, model-adapters, routing, packaging, graph-model and composite-signatures; verify `openspec validate close-archive-gaps --strict` passes and each MODIFIED requirement keeps its previous scenarios (compare against `openspec/specs/` with `git diff` after archive)

## 2. Project context (no spec delta)

- [ ] 2.1 Add a non-goals paragraph to the `context` in `openspec/config.yaml`: no nested subgraph navigation, capability negotiation, graph execution, marketplace, or mobile-first design in R1; also list as deferred: React content inside nodes, worker offload of the engine, aliases, full screen-reader support, animated wire decorations, other render backends; verify by reading `openspec/config.yaml` and `openspec validate --specs --strict`
- [ ] 2.2 Record in the same `context`, under the 2026-10-29 trimmed items, that the keyboard connection chooser was deliberately dropped (keyboard coverage stays select, move, delete, undo, plus UX-01 commands); verify by reading `openspec/config.yaml` that the UX-01 and UX-02 specs do not contradict it

## 3. Performance method (PERF-01, PERF-02, PERF-02a, PERF-02d, PERF-04)

- [ ] 3.1 Extend the benchmark scripts' report with warm-up, three repeats, raw samples, machine record, long-task and route-work counts, and per-browser and per-pixel-ratio separation; verify the bench report test (or `npm run` benchmark command in the perf docs) titled PERF-01 shows the fields, and a doc check that no pooled figure exists
- [ ] 3.2 Add fixture generators F-ALL, F-DENSE and F-REACT (seeded); verify a Node test titled PERF-01 generating each twice with one seed gives identical snapshots, and that F-DENSE has no budget entry
- [ ] 3.3 Name the approved reference machine and measure the memory ceiling after its first run; verify the baseline JSON `machine` record and the docs entry; this task is blocked until the user names the machine (see design open questions)
- [ ] 3.4 Add the obstacle-refinement (20 routes) measurement, separate first-usable-frame and asset-load figures, and the heap check over 30 mount cycles; verify PERF-02a and PERF-02d cases in the browser bench or browser test
- [ ] 3.5 Check that parallel-edge offsets use an incrementally maintained index; verify a headless test titled PERF-04 that adding a third parallel connection recomputes only the sibling set

## 4. View and interaction (LAY-01, REN-02, REN-06, OVL-04, INT-05c, UX-02, ROU-09)

- [ ] 4.1 Verify REN-02 side-effect freedom and low-detail non-deletion; a test titled REN-02 that zooming through low detail leaves the model revision and snapshot unchanged
- [ ] 4.2 Add the transient overlay connection hook; verify `*.browser.test.ts` titled OVL-04 (follows pan and zoom, not pickable) and `entry-points.test.ts` for the new public name
- [ ] 4.3 Make the canvas ignore a second pointer during a gesture and set touch-action so the page does not scroll under a drag; verify a gesture-state test titled INT-05c and a browser test with simulated touch pointers
- [ ] 4.4 Document the accessibility known limit and remaining barriers with the support matrix, and the Canvas2D-only decision and React-content limits in `docs/guide-view.md` and `docs/architecture.md`; verify by doc check (UX-02, LAY-01, REN-06)
- [ ] 4.5 Add the two-kinds-one-router case; verify a test titled ROU-09 that two kinds with different painters produce identical routes and independent painted styles

## 5. Adapters, model, signatures (ADP-06, MOD-13, SIG-01)

- [ ] 5.1 Document the announce-changes rule in `docs/guide-using-the-model.md`; verify by doc check and a test titled ADP-06 that an unannounced backing-store change leaves the read model unchanged
- [ ] 5.2 Document snapshot, descriptor and subscription-value ownership and lifetime in `docs/guide-core-model.md`; verify a test titled MOD-13 that a kept subscription value is unchanged after a later change
- [ ] 5.3 Test that equal labels with different keys do not match in the default policy; verify a test titled SIG-01

## 6. Packaging (PKG-11, PKG-12)

- [ ] 6.1 Write the verification-layer statement and the extension acceptance checklist (with pending markers) in `docs/architecture.md` or a new section of `README.md`; verify by doc check that every item names a test or example and `npm run lint` passes

## 7. Gate

- [ ] 7.1 Run `openspec validate close-archive-gaps --strict`, `npm test`, `npm run typecheck`, and `npm run lint`; verify all pass
