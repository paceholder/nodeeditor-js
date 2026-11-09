# Design

## Context

Observed in the code (not assumptions):

- `ModelAdapter` (`core/edit/adapter/types.ts`) already has `authority: "local" | "external"`,
  `history: "local" | "host"`, `submit` returning `Accepted | Rejected | Deferred`, and the
  `unknown` outcome. Only `createLocalAdapter` implements it. `GraphModelCore` is built on
  `LocalAdapter`, which also exposes `reader`, `idGenerator`, `on`, `addValidator`,
  `idCursor`, `revision`, `replaceDocument`.
- `AppliedPatch`/`ChangeEvent` carry `origin: "local" | "undo" | "redo" | "external"`. The
  `external` origin exists and is documented as not entering local history, but
  nothing produces it.
- `diffSnapshot(from, to)` (`core/io/snapshot/diff.ts`) already turns a validated snapshot
  into a patch with the operation order this change needs. `validateSnapshot` is the shared
  validator. `loadSnapshot` is a reset (`replaceDocument`): it clears history and emits
  `reset`.
- The view cancels a gesture on a `reset` event and, tool by tool, when an entity the
  gesture uses is removed (the `entities-removed` input). A `change` event with origin
  `external` that updates such an entity does not reach tools. `add-async-connection-policy`
  replaces this with one router rule that this change relies on. Model bindings mark
  dirty on `change` and `reset`.
- `Revision` is an opaque token "ordered by the adapter that issued it"; core can compare two
  revisions only through the adapter that issued them.
- `createNode` is already a command (`type`, `position`, optional `payload` and `title`); its
  planner takes IDs from the ID generator. `PlanContext.fragments` supplies the paste and
  duplicate planners, injected by the facade.
- `EditableModel` (`view/interact/commands/editable-model.ts`) is
  `ViewModel & Pick<GraphModel, "plan" | "execute" | "can" | "undo" | "redo" | "historyState">`.
  Any `GraphModel` fits, so a graph model built on the new adapter needs no view change.

## Goals / Non-Goals

**Goals:**
- A host that owns the document and re-reads it on every notification can feed the editor
  full snapshots without losing selection, viewport, history or a running gesture.
- Optimistic edits that roll back, with a clear state per edit.
- One documented interception point for turning edits into host calls, one call per gesture.
- Node creation that works the same for a local document and for a host that names the
  node and its ports.

**Non-Goals:** revisioned mode, async connection validation, temporary-ID mapping, pending
painting in the view, dedup/retry protocols, collaboration logic (see proposal).

## Decisions

### D1. Where the code lives

The adapter needs `diffSnapshot` (core/io, rank 3) and the edit layer (rank 2), so it
cannot live in `core/edit`. It goes in a new folder `src/core/io/sync/` (same layer as
`io/snapshot`, may import it and everything below). `src/architecture.test.ts` gets the
folder added to the core/io row deliberately (settled: a new layer between io and the
facade is not needed). The intent decoder needs only patches and the
reader, so it lives in `src/core/edit/intents/`. Public names are exported from
`src/core/index.ts`.

### D2. Two states: confirmed and displayed

The adapter keeps two things. **Confirmed state** is stored explicitly: a snapshot-shaped
copy of what the host last told it (the last pushed snapshot, advanced by the patches of
edits the host accepted since). **Displayed state** is the read model (the library read model rule: rendering never
waits). The displayed state is always confirmed state plus the pending patches that still
apply, in submission order. The pending list holds entries `{ operationId, patch, state }`,
where `state` is `pending | conflicted | unknown`. Nothing is derived by inverting patches:
inverting is wrong when a push already contains an edit (a pending move of A from p1 to p2,
kept as a no-op because the push holds A at p2, would invert to p1).

Settling (the full table is the settling edits rule):

- **accepted**: the entry is removed. If its patch applied to confirmed state it is applied
  there too, so confirmed state advances; the displayed state does not change and no event is
  emitted.
- **rejected**: the entry is removed and the displayed state is recomputed from confirmed
  state plus the remaining pending patches. The difference is applied as one `change` with
  origin `external` (a rollback is not an undo entry), plus a `failure` event with the
  rejection. If a push had already put the edit's effect into confirmed state, the effect
  stays: the authority's snapshot wins over its own rejection.
- **unknown**: the entry stays, state `unknown` (D5).

The cost is one extra copy of the document in memory; the performance task measures it.

### D3. Push algorithm (one diff, one event)

`pushSnapshot(snapshot)`:

1. Validate (`validateSnapshot`, with the size limits of `ValidateOptions` defaulting to
   `DEFAULT_SNAPSHOT_LIMITS`; a host that pushes larger documents raises them in the adapter
   options, and the cost of a push is bounded by those limits); on error return it and
   change nothing (spirit from the validate-before-replace rule).
   If a revision is given and is older than the last applied one, return `ignored: "stale"`
   and change nothing (D12).
2. The snapshot becomes the new confirmed state. Build the target: the snapshot with the
   pending patches applied in order on a scratch copy. A pending patch that fails atomically on the scratch copy is marked
   `conflicted` and skipped. A pending patch whose effect is already in the target
   (every update's new value equals the current value, every add already exists) is applied
   as a no-op, so it is never applied twice. An edit marked `conflicted` is also
   reported once through the `conflict` event (D14).
3. `diffSnapshot(displayed, target)` yields the single patch; apply it with origin
   `external`. An empty patch emits nothing. The diff compares the displayed read model with
   the target, in the spec as here, so a pending edit the snapshot already contains yields
   no operation.

Cost is O(entities) per push, the same order as `diffSnapshot`; the performance task
measures it for 500 and 5000 nodes. A push that arrives while the adapter is dispatching
events (from inside `onSubmit` or a change handler) is queued and applied after the current
dispatch, in order, like a submission made from a handler; the call returns a
deferred result. Entities keep their IDs, so selection (a set of keys)
survives and a moved node is a single update.

`loadSnapshot` is unchanged and stays the reset for "open another document".

### D4. Gestures and external changes
A push is a change with origin `external`, so the rule for changes to involved entities (`add-async-connection-policy`)
already covers it: a gesture whose involved entities are untouched continues, one whose
entity was removed or changed by the push is cancelled, and the view emits
`gesture-cancelled`. This change adds no tool hook and no event of its own. The drag's
preview is a pending-layer overlay computed from start positions, so unrelated updates need
no special handling. A cancelled gesture submits nothing (the rule that submitted edits cannot be cancelled by the view does not apply, as nothing
was submitted). The rule is the reason this change depends on `add-async-connection-policy`.

### D5. Unknown outcome

`onSubmit` returns a promise of `accepted | rejected | unknown`. An optional `timeoutMs`
turns silence into `unknown`; the default is no timeout (the host owns its transport). An
unknown entry is never passed to `onSubmit` again (the no blind retry rule: no deduplication declared). The
adapter publishes `resync-requested` once per unknown entry. The entry stays displayed (the
user sees their edit) and is rebased by every push; the host settles it with
`settle(operationId, outcome)` after resync. The state is queryable via `pendingEdits()`
so a host can map it to a message. A creation whose node never shows up (D13) follows the
same path when `timeoutMs` elapses.

### D6. Overlapping edits

The responsiveness during slow host work rule requires a documented policy. Decision (owner, confirmed by the host): the view
applies every edit optimistically at once and never waits for the host. The adapter calls
the host callback once per submission, in commit order, and does not wait for the answer to
the previous one before calling again. The host decides when to start each store call (it
may chain them), because the order in which calls reach a store is its own concern. Each
edit carries the base revision the adapter had at submission time. If the host rejects an
earlier edit, later pending edits are rebased and any that no longer apply are marked
conflicted (D3). Rotate and mirror are handed over as absolute values (D10), so a retried
or replayed edit is harmless.

### D7. Revisions
Two kinds of token exist and are never mixed. The adapter's own `Revision` (carried by
`Submission.baseRevision` and `Accepted.revision`) is a local counter incremented on every
displayed change, so those fields stay well-formed; it is ordered by this adapter, as the
`Revision` contract says. The host's snapshot revision (D12) is a token the host attaches to
a push; the adapter only compares two of them, with a comparison the host can replace.
The revision continuity rule (gap handling) does not apply to this mode; it belongs to the revisioned-mode change.
The asynchronous validator cache of `add-async-connection-policy` needs no ordering at all
(it invalidates by change events), so nothing else in core compares revisions.

### D8. Host-owned history

`history: "host"`: `undo()`/`redo()` call `onUndo`/`onRedo`, return `pending`, and settle
when the callback does; the resulting change arrives through a push. `historyState()` calls
the host's `historyState` provider. With `history: "local"` the adapter reuses
`createLocalHistory`; external pushes never enter it. An entry is pushed when the edit is
committed, in commit order, and dropped when the host rejects the edit or the edit is
marked conflicted, so the stack never holds an edit the host refused. Answers can arrive
out of commit order; the stack order is the commit order, not the answer order. Undo while
the newest edit is still pending or unknown is refused with the reason `edit-pending`
(undoing an older entry underneath a pending newer one would reorder the user's work); once
the answer arrives undo is available again. Undo of a confirmed edit submits the inverse
patch like any other edit.

### D9. Model construction
`createGraphModel` today builds a `LocalAdapter` internally, and `GraphModelCore` uses
members that only `LocalAdapter` declares. Instead of adding a third interface beside
`ModelAdapter` and `LocalAdapter`, those members move up into `ModelAdapter`: `reader`,
`idGenerator`, `on`, `addValidator`, `idCursor`, `revision`, `mintOperationId`,
`reportRejection` and `replaceDocument` (the reset path used by `loadSnapshot`), plus the
new `nodeCreation: "local" | "delegated"` (D13) and a `delegate(intent)` method used only
when it is `"delegated"`. `LocalAdapter` becomes `ModelAdapter` with `nodeCreation: "local"`
(the name stays as the concrete return type of `createLocalAdapter`). `createGraphModel`
takes any `ModelAdapter`. The adapter itself is plain core/io code (D1), but the thin
`createSnapshotModel(options)` returns a `GraphModel` plus `pushSnapshot`, `pendingEdits`
and `settle`, and a `GraphModel` belongs to the facade, so it lives next to
`createGraphModel` (rank 4, `src/core/snapshot-model.ts`) and imports the adapter from
`core/io/sync`. Commands, policy and validators stay in the facade, unchanged.

### D10. Intent decoder
`decodeIntents(submission, before: GraphReader): readonly Intent[]`, a discriminated union
(`move`, `resize`, `rotate`, `mirror`, `create-node`, `create-fragment`, `delete`, `connect`,
`disconnect`, `reconnect`, `other`). Every intent carries old and new values; `rotate` carries
absolute quarter turns and `mirror` the absolute flag, never a step or a toggle. A host whose
store only offers relative calls turns the difference into steps itself. The decoder claims
operations one at a time, by the primary field each changes, and one intent may carry
secondary fields of the same operation:

- a node `update` with `size` is a `resize`, carrying the `position` change the same
  operation holds (a resize anchored at the centre moves the node: `resizeNode` writes both
  fields in one operation);
- a node `update` with `mirrored` is a `mirror`, carrying the `rotation` change the same
  operation holds (a mirror can change rotation: `mirrorNodes` writes both);
- a node `update` with `rotation` alone is a `rotate`; with `position` alone a `move`;
- updates of the `route` of connections are folded into the `move` intent of the same
  patch as route changes (moving nodes translates the pinned routes of their connections
  in the same patch; a host that stores no routes ignores them), and stand alone as `other`
  when no move is in the patch;
- node adds (with their ports) are one `create-node` each; removes of a node with its
  ports and incident connections one `delete`; connection add or remove alone `connect` or
  `disconnect`; and a connection `update` that changes `from` or `to` is a `reconnect`
  (exactly what the reconnect command emits: one update that keeps the connection ID, so the
  intent names the same connection with its old and new endpoints).

A removed connection plus an added one is a `delete` and a `connect`, never a `reconnect`:
nothing ties them together. An operation that changes several fields of different groups is
claimed once, by its primary field in the order above, and carries the others. Every
operation is claimed by exactly one intent, which a property test checks (the `other` intent
takes leftovers). A host whose store has a relative rotate or a toggling mirror turns the
difference between the absolute values into steps itself; a mirror intent also carries the
rotation that changed with it, so the host can avoid a surprising double call. `create-node` and `create-fragment` are also
the intents a delegating adapter hands over instead of a patch (D13); the planner builds
them, the decoder does not see them. Decoding from the patch rather than tagging
`Submission` keeps the contract unchanged, and, with the update rule, no intent is a
heuristic.

### D11. Example and docs

`examples/host-authority/` is a Node script plus test: an in-memory store with two lists
and a fake async transport. `docs/guide-host-authority.md` explains it; `docs/architecture.md`
section 5 changes "(planned: Slice D)" for the snapshot mode; `docs/guide-using-the-model.md`
links to the guide.

### D12. Revisioned snapshots

`pushSnapshot(snapshot, revision?)` takes an optional revision from the host (a host token,
not the adapter's `Revision`, D7). The adapter
remembers the last applied one and ignores a push that is older (equal is applied: the host
may re-send). The comparison is replaceable through an option, defaulting to numeric order,
so a host with another token can supply its own. Without a revision every push is applied.
This is only a staleness check on whole snapshots; operation-ID correlation of single
changes is the revisioned mode, out of scope. After an ignored push nothing is emitted.

### D13. Node creation goes through the existing command
No new model method is added. Creation stays the `createNode` command, planned by
`planCreateNode`; every creation path (palette drop, API call) already executes it. What
differs is the adapter, through `ModelAdapter.nodeCreation`:

- **`"local"`** (the local adapter and any adapter that lets the editor name nodes). The
  planner works as today: node and port IDs from the ID generator, ports from the node type,
  one patch, one history entry; `execute` reports the new node's ID.
- **`"delegated"`** (a host that names nodes and their ports). The planner does not touch
  the ID generator and returns a new plan outcome, `delegated`, carrying a `create-node`
  intent `{ type, position, payload?, title?, operationId }`. It is a sibling of the existing
  `pending` plan outcome and, like it, is not a patch. `execute` hands the intent to
  `adapter.delegate(intent)`, which calls the host and returns a deferred outcome. The host
  answers through the promise `onDelegate` returns, or later through
  `settle(operationId, { status: "accepted", nodeId })`, naming the ID it gave the node. The
  deferred outcome settles with that ID when a pushed snapshot contains a node with it
  (immediately if the snapshot already holds it when the answer arrives). Matching is by that
  ID, not by type or position, which would be ambiguous; a snapshot has no field for an
  operation ID and gets none. If the host refuses, the outcome is rejected. If the node
  never appears (the optional `timeoutMs`, D5) the outcome becomes unknown, the placeholder
  is marked unknown and resynchronization is requested. If the named ID is already claimed
  by another operation, or already existed before the answer, the second answer is a
  rejected settle with the reason `node-id-claimed`, logged, and the placeholder is dropped. A node is never shown before the authority has named it and its ports,
  because a node without ports cannot be connected.
- **Ghost placeholder.** While a creation is pending the pending layer holds a ghost record
  (type, position, operation ID). It is never serialized, never in history and never in the
  read model; the view may paint it. It is dropped when the node arrives or the host
  refuses, and kept marked unknown if the outcome is unknown.
- **Paste and duplicate.** The fragment planners injected into `PlanContext.fragments` are
  also mode-aware. Under `"delegated"` they return one `delegated` outcome carrying a
  `create-fragment` intent: the fragment's nodes with their types, positions, titles and
  payloads, the placement offset, and the fragment's internal connections expressed with keys
  local to the fragment (not library IDs). The planner validates the fragment first, exactly as the
  local paste planner does for untrusted input (shape, size limits, port and connection
  references), and returns a rejection before building any intent; the host receives only a
  fragment that passed, and the size limits are the existing fragment limits. The library
  creates none of them, since the ports they join do not exist yet; the host creates the nodes, then the connections between the
  ports it has named, or answers "not supported". The connection policy cannot judge those
  connections, because their ports do not exist in the library yet; under a delegating
  adapter the host owns policy for connections it creates from a fragment, and the guide says
  so. Connections to nodes outside the fragment
  (`exclude` / `preserve` handling) are in the intent only when the host asked for
  `preserve`, with the existing IDs of the outside ports.
- **Unavailable.** The capability policy can still report creation unavailable with
  a reason, for hosts that want no creation at all; `can` and `execute` report it before any
  delegation.

### D14. Conflict event and unconfirmed flag
A pending edit that cannot be applied after a push, or whose target is gone, is dropped
from the display, kept in `pendingEdits()` as `conflicted`, logged, and published once as a
`conflict` event with the operation ID, the reason and the entity IDs, so the host can
show a message. The view state exposes, per entity, `unconfirmed: boolean`, true while any
pending edit or ghost touches it. It is named `unconfirmed` rather than "pending" because
"pending" already names a policy outcome, a tool state and a deferred result; here it means
the host has not confirmed the entity's latest edit. The library ships no visual treatment.

### D15. Connection IDs from the host

The ID generator already allows a host-supplied implementation (a connect command
asks it for the connection ID). For connections
the host supplies IDs it will keep; the snapshot then holds the same ID and the diff is
empty. A delegating adapter never asks the generator for node or port IDs. No
alias map exists, so a temporary ID is never renamed.

### D16. Settling: one table
Answers reach the adapter in two ways: the promise that `onSubmit` returns, and
`settle(operationId, outcome)` for later answers (after a resync, or for a creation). The
first answer for an entry wins. This is the whole behavior; the spec states it as the settling edits rule.

| Entry state | accepted | rejected | unknown |
| --- | --- | --- | --- |
| pending | retired; patch applied to confirmed state | retired; display recomputed (D2); failure event | state becomes unknown; resync requested |
| conflicted | retired; display and confirmed state unchanged (its effect is expected in the next push) | retired; display unchanged; failure event | stays conflicted; logged |
| unknown | as for pending | as for pending | stays unknown; logged |
| no such entry (unknown or already settled ID) | logged no-op, `settle` returns false | logged no-op | logged no-op |

Further cases: a second answer for an entry that already has one (promise and `settle()`) is a
logged no-op. `loadSnapshot` and `replaceDocument` replace the document, so every pending
entry and placeholder settles as rejected with the reason `document-replaced`, without a
rollback (the new document is the truth) and without failure events. `dispose` settles every
`settled` promise as rejected with `disposed` and publishes nothing. Operations and `settle`
calls made from inside an event handler are queued like submissions.

## Risks / Trade-offs

- The sizes and times in the performance task (500 and 5000 nodes) are planning figures. They
  remain planning figures until the snapshot adapter exists and the benchmark has run against
  it; do not quote them as measured results before then.
- The ID in the host's answer to a creation must be the ID the node carries in later
  snapshots. An ID that identifies only the host's own operation record never matches a node,
  so the creation ends as unknown after the timeout; the guide says so.

- Confirmed state is a second copy of the document in memory, in exchange for rebasing that
  cannot go wrong; the performance task records the cost at 5000 nodes.

- A push is O(entities) even when little changed. Acceptable for the stated sizes;
  measured in the performance task, with a fast path when the snapshot is equal to the last
  one pushed.
- Pending conflicts are decided by atomic apply on a scratch copy, which can report a
  conflict for an edit the host would accept. The host's answer still wins.
- Delegated paste hands the host a validated fragment but cannot apply the connection
  policy to its internal connections; the host's own rules decide (documented).
- A host that expects a reconnect to arrive as remove plus add must handle the single
  `reconnect` intent instead; the guide says so.

## Settled decisions

1. **IDs.** Nodes and ports are named by the authority; connections by the client (D13,
   D15). No alias map.
2. **Unconfirmed marker.** Core exposes a per-entity `unconfirmed` flag (D14); looks are
   the host's.
3. **Overlapping edits** (D6) and **conflicts**: edits are applied at once and handed over
   in order; a conflict between a pending edit and an incoming refresh is logged and
   published as a `conflict` event.
4. **Folder** (D1): `src/core/io/sync/`.
