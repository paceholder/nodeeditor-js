# Tasks

## 1. Core command (core/edit)

- [ ] 1.1 Add the `dock` command to the `Command` union and planner composing `planMoveNodes` and the connect planner into one patch (D4); verify `dock.test.ts` titled DCK-03, INT-08, CON-03, PRT-04: one patch holds the move and the add, one undo reverts both, a policy rejection (wrong type, occupied input) rejects the whole command with no ops, a choice outcome is returned unresolved, and the command is rejected the same way through `execute` and `can`
- [ ] 1.2 Verify atomicity in the history: `dock` yields one history entry labeled "Dock" and redo reapplies both; `history` test titled DCK-03, TXN-01

## 2. Candidate finder (view/interact)

- [ ] 2.1 Implement `dock-candidates.ts` (D1, D2, D3); verify `dock-candidates.test.ts` titled DCK-01, PRT-05, MOD-08: radius is in CSS pixels at zoom 0.5 and 2, compatible beats nearer incompatible, ties break by port ID, facing normals break equal distances, only the nearest incompatible port is reported, a policy-excluded occupied port is not a candidate, results are identical for shuffled input order
- [ ] 2.2 Hysteresis; verify the same file with "Hysteresis" (DCK-01): jittering by less than the margin across 200 seeded frames never alternates two equal candidates, and a clearly better candidate wins
- [ ] 2.3 Add the docking option surface to `ToolOptions` and the `dock` preview kind with its painter, including target states and the reason text (D4, D7); verify the preview painter test titled PRT-06, DCK-01 that compatible, incompatible and occupied states render distinct glyphs and `connect` mode paints no ghost

## 3. Move tool integration (view/interact)

- [ ] 3.1 Integrate docking into the select-move state machine: evaluate candidates only when enabled and not suppressed, snap or keep offset by mode, commit `dock` on release, plain `moveNodes` otherwise (D3, D4, D7); verify `select-move-tool.test.ts` additions titled DCK-02, DCK-03, DCK-06, INT-05, INT-08: disabled means no evaluation and a plain move, the modifier suppresses and previews nothing, `snap` commits the coincident position, `connect` keeps the released position, Escape and lost capture commit nothing, 200 moves give one command
- [ ] 3.2 Browser test `src/view/docking.browser.test.ts` in Chrome titled DCK-01, DCK-03, DCK-04, DCK-05, DCK-06: drag a node next to another and release, assert a single undo removes both the move and the connection (snap and connect modes), pulling the docked node away keeps the connection with the same ID, a selected zero-length connection draws its mark and can be deleted via the command API, an incompatible neighbour shows its reason and the node still moves freely
- [ ] 3.3 Draw the zero-length selection mark in the connection painter (D8); verify the painter test titled DCK-05, UX-02 for path length below one pixel selected versus unselected

## 4. After add-async-connection-policy lands

- [ ] 4.1 Feed pending evaluations into the finder and add `onPendingRelease` with `move-only` and `wait` (D6); verify `select-move-tool.test.ts` and the browser test titled DCK-07, TXN-05, TXN-06: pending previews the pending state and does not snap, `move-only` commits only the move, `wait` commits both after an accepted verdict and the move alone after a rejection, a late verdict after release has no effect, the chosen candidate does not flip while verdicts arrive

## 5. Docs and gates

- [ ] 5.1 Document docking options, modes and hysteresis in `docs/guide-view.md`, update the architecture note if it mentions docking as planned, and enable it in `examples/plain-js`; verify `npm run demo` shows the preview and docks in both modes, and `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:browser` pass
