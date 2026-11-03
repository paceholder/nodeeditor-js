# Design

## Context

Observed in the code (not assumptions):

- `ModelAdapter` (`core/edit/adapter/types.ts`) already has `authority: "local" | "external"`,
  `history: "local" | "host"`, `submit` returning `Accepted | Rejected | Deferred`, and the
  `unknown` outcome. Only `createLocalAdapter` implements it. `GraphModelCore` is built on
  `LocalAdapter`, which also exposes `reader`, `idGenerator`, `on`, `addValidator`,
  `idCursor`, `revision`, `replaceDocument`.
- `AppliedPatch`/`ChangeEvent` carry `origin: "local" | "undo" | "redo" | "external"`. The
  `external` origin exists and is documented as not entering local history (TXN-09), but
  nothing produces it.
- `diffSnapshot(from, to)` (`core/io/snapshot/diff.ts`) already turns a validated snapshot
  into a patch with the operation order this change needs. `validateSnapshot` is the shared
  validator. `loadSnapshot` is a reset (`replaceDocument`): it clears history and emits
  `reset`.
- The view cancels gestures only on a `reset` event (`CancelReason` has `"reset"`); a
  `change` event with origin `external` does not reach tools. Model bindings mark dirty on
  `change` and `reset`.
- `EditableModel` (`view/interact/commands/editable-model.ts`) is
  `ViewModel & Pick<GraphModel, "plan" | "execute" | "can" | "undo" | "redo" | "historyState">`.
  Any `GraphModel` fits, so a graph model built on the new adapter needs no view change.

## Goals / Non-Goals

**Goals:**
- A host that owns the document and re-reads it on every notification can feed the editor
  full snapshots without losing selection, viewport, history or a running gesture.
- Optimistic edits that roll back, with a clear state per edit.
- One documented interception point for turning edits into host calls, one call per gesture.

**Non-Goals:** revisioned mode, async connection validation, temporary-ID mapping, pending
painting in the view, dedup/retry protocols, collaboration logic (see proposal).

## Decisions

### D1. Where the code lives

The adapter needs `diffSnapshot` (core/io, rank 3) and the edit layer (rank 2), so it
cannot live in `core/edit`. It goes in a new folder `src/core/io/sync/` (same layer as
`io/snapshot`, may import it and everything below). `src/architecture.test.ts` gets the
folder added to the core/io row deliberately. The intent decoder needs only patches and the
reader, so it lives in `src/core/edit/intents/`. Public names are exported from
`src/core/index.ts`.

### D2. Two states: confirmed and displayed

The adapter keeps the store as the displayed read model (ADP-01: rendering never waits)
and a separate list of pending entries `{ operationId, patch, state }`, where `state` is
`pending | conflicted | unknown`. Confirmed state is derived, not stored twice: it is the
displayed state with the applying pending patches inverted, newest first. Settling:

- **accepted**: the entry is removed; its patch is now part of confirmed state, no event.
- **rejected**: the entry is removed and its inverse is applied as one `change` with origin
  `external` (a rollback is not an undo entry), plus a `failure` event with the rejection.
- **unknown**: the entry stays, state `unknown` (D5).

Open point resolved in tasks: a rollback needs the later pending entries to be rebased too;
the rollback uses the same rebase routine as a push (D3) with the unchanged confirmed state.

### D3. Push algorithm (one diff, one event)

`pushSnapshot(snapshot)`:

1. Validate (`validateSnapshot`); on error return it and change nothing (SER-04 spirit).
2. Build the target: the snapshot with the pending patches applied in order on a scratch
   copy. A pending patch that fails atomically (PAT-02) on the scratch copy is marked
   `conflicted` and skipped. A pending patch whose effect is already in the target
   (every update's new value equals the current value, every add already exists) is applied
   as a no-op, so it is never applied twice.
3. `diffSnapshot(displayed, target)` yields the single patch; apply it with origin
   `external`. An empty patch emits nothing.
4. The snapshot (without pending) becomes the new confirmed baseline.

Cost is O(entities) per push, the same order as `diffSnapshot`; the performance task
measures it for 500 and 5000 nodes. Entities keep their IDs, so selection (a set of keys)
survives and a moved node is a single update (ADP-05b).

`loadSnapshot` is unchanged and stays the reset for "open another document".

### D4. Gestures and external changes

Tools gain an optional `involved(): GestureTargets` (node, port and connection IDs the
active gesture reads or will write; empty for pan and marquee). The tool router subscribes
to `change` events whose origin is `external`; if the changed or removed IDs intersect the
active tool's involved set, it feeds `{ type: "cancel", reason: "external-change" }` and the
view publishes a `gesture-cancelled` event `{ reason, ids }`. `CancelReason` gains
`"external-change"`. Otherwise nothing happens: the drag's preview is a pending-layer
overlay computed from start positions, so unrelated updates need no special handling. This
also fulfils the "gesture target removed" scenario of TXN-09 for local edits' remote
changes in the future revisioned mode. A cancelled gesture submits nothing (ADP-07 does not
apply, as nothing was submitted).

### D5. Unknown outcome

`onSubmit` returns a promise of `accepted | rejected | unknown`. An optional `timeoutMs`
turns silence into `unknown`; the default is no timeout (the host owns its transport). An
unknown entry is never passed to `onSubmit` again (TXN-04: no deduplication declared). The
adapter publishes `resync-requested` once per unknown entry. The entry stays displayed (the
user sees their edit) and is rebased by every push; the host settles it with
`settle(operationId, outcome)` after resync. The state is queryable via `pendingEdits()`
so a host can map it to a message.

### D6. Overlapping edits

TXN-06 requires a documented policy. Decision (owner, 2026-11-03): the view applies every
edit optimistically at once and never waits for the host. The adapter hands edits to the
host one after another, in submission order: the next edit is sent after the previous one is
answered. This matches the behaviour the host relied on before (edits too slow to block the
UI). Each edit still carries the base revision the adapter had at submission time.

### D7. Revisions

Snapshot mode has no revisions from the host. The adapter keeps a local counter as the
`Revision` token it hands out (incremented on every displayed change) so `Submission.baseRevision`
and `Accepted.revision` stay well-formed. MOD-06 (gap handling) therefore does not apply to
this mode; it belongs to the revisioned-mode change.

### D8. Host-owned history

`history: "host"`: `undo()`/`redo()` call `onUndo`/`onRedo`, return `pending`, and settle
when the callback does; the resulting change arrives through a push. `historyState()` calls
the host's `historyState` provider. With `history: "local"` the adapter reuses
`createLocalHistory` for edits that were accepted by the host; external pushes never enter
it. Undo of an accepted edit submits the inverse patch like any other edit (ADP-07).

### D9. Model construction

`createGraphModel` today builds a `LocalAdapter` internally. It gains an option taking the
adapter (a narrow `AuthorityAdapter` interface extracted from `LocalAdapter`: `reader`,
`idGenerator`, `on`, `addValidator`, `idCursor`, `revision`, `submit`, `undo`, `redo`,
`historyState`, `dispose`), and a thin `createSnapshotModel(options)` returns a `GraphModel`
plus `pushSnapshot`, `pendingEdits`, `settle`. Commands, policy and validators stay in the
facade, unchanged. `replaceDocument` is not part of the narrow interface; `loadSnapshot` on a
snapshot model performs a reset through the adapter's own reset path.

### D10. Intent decoder

`decodeIntents(submission, before: GraphReader): readonly Intent[]`, a discriminated union
(`move`, `resize`, `rotate`, `mirror`, `create-node`, `delete`, `connect`, `disconnect`,
`reconnect`, `other`). It groups operations by shape: node `position` updates become one
`move` with entries; `size` one `resize`; `rotation` and `mirrored` likewise; node adds
(with their ports) one `create-node` each; removes of a node with its ports and incident
connections one `delete`; connection add/remove alone `connect`/`disconnect`; a removed and
an added connection sharing one endpoint port `reconnect`. A patch that touches a field
group in several ways may yield several intents. Every op is claimed by exactly one intent
(the `other` intent takes leftovers), checked by a property test. Decoding from the patch
rather than tagging `Submission` keeps the contract unchanged; the cost is that a few
intents (reconnect) are heuristics, noted in the guide.

### D11. Example and docs

`examples/host-authority/` is a Node script plus test: an in-memory store with two lists
and a fake async transport. `docs/guide-host-authority.md` explains it; `docs/architecture.md`
section 5 changes "(planned: Slice D)" for the snapshot mode; `docs/guide-using-the-model.md`
links to the guide.

## Risks / Trade-offs

- A push is O(entities) even when little changed. Acceptable for the stated sizes;
  measured in the performance task, with a fast path when the snapshot is equal to the last
  one pushed.
- Pending conflicts are decided by atomic apply on a scratch copy, which can report a
  conflict for an edit the host would accept. The host's answer still wins.
- Heuristic reconnect decoding can misread two unrelated changes in one patch.

## Open Decisions (need the owner)

1. **IDs for entities created locally.** The host issues its own IDs. Until the host
   confirms, the editor uses IDs from its generator; a snapshot then holds different IDs and
   the diff would remove the temporary entity and add the real one (selection and gesture
   state on it are lost). Options: (a) the host accepts client-issued IDs via a generator
   (assumed in this change); (b) add an ID alias map in the adapter, replacing a temporary
   ID in place and in selection. (b) is a larger change touching MOD-03/PRT-01.
2. **Pending marker.** TXN-02 says a pending edit is visually distinguishable. Core exposes
   the state here; deciding the look and the `viewState` field is deferred.
3. **D6 overlapping edits** are settled (optimistic UI, sequential hand-off). Open: how a
   selection or ordering conflict between a pending edit and an incoming refresh was solved
   in the host's previous editor; log such conflicts meanwhile and ask the host.
4. **Folder choice D1** (`core/io/sync`) versus a new layer between io and the facade.
