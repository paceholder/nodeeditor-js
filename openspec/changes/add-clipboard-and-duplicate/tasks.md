# Tasks

## 1. Command contract (core/edit)

- [ ] 1.1 Add the `paste` and `duplicate` kinds and the `Placement` type to `Command` in `src/core/edit/commands/types.ts` (D2), the `FragmentPlanners` interface and the optional `fragments` slot on `PlanContext` and `CommandEnvironment` (D1), and the optional `excluded` list on `PlanEffects`; verify `npm run typecheck` (including the core-only pass) fails nowhere except the exhaustive `planCommand` switch
- [ ] 1.2 Add rejection codes `unsupported-command`, `empty-fragment`, `not-a-fragment` and `clipboard-unavailable` to `RejectionCode` in `src/core/base/result.ts`; verify `src/core/base/result.test.ts` still passes
- [ ] 1.3 Dispatch `paste`/`duplicate` in `src/core/edit/commands/plan.ts` to `ctx.fragments`, rejecting with `unsupported-command` without it; verify a test in `src/core/edit/commands/graph-model-commands.test.ts` titled PAT-04 that a command API built without the slot rejects both kinds and changes nothing

## 2. Fragment extraction and clipboard text (core/io/fragment)

- [ ] 2.1 Create `src/core/io/fragment/fragment-types.ts` (envelope `ClipboardFragment`, `ExternalConnection`, `ExcludedReference`, `FRAGMENT_FORMAT`) and `bounds.ts` (centre-origin frames, odd quarter turns swap width and height); verify `bounds.test.ts` titled EDT-03 for rotated and unrotated nodes, and `npx vitest run src/architecture.test.ts` passes with no import from `core/space`
- [ ] 2.2 Implement `extractFragment` in `extract.ts` (D3: paint-order nodes, presentation-order ports, internal connections selected or not, external list, original IDs kept, codecs or `checkJson` for payloads, `empty-fragment` without nodes); verify `extract.test.ts` titled EDT-03, EDT-04, MOD-08, SER-02 covering an unselected internal connection, an external connection listed not copied, a node with edited ports, a Date payload rejected without a codec and accepted with one, and identical output for equal selections
- [ ] 2.3 Implement `fragmentToText` and `parseFragmentText`/`parseFragmentValue` in `fragment-text.ts` (D4: length check before parse, marker, version, `validateSnapshot` in fragment mode with limits, external entry shape, codec decode, all errors sorted by path); verify `fragment-text.test.ts` titled EDT-03a, EDT-05, SAFE-01, SAFE-03, SER-06: round trip is deeply equal and text-identical, plain text gives `not-a-fragment`, a dangling connection gives `dangling-endpoint`, an over-limit fragment gives `limit-exceeded`, an over-length text is rejected without calling `JSON.parse` (spy), and malformed input never throws

## 3. Paste and duplicate planning (core/io/fragment)

- [ ] 3.1 Implement `remap.ts` (old-to-new ID maps in the D5 allocation order, endpoint rewriting) and the placement transform; verify `remap.test.ts` titled EDT-03, MOD-03 that every node, port and connection ID is new, endpoints point at the new ports of the new nodes, and allocating after a deletion never reuses a retired ID
- [ ] 3.2 Implement `planPaste` in `plan-paste.ts` (D5: validate, `unknown-type`/`not-creatable`, remap, `center`/`offset` placement, front `z` keeping relative order, one add-only patch labelled "Paste"); verify `plan-paste.test.ts` titled EDT-03, EDT-05, PAT-04: pasting twice gives disjoint fresh IDs, the bounding-box centre lands on `at`, `offset` moves every node by `by`, the source entities are unchanged, and an unregistered type rejects naming it
- [ ] 3.3 Implement external-reference handling (D6: default exclude reported in `effects.excluded`; `preserve` re-creates via `ctx.policy.evaluate` or excludes with `endpoint-missing` or the policy's code); verify `plan-paste-external.test.ts` titled EDT-04 covering all three scenarios of EDT-04 in the delta spec
- [ ] 3.4 Implement `planDuplicate` as extract-then-paste on the current reader, labelled "Duplicate"; verify `plan-duplicate.test.ts` titled EDT-03 ("Duplicate connected pair", "Dynamic ports and payload copied") and that duplicate and paste of the same selection with the same placement produce equal patches apart from labels

## 4. Model facade and public API

- [ ] 4.1 Wire the fragment planners into `createGraphModel` and add the `payloadCodecs` and `fragmentLimits` options (D10); verify `src/core/io/fragment/paste-model.test.ts` titled EDT-03, EDT-05, TXN-01, INT-08 through `model.execute`: one paste is one history entry, one undo removes all pasted entities, the accepted result lists the new IDs as changed, an oversized fragment and a read-only model reject with the graph unchanged, and a host policy refusing an internal connection rejects the whole paste (CON-03)
- [ ] 4.2 Add a cut sequence test in `src/core/io/fragment/cut-model.test.ts` titled EDT-06, EDT-02: extract then `deleteEntities` adds one history entry, undo restores original IDs, and a delete-protected node makes `can(deleteEntities)` unavailable before any extraction
- [ ] 4.3 Export `extractFragment`, `fragmentToText`, `parseFragmentText`, `FRAGMENT_FORMAT` and the fragment types from `src/core/index.ts`; verify `src/core/index.test.ts` lists them and `npm run build` emits their declarations

## 5. View clipboard service and commands (headless)

- [ ] 5.1 Implement `src/view/interact/clipboard/placement.ts` (D7) as a pure function; verify `placement.test.ts` titled EDT-03 for pointer centre, growing offset without a pointer (1, 2, 3 steps), same-point repeat adding the offset, counter reset on a new copy, and duplicate's single step
- [ ] 5.2 Implement `clipboard-service.ts` (D9) with an injected `SystemClipboard` and pointer source: in-app buffer, `copy`, `cut`, `paste`, `duplicate`, `exportText`, `importText`, `pasteFromSystem`, `on`, `dispose`; selection replaced by the changed IDs after accept, and by `settled` for pending results; verify `clipboard-service.test.ts` titled EDT-03, EDT-04, EDT-05, EDT-06 with a fake system clipboard that rejects reads (fallback via `exportText`/`importText`), a foreign text paste reporting `not-a-fragment` without using the buffer, and a rejected cut leaving the buffer unchanged
- [ ] 5.3 Add `edit.copy`, `edit.cut`, `edit.paste`, `edit.duplicate` to `COMMAND_IDS` and register them from `clipboard-commands.ts` with availability (copy needs a selected node; cut also needs delete availability; paste dry-runs the buffer or needs an editable, non-read-only model); verify tests in `src/view/interact/commands/commands.test.ts` titled INT-07, MOD-11 that availability explains each refusal and that paste via the command and via `view.clipboard.importText` of the same text produce identical patches
- [ ] 5.4 Add `Mod+C`, `Mod+X`, `Mod+V`, `Mod+D` to `DEFAULT_KEYMAP` with `native: true` on the first three (new optional `KeyBinding` field); verify `keymap.test.ts` titled UX-01 resolves each chord on both platforms and that `Ctrl+C` on macOS does not resolve to copy

## 6. DOM wiring (browser)

- [ ] 6.1 Track the last pointer world position and `pointerleave` in `src/view/interact/input/dom-input.ts`, and skip `preventDefault()` for native chords when the clipboard bridge is attached; verify `dom-input.browser.test.ts` titled INT-06, UX-01 that a Mod+C keydown is not default-prevented while Mod+D is
- [ ] 6.2 Implement `clipboard-events.ts` (copy/cut/paste listeners on the root, `setData`/`getData` on `text/plain`, `preventDefault()` on handled events, one-task fallback to the in-app buffer when no event follows a native chord); verify `src/view/interact/clipboard/clipboard-events.browser.test.ts` titled EDT-03, EDT-05, INT-06 dispatching synthetic `ClipboardEvent`s with a `DataTransfer`, including a copy event from a focused overlay text field that leaves the graph alone
- [ ] 6.3 Wire the service into `src/view/view-editing.ts` and `mount-view.ts`: `InputOptions.clipboard`, `ViewHandle.clipboard`, `navigator.clipboard` read only at mount, `dispose()` removing listeners; verify `src/view/clipboard.browser.test.ts` titled UX-01, EDT-03, EDT-06, INT-08, LIFE-01: the "Copy and paste shortcuts", "Duplicate shortcut" and "Cut is one history entry" scenarios end to end in Chrome, and no listener remains after dispose
- [ ] 6.4 Export the clipboard types (`PasteOutcome`, clipboard options) from `src/view/index.ts` and the service building blocks from `src/view/advanced.ts`; verify `src/view/entry-points.test.ts` (PKG-01) and an SSR import test that importing the view entry touches no `navigator` (REA-06, PKG-05)
- [ ] 6.5 Manually check keyboard copy, cut, paste (including cross-tab paste and foreign text) and duplicate in current Firefox and Safari on the plain-js demo; verify by recording the browser versions and results in this change's notes, and report any browser that needs the one-task fallback

## 7. Example

- [ ] 7.1 Add Export and Import fragment buttons with a plain `<textarea>` dialog to `examples/plain-js` using `view.clipboard.exportText`/`importText`, and show excluded external connections in the status line; verify `npm run demo:build` succeeds and a headless Chrome run of the demo copies, pastes and imports with no console errors

## 8. Gates

- [ ] 8.1 Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:browser`, `npm run build` and `npm run bench:size` (core ≤ 75 KiB, view ≤ 150 KiB gzip); all pass, `src/architecture.test.ts` included, and every new file stays under 300 lines

## 9. Documentation (separate commit)

- [ ] 9.1 Update `docs/guide-using-the-model.md` (fragments, `paste`/`duplicate` commands, placement, external references, codecs and limits, why paste rejects unregistered types) and `docs/format.md` (clipboard envelope, marker, external list); verify every new rejection code and `FRAGMENT_FORMAT` appear in the docs by grep
- [ ] 9.2 Update `docs/interaction.md` (the keymap table gains Mod+C/X/V/D, a section on the native clipboard route and its fallback) and `docs/guide-view.md` (`view.clipboard`, `InputOptions.clipboard`, browser clipboard trade-offs); verify by grepping for `edit.copy`, `edit.duplicate` and `pasteFromSystem`
- [ ] 9.3 Update `docs/architecture.md` with the `core/io/fragment` module and the injected `FragmentPlanners` slot, with a Mermaid diagram of the dependency direction; verify the diagram renders in a Markdown preview and names no upward import

## Workflow follow-up

- Commit each self-contained group with its tests (requirement IDs in messages); commit group 9 separately.
- Archive the change after review with `/opsx:archive add-clipboard-and-duplicate`.
