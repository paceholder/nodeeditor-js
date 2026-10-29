# Tasks

## 1. Patch format and inverse

- [ ] 1.1 Add `src/core/data/patch/types.ts` (Patch, PatchOp, FieldChange, ChangedIds); verify `npm run typecheck` and that `patch-types.test.ts` "PAT-01 plain data" shows a patch survives JSON stringify/parse unchanged
- [ ] 1.2 Add `src/core/data/patch/invert.ts`; verify `invert.test.ts` "PAT-03" shows inverting twice yields the original patch, add/remove carry `seq`, and the ID cursor is never inverted

## 2. Atomic application

- [ ] 2.1 Add `src/core/data/patch/stage.ts` (StagedState overlay implementing GraphReader); verify `stage.test.ts` shows the base store is untouched while the overlay answers reads
- [ ] 2.2 Add `src/core/data/patch/apply-ops.ts` with existence, collision, old-value and record-validity checks; verify `apply.test.ts` "PAT-02" rejects a stale old value with `conflict` and an add with an existing ID with `duplicate-id`
- [ ] 2.3 Add `src/core/data/patch/integrity.ts`; verify `apply.test.ts` "PRT-02" rejects removing a connected port without its connections with `dangling-reference`, and "MOD-09a" leaves an untouched pre-existing over-limit attachment alone
- [ ] 2.4 Add `src/core/data/patch/validator.ts` and `src/core/data/patch/apply.ts` (stage → integrity → validators → one batch); verify `apply.test.ts` "PAT-02 atomic" adds two nodes plus a dangling connection and observes zero changes, and "MOD-05" shows a store listener sees only fully consistent state
- [ ] 2.5 Verify exact round trips: `apply.test.ts` "PAT-03 round trip" deletes a node with two connections, applies the inverse, and compares `GraphState` JSON with the before-state, including order

## 3. Events

- [ ] 3.1 Add `src/core/edit/events/types.ts` and `src/core/edit/events/event-hub.ts`; verify `event-hub.test.ts` "TXN-10" checks commit-ordered `change` events that carry patch, revision and origin
- [ ] 3.2 Implement queued dispatch for reentrant submits; verify `event-hub.test.ts` "TXN-10a" shows every handler receives event 1 before any handler receives event 2 when a handler submits during dispatch, and the reentrant call returns `status: "queued"` whose `settled` resolves accepted
- [ ] 3.3 Implement handler isolation; verify `event-hub.test.ts` "TXN-10a handler error" shows a throwing handler does not stop the others, the change stays applied, a `failure` event fires, and an error inside a failure handler reaches `onHandlerError` without looping

- [ ] 3.4 Add the `reset` event (`{ revision, origin }`) to `ModelEventMap` and a hub `emitReset` used for whole-document replacement; verify `event-hub.test.ts` "MOD-05 reset event" shows handlers receive `reset` in order with `change` events, a throwing handler is isolated like others, and no patch is carried

## 4. Adapter contract, local adapter, history

- [ ] 4.1 Add `src/core/edit/adapter/types.ts` (ModelAdapter, Submission, SubmitResult, Revision, OperationId, HistoryState); verify `npm run typecheck` and a type-level test showing `Deferred` cannot be narrowed to accepted without checking `status`
- [ ] 4.2 Add `src/core/edit/adapter/local-adapter.ts`; verify `local-adapter.test.ts` "ADP-02" shows a valid patch's result is returned synchronously and the reader reflects it before `submit` returns
- [ ] 4.3 Add `src/core/edit/history/local-history.ts`; verify `local-history.test.ts` "TXN-07" covers one entry per submission, undo restoring IDs and order exactly, redo cleared after a new edit, and `history: "skip"` not recorded
- [ ] 4.4 Verify MOD-03a across undo: `local-history.test.ts` "MOD-03a undo" creates `n1`, undoes, creates again, and expects an ID other than `n1`
- [ ] 4.5 Verify history availability: `local-history.test.ts` "PAT-08" shows an empty history reports `canUndo: false` with a reason, `undo()` returns a rejection, and labels follow the submissions

## 5. Model facade and exports

- [ ] 5.1 Add `src/core/graph-model.ts` (`createGraphModel({ idGenerator?, freezeRecords?, onHandlerError? })`); verify `graph-model.test.ts` "MOD-01" creates, reads, updates and deletes nodes, ports and connections via patches in Node
- [ ] 5.2 Implement `dispose()`; verify `graph-model.test.ts` "PAT-06" shows calls after dispose throw `MisuseError`, a second dispose is a no-op, and handlers are released
- [ ] 5.3 Verify one submission per gesture at the model level: `graph-model.test.ts` "PAT-07" submits one patch for a 200-step simulated drag (previews are not submitted) and finds exactly one history entry
- [ ] 5.4 Export the facade, patch types, `invertPatch` and adapter types from `src/core/index.ts`, with TSDoc on the submit outcome states and reentrancy; verify `src/core/index.test.ts` imports them in Node and `npm run build` succeeds
- [ ] 5.5 Run `npm test`, `npm run typecheck` and `npm run lint`; all pass
