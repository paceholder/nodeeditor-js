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

- Fully: PAT-01, PAT-02, PAT-03, PAT-06, PAT-07 (the submission side), TXN-01, TXN-07,
  TXN-10 (model events), TXN-10a, MOD-05, ADP-02.
- Partially:
  - PAT-08: availability and labels; the undo and redo command kinds arrive in `add-commands-and-policy`.
  - ADP-01: the read model is the local store.
  - MOD-01: public CRUD through patches.
  - TXN-09: an `external` origin is defined, but no external source exists yet.

Out of scope:

- Command planners and convenience methods, PAT-04 and PAT-05 (`add-commands-and-policy`).
- External adapters, the pending layer, snapshot and revisioned modes, and the related
  requirements TXN-02 to TXN-06, TXN-08, ADP-03 to ADP-07 and MOD-06 (Slice D). The contract
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
