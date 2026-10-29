# Proposal

## Why

`add-graph-model-core` provides records and reads but no public way to change them. Every
later feature (commands, gestures, undo, external hosts, snapshot sync) needs the same edit
path: a plain-data patch that is applied atomically, can be inverted for undo, and is announced
to subscribers. Building the adapter contract around that path now keeps external authority
(Slice D) from requiring a second code path in the editing tools.

## What Changes

- Add the patch format: an ordered list of `add` / `remove` / `update` operations on nodes,
  ports and connections. Updates carry old and new field values. Remove operations carry the
  full record and its order key, so the inverse restores everything exactly. A patch may
  carry a new ID cursor, which only ever moves forward.
- Add atomic application: each operation is validated in order against a staged overlay, then
  whole-graph integrity is checked (no dangling references), then registered validators run,
  and only then is the result committed in one store batch. A stale old value rejects the
  whole patch with a `conflict` code.
- Add inverse patch construction.
- Add a typed event hub with `change`, `failure` and `history` events. Events are delivered
  in commit order. Edits submitted from inside a handler are queued, and a throwing handler is
  isolated.
- Add a local undo/redo history: one entry per submission, undo applies the inverse, redo is
  invalidated by any new local edit, and labels and availability can be queried.
- Add the adapter contract (`ModelAdapter`, `Submission`, `SubmitResult` with accepted,
  rejected and deferred outcomes). The local adapter accepts synchronously.
- Add a `createGraphModel()` facade: reads, `submit(patch)`, `undo()`, `redo()`, history
  state, events, validator registration, and `dispose()`.

Requirements implemented:

- Fully: the rule that patches are the core change primitive, the atomic patch application rule, the inverse patches rule, the rule that exceptions are only for misuse and the one history entry per gesture rule (the submission side), the tagged edits rule and the local undo and redo rule,
  the typed events rule (model events), the reentrancy contract rule, the consistent change notification rule and the local adapter rule.
- Partially:
  - availability and labels; the undo and redo command kinds arrive in `add-commands-and-policy`.
  - the read model is the local store.
  - public CRUD through patches.
  - an `external` origin is defined, but no external source exists yet.

Out of scope:

- Command planners and convenience methods, the rule that commands are planners and the convenience methods rule (`add-commands-and-policy`).
- External adapters, the pending layer, snapshot and revisioned modes, and the related
  requirements the transaction requirements, the host-owned history rule, the adapter requirements and the revision continuity rule (Slice D). The contract
  defined here must not preclude them.
- Selection, viewport and hover events (view changes).
- Group, member and route-constraint operations (later slices).

## Capabilities

### New Capabilities

None. The requirements already live in the `patches-and-history` and `model-adapters`
baseline specs (`skip_specs: true`).

### Modified Capabilities

None.

## Impact

- New modules `src/core/data/patch/`, `src/core/edit/events/`, `src/core/edit/history/`
  and `src/core/edit/adapter/`, plus the facade `src/core/graph-model.ts`.
- `createGraphModel` becomes the main public core entry point. `GraphStore` stays internal.
- No new dependencies. The core stays headless.
