# Tasks

## 1. Policy alternative keys and choosing one (core/edit)

- [x] 1.1 Add `ConnectionAlternative` (`ConnectionPlan` plus `key` and optional `label`) and use it in `PolicyOutcome.choice` in `src/core/edit/policy/types.ts`; add `ConnectionProposal.choice?: string`; give `ChoiceAlternative` in `src/core/edit/commands/types.ts` a `key` (label = policy label, else today's description) (D1); update the `choice` outcomes in `src/core/edit/policy/policy-validator.test.ts` to carry keys; verify `npm run typecheck` (including the core-only pass) and that test file pass
- [x] 1.2 Add `choice?: string` to the `connect` command and pass it into the proposal in `src/core/edit/commands/connect.ts`; a `choice` outcome for a command that named a key becomes `rejected` with `choice-required` naming the key (D1); verify a new `src/core/edit/commands/connect-choice.test.ts` titled CON-04, CON-03, CON-05, INT-08 with a kind-based test policy: "Alternatives carry keys" (two evaluations give equal keys in equal order), "Connect with a chosen alternative" (one connection of that kind, one history entry, commit validation accepts it), "Unknown or unresolved key" (rejected, no connection), and a capacity filled before the commit rejects with `capacity-exhausted`
- [x] 1.3 Export `ConnectionAlternative` from `src/core/index.ts`; verify `src/core/index.test.ts` lists it and `npx vitest run src/architecture.test.ts` passes

## 2. Release on a choice target (view/render and view/interact, headless)

- [ ] 2.1 Add the `choice` `CandidateState` and `ConnectionEvaluation.alternatives` in `src/view/render/paint/previews/preview-types.ts`, map the planner `choice` to it in `connect-evaluation.ts`, and draw a distinct glyph for it in `connect-glyphs.ts`; verify `connect-evaluation` cases in `connect-tool.test.ts` titled CON-04, UX-02 and a `connect-preview.browser.test.ts` case titled UX-02, INT-12b in Chrome that the choice glyph differs from the compatible, incompatible and pending ones ("Choice required not color-only")
- [ ] 2.2 Implement `src/view/interact/choice/choice-types.ts` (`ConnectionChooser`, `ConnectionChoiceRequest` with `source` and `target`, `ConnectionChoiceOption`) and `choice-request.ts` (the target's policy alternatives as options in policy order, keyed by the policy's alternative keys) (D2); verify `choice-request.test.ts` titled INT-12, CON-04: options follow policy order, keys equal the policy keys, and equal inputs give equal requests
- [ ] 2.3 Add the `choose` `ToolEffect`, `ToolContext.chooserInstalled`, and the release rule of D2 in `connect-tool.ts` (target = first candidate in the existing order that is compatible or requires a choice; direct accept commits; a choice with no chooser commits nothing; a choice with a chooser emits `choose` without clearing the preview); add `choose` to `effect-runner.ts`; verify `connect-tool.test.ts` cases titled INT-12, INT-12b, INT-04, INT-08: "Single valid target does not ask", "Policy offers two connection kinds" emits one `choose` and no commit, "No chooser and a policy choice" commits nothing, "No chooser and a direct accept" commits as before, "Overlapping ports are not a choice" (two compatible ports under the release point commit to the first in the existing order and emit no `choose`), and every existing connect test passes unchanged

## 3. Pending choice (view/interact, headless)

- [ ] 3.1 Implement `src/view/interact/choice/connection-choice.ts` (D4: states idle and pending, token and `AbortController`, resolve commits one `connect` with `connectionKind` and `choice`, decline, chooser error, unknown key, `cancel(reason)`, `entitiesRemoved`, chooser replacement and dispose abort and clear the preview, late answers ignored, synchronous answers handled); verify `connection-choice.test.ts` titled INT-12a, INT-08, INT-05 with deferred promises and a fake host: "Host picks an option" (one commit), "Host declines", "Escape while choosing" (signal aborted, later resolve ignored), "Target removed while choosing", "Dispose while choosing", a thrown chooser, an unknown key, and a synchronous answer committing within the same call

## 4. DOM wiring and handle API (browser)

- [ ] 4.1 Create `src/view/view-connection-choice.ts` (the choice controller, the capture-phase Escape and key listener and the press capture listener, entity-removed and reset forwarding) and add it to the mount rows of `src/architecture.test.ts`; wire it from `view-editing.ts`; add `setConnectionChooser` and `InputOptions.chooseConnection` in `view-types.ts` and a delegating member in `mount-view.ts`; verify `npx vitest run src/architecture.test.ts` and `src/view/connection-choice.browser.test.ts` titled INT-12, INT-12a, INT-08, CON-05, LIFE-01 in Chrome: drag-and-release over a two-kind port asks the chooser and choosing commits one history entry, "Press elsewhere cancels", "Escape while choosing" from a button in the overlay, "Revalidated at commit", graph shortcuts do nothing while pending, and dispose while pending aborts the signal and leaves no listener
- [ ] 4.2 Export `ConnectionChooser`, `ConnectionChoiceRequest` and `ConnectionChoiceOption` from `src/view/index.ts`, and the building blocks (`choiceOptions`, `createConnectionChoice`) from `src/view/advanced.ts`; verify `src/view/entry-points.test.ts` (PKG-01) and `src/view/import-ssr.test.ts` (REA-06, PKG-05)

## 5. Example

- [ ] 5.1 Add `examples/plain-js/choice-picker.ts` (a list of the target's alternatives at `request.world` with a world anchor, labelled from the policy label and connection kind, closing on `signal` abort) and a demo policy wrapper that returns a `choice` of two keyed connection kinds for a port pair between the two card types (other pairs keep the default policy, so the picker never appears for them); wire them from `main.ts` with a hint in `index.html`; all wording application-neutral; verify `npm run demo:build` succeeds and a headless Chrome run of the demo offers the two kinds when connecting the card nodes and creates the chosen one, cancels the picker with Escape, and logs no console errors

## 6. Gates

- [ ] 6.1 Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:browser` (installed Google Chrome only), `npm run build` and `npm run bench:size` (core ≤ 75 KiB, view ≤ 150 KiB gzip); all pass, `src/architecture.test.ts` included, and every new or changed file stays under 300 lines (`wc -l`), except `src/view/mount-view.ts` (the exception accepted earlier); record the Size section in notes.md

## 7. Documentation (separate commit)

- [ ] 7.1 Update `docs/interaction.md` with a connection-choice section (target picked by the existing order as in QtNodes, options are the target's policy alternatives, pending state, cancellation triggers, default without a chooser), with the Mermaid flow of design.md; verify by grepping for `chooseConnection` and `choice`, and that `choiceTiePx` appears nowhere
- [ ] 7.2 Update `docs/guide-view.md` (`setConnectionChooser` with an `async` example and `AbortSignal`) and `docs/guide-using-the-model.md` (alternative keys, `connect` with `choice`, the policy contract that a chosen plan's record must validate on its own); verify by grepping for `setConnectionChooser`, `ConnectionAlternative` and `choice:`
- [ ] 7.3 Update `docs/architecture.md` with the choice controller living beside the router (why a pending choice is not a router gesture); verify the diagram renders in a Markdown preview and names no upward import

## Workflow follow-up

- Commit each self-contained group with its tests (requirement IDs in messages); commit group 7 separately.
- Archive the change after review with `/opsx:archive add-connection-chooser`.
