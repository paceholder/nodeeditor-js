# Tasks

## 1. Intent decoder (core/edit)

- [ ] 1.1 Add `src/core/edit/intents/` with the `Intent` union and `decodeIntents(submission, before)` (D10), exported from `src/core/index.ts`; verify `intents.test.ts` titled ADP-08, INT-08, PAT-07: a three-node move is one intent, a node delete carries its connections, reconnect, create node with ports, resize/rotate/mirror, and a seeded property test that decoded op counts equal the patch's op count
- [ ] 1.2 Check the decoder against patches planned by the real commands (`move`, `deleteSelection`, `connect` with `replacing`, `rotate`, `mirror`); verify `intents-commands.test.ts` titled ADP-08, TXN-07 (labels untouched, one submission per command)

## 2. Snapshot diff contract (core/io)

- [ ] 2.1 Add the SNP-04 cases to the existing diff tests, fixing `diff.ts` only where a case fails; verify `diff.test.ts` titled SNP-04, MOD-08, PAT-03: equal gives no ops, one moved node one update, removed node removes ports and connections, apply then export equals the snapshot, inverse restores, and output is identical across two runs

## 3. Adapter and model (core/io/sync, core/graph-model)

- [ ] 3.1 Extract the narrow `AuthorityAdapter` interface from `LocalAdapter` and let `createGraphModel` take it (D9) without behavior change; verify the whole existing `npm test` passes and `graph-model.test.ts` gains an ADP-02 case that the default path is still the local adapter
- [ ] 3.2 Add `core/io/sync/` to the layer table in `src/architecture.test.ts`; verify `npm test -- architecture` passes and a wrong-way import still fails
- [ ] 3.3 Implement pending layer, `submit` flow and settling (D2, D5, D7) in `snapshot-adapter.ts`; verify `snapshot-adapter.test.ts` titled ADP-05a, TXN-02, TXN-01, ADP-01: optimistic display with confirmed unchanged, acceptance retires without a second event, rejection rolls back in one event plus a failure event, a slow host does not block reads, results are deferred with `settled`
- [ ] 3.4 Implement `pushSnapshot` with scratch rebase and conflict marking (D3) in `snapshot-push.ts`; verify `snapshot-push.test.ts` titled ADP-05b, ADP-05c, ADP-03, SER-04, TXN-09: single update for a changed node, empty diff emits nothing, invalid push leaves pending untouched, no reset and no history change, push during a pending move, push already containing the edit, push deleting the target marks it conflicted, pushed changes are not undo entries
- [ ] 3.5 Implement unknown outcome, timeout option and `resync-requested` (D5); verify `snapshot-unknown.test.ts` titled ADP-05e, TXN-04 with a fake clock: no resubmission, event published once, state queryable, settle after a resync push
- [ ] 3.6 Implement host-owned and local history for the adapter (D8) and `createSnapshotModel` (D9); verify `snapshot-history.test.ts` titled ADP-05f, TXN-08, PAT-08, TXN-09: undo forwarded and pending, availability and reason from the host, local undo ignores pushes, undo of an accepted edit submits the inverse
- [ ] 3.7 Overlapping edits policy (D6); verify `snapshot-overlap.test.ts` titled TXN-06: two moves of one node are applied to the view at once, handed to the host one after another in order with their base revisions (the second only after the first is answered), and the second is rolled back when the host rejects it; a pending-edit versus refresh conflict is logged and pan-level reads stay synchronous
- [ ] 3.8 Cost check; verify a benchmark case (`npm run bench` Node suite, titled ADP-05b) pushing a one-node change into 500 and 5000 node models and record the times in `notes.md`

## 4. View (view/interact, view/mount)

- [ ] 4.1 Add optional `involved()` to tools and implement it for connect, select-move, resize and route-edit (D4); verify each tool's existing test file gains a case titled ADP-05d naming the entities of a running gesture
- [ ] 4.2 Router subscription to external changes, `CancelReason` `"external-change"` and the `gesture-cancelled` view event; verify `tool-router.test.ts` titled ADP-05d, TXN-09: unrelated change keeps the gesture, touching change cancels it with ids, a cancelled gesture submits nothing, and `entry-points.test.ts` passes with the new names
- [ ] 4.3 Browser test pushing snapshots into a mounted view; verify `src/view/snapshot-sync.browser.test.ts` in Chrome titled ADP-05b, ADP-05d: a selected node, a changed viewport and a dragged other node all survive a push, release commits one move submission, a push removing the dragged node cancels the drag with an event, and no history entry is added by pushes

## 5. Example and docs

- [ ] 5.1 Add `examples/host-authority/` (in-memory two-list store, fake async transport, intent-to-call mapping) and its test; verify `host-authority.test.ts` titled ADP-09, MOD-02, UC-13 runs under `npm test` and `npm run typecheck` covers the example
- [ ] 5.2 Write `docs/guide-host-authority.md` (flow diagram in Mermaid allowed in stored docs, outcomes of `plan`/`execute`, push semantics, gesture rules, unknown outcome, history modes, limits and the ID decision), update `docs/architecture.md` section 5 and link from `docs/guide-using-the-model.md`; verify `npm run lint` and a read-through that no product or host-specific wording is present

## 6. Gates

- [ ] 6.1 Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:browser`, `npm run build`, `npm run bench:size`; verify all pass and record results and sizes in `notes.md`
