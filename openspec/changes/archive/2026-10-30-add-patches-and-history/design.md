# Design

## Context

This change builds on `add-graph-model-core`, which provides `GraphStore` (internal, mutated
only in `batch()`), `GraphReader`, the immutable records, `IdGenerator`/`IdCursor`, `Result`,
`Rejection` and `MisuseError`. Requirements: `openspec/specs/patches-and-history/spec.md` and
`openspec/specs/model-adapters/spec.md`. The core lib is ES2022 only, so `queueMicrotask`,
`console` and `structuredClone` are not available.

## Goals / Non-Goals

**Goals:**
- One write path for everything: `submit(patch)`. Commands, undo, and later snapshot diffs and
  external changes all end up as patches.
- An adapter contract that already has a deferred outcome, so external authority (Slice D)
  plugs in without changing callers.
- Exact inverses, which makes undo trivial and reliable.

**Non-Goals:**
- No pending layer or optimistic overlay yet. The local adapter commits synchronously.
- No gesture-grouping API. A gesture submits one patch (PAT-07), so one submission is one
  history entry.
- No history persistence.

## Decisions

### Module layout

```
src/core/data/patch/types.ts            Patch, PatchOp, FieldChange, ChangedIds
src/core/data/patch/stage.ts            StagedState: GraphReader over base + overlay (copy-on-write)
src/core/data/patch/apply-ops.ts        per-op checks (existence, old-value match, record validity)
src/core/data/patch/integrity.ts        post-stage reference integrity for touched entities
src/core/data/patch/apply.ts            applyPatch(store, patch, validators) → Result<AppliedPatch>
src/core/data/patch/invert.ts           invertPatch(applied) → Patch
src/core/data/patch/validator.ts        PatchValidator hook interface
src/core/edit/events/types.ts           ModelEventMap, ChangeEvent, FailureEvent, HistoryEvent
src/core/edit/events/event-hub.ts       typed hub with dispatch queue and handler isolation
src/core/edit/history/local-history.ts  undo/redo stacks of {label, patch, inverse}
src/core/edit/adapter/types.ts          ModelAdapter, Submission, SubmitResult, Revision, OperationId
src/core/edit/adapter/local-adapter.ts  synchronous authority over the store
src/core/graph-model.ts                 createGraphModel() facade
```

### Patch format

```ts
type EntityKind = "node" | "port" | "connection";
type FieldChange<V> = { readonly old?: V; readonly new?: V };   // a missing key means the field is absent
type PatchOp =
  | { op: "add"; entity: "node"; record: NodeRecord; seq?: number }
  | { op: "add"; entity: "port"; record: PortRecord }
  | { op: "add"; entity: "connection"; record: ConnectionRecord; seq?: number }
  | { op: "remove"; entity: "node"; record: NodeRecord; seq: number }
  | { op: "remove"; entity: "port"; record: PortRecord }
  | { op: "remove"; entity: "connection"; record: ConnectionRecord; seq: number }
  | { op: "update"; entity: "node"; id: NodeId; fields: NodeFieldChanges }
  | { op: "update"; entity: "port"; id: PortId; fields: PortFieldChanges }
  | { op: "update"; entity: "connection"; id: ConnectionId; fields: ConnectionFieldChanges };
interface Patch { readonly ops: readonly PatchOp[]; readonly idCursor?: IdCursor }
```

- Remove operations carry the full record. That makes the inverse a pure function of the patch
  and lets applying it check that the caller removed the state it believes exists.
- `seq` is the collection order key. A remove records it, and an add may restore it, which is
  how undo keeps the exact order (PAT-03, MOD-08). A port's order lives in its node's `ports`
  field, so adding a port also needs a node `update` of `ports`.
- `id` and `port.node` cannot be updated, so identity never changes. Connection `from`/`to`
  can be updated, which keeps the ID when reconnecting (CON-07, CON-08).
- *Alternative considered:* JSON Patch (RFC 6902) over a document tree. Rejected because it
  addresses by path and array index, which contradicts stable identity, and has no old values.
- *Alternative considered:* Immer patches. Rejected because they add a dependency and are
  path-based for the same reason.

### Atomic application pipeline

1. **Staging.** Each operation runs against `StagedState` (base reader plus overlay maps).
   An add must not collide with an existing ID. A remove or update requires the entity, and
   the old record or old field values must deep-equal the current ones; otherwise the result
   is `conflict`. The resulting record is checked with `validate-records`.
2. **Integrity.** For every entity that was removed or changed, connections in the staged
   state must reference existing ports whose `node` matches. Otherwise the result is
   `dangling-reference` (PRT-02 "remove port without its connections"). Only touched entities
   are checked, so state that was already invalid but safe stays as it is (MOD-09a).
3. **Validators.** Registered `PatchValidator`s run in registration order:
   `validate(staged: GraphReader, patch, ctx): Rejection | undefined`. Connection policy and
   capability checks plug in here in `add-commands-and-policy`, so raw patches cannot bypass
   them (CON-03).
4. **Commit.** One `store.batch()` applies the overlay. The cursor becomes the maximum of the
   current and patch cursors as decided by the generator, and the revision increments.
5. **Notify.** After the batch closes, a `change` event is queued (MOD-05).

Any failure in steps 1 to 3 returns `{ ok: false, error }` and the store is untouched.

### Inverse

`invertPatch` reverses the operation order. Add becomes remove (with the `seq` that was
assigned), remove becomes add (with the record and `seq`), and update swaps `old` and `new`.
The ID cursor is never inverted, so undoing a create does not free the ID (MOD-03a).

### Adapter contract and outcomes

```ts
interface Submission {
  readonly operationId: OperationId; readonly baseRevision: Revision;
  readonly patch: Patch; readonly label: string;
  readonly history: "record" | "skip"; readonly origin: "local" | "undo" | "redo";
}
type SubmitResult = Accepted | Rejected | Deferred;
interface Accepted { ok: true; status: "accepted"; operationId; revision; changed: ChangedIds }
interface Rejected { ok: false; status: "rejected"; operationId; error: Rejection }
interface Deferred { status: "queued" | "pending"; operationId; settled: Promise<Accepted | Rejected | UnknownOutcome> }
interface ModelAdapter {
  readonly authority: "local" | "external";
  readonly history: "local" | "host";
  submit(submission: Submission): Accepted | Rejected | Deferred;
  undo(): SubmitResult; redo(): SubmitResult; historyState(): HistoryState;
  dispose(): void;
}
```

- Terminal outcomes are Result-shaped (`ok`). `Deferred` has no `ok`, so callers must check
  `status` and cannot mistake a pending edit for an accepted one (TXN-02, later).
- The local adapter wraps the read-model store, so local mode keeps no second copy. External
  adapters (Slice D) will instead feed the read model through inbound `reset` and `changes`
  messages and return `pending`.
- `Revision` and `OperationId` are branded strings. The local model mints `r<n>` and `op<n>`.
- A stale `baseRevision` is not rejected locally on its own. The per-field old-value check
  decides instead. This is cheap and enough for one writer; the revisioned mode adds strict
  base checks.
- *Alternative considered:* `submit` returning `Promise` always. Rejected because ADP-02
  requires the result before the call returns, and an `await` per drag commit would also make
  synchronous tests awkward.

### Events and reentrancy

- `on(type, handler)` returns an unsubscribe function. The event types are `change`
  (`{ revision, patch, origin, operationId, changed }`), `failure` (a rejection or a handler
  error), `history` (availability and labels) and `reset` (`{ revision, origin }`, whole-document
  replacement). `reset` carries no patch: listeners must discard derived state and re-read the
  reader. Snapshot load emits it now and adapter resynchronization will later (MOD-06).
- Dispatch is FIFO. A `submit` called while a dispatch is running returns
  `{ status: "queued", settled }`. The submission is applied after the current event has
  reached every handler, and its events follow (TXN-10a).
- Each handler call is wrapped. A throw becomes a `failure` event, and the remaining handlers
  still run. An error thrown by a `failure` handler is not re-dispatched. It is surfaced
  through the `onHandlerError` option, which by default rethrows on a rejected promise so the
  host's unhandled-rejection reporting sees it.

### Local history

- Each accepted submission with `history: "record"` pushes `{ label, patch, inverse }`, and
  any new recorded local edit clears the redo stack (TXN-07).
- `undo()` submits the inverse with origin `undo` through the same pipeline. If it is rejected
  (it should not be in local mode), the stacks are unchanged and a `failure` event fires.
- `historyState()` returns `{ canUndo, canRedo, undoLabel?, redoLabel?, reason? }` (PAT-08).
- Changes with origin `external` (Slice D) never enter the stacks (TXN-09).

## Risks / Trade-offs

- **[Old-value deep-equality costs time on large payloads]** → Only the fields that changed
  are compared, and records are shared by reference, so an identity check short-circuits most
  comparisons.
- **[Queued reentrant submits return deferred even in local mode]** → This is documented and
  only happens inside handlers. Normal calls are synchronous.
- **[Remove operations carry full records, so delete patches are large]** → This is
  acceptable because exact undo and stale-delete detection need it.
- **[Validators run on every patch]** → Validators receive the patch and should inspect only
  the operations they care about. A test-documented contract keeps them O(touched entities).
