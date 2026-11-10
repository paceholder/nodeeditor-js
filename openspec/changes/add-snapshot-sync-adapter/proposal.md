# Proposal

## Why

The architecture says the library keeps its own read model while a host may be the
authority over the document. Only the local adapter exists today. A host
whose document lives in a remote store, and which re-reads the whole document after every
change notification, cannot use the editor without it: `loadSnapshot` is a reset (it
clears history, selection bookkeeping and active gestures), there is no pending layer for
optimistic edits, and nothing tells a host how to turn a submitted edit into a call to its
store. The same host also needs one clear point at which to learn what the user did
(move, create, delete, connect), kept as one call per gesture.

Such a host may also own the identity of the things it stores. It may issue node and port
IDs itself, because a node is created together with ports it alone knows. It may still let
the editor choose the IDs of connections. Creating a node must therefore be a request the
authority fulfils, not something the editor always does locally.

This change delivers the first external adapter, in snapshot synchronization mode, with
the pending layer, host-owned history and delegated node creation it needs, a recipe for
wrapping an existing store, and a decoder from a submitted patch to named intents.

## What Changes

- **Snapshot adapter.** A new external adapter (`authority: "external"`) that applies a
  user's edit to the displayed state at once, hands the submission to a host callback, and
  settles it as accepted, rejected or unknown outcome from the host's answer. The graph
  model can be created on top of it, so the view and commands work unchanged.
- **Pending layer.** Confirmed state is stored explicitly and kept apart from still-unconfirmed
  edits. The displayed read model is confirmed state plus the valid pending patches.
  One table defines how every answer settles every kind of entry, including
  duplicate and unknown answers, a document replacement and disposal.
  The state of each edit is queryable and published as events, and the view state tells
  painters whether an entity is unconfirmed, meaning an edit of it awaits the host.
- **Incremental snapshot push.** `pushSnapshot(snapshot, revision?)` validates with the
  shared validator and its size limits, makes the snapshot the new confirmed state, diffs the
  displayed state against the snapshot plus the pending edits that still apply (reusing
  `diffSnapshot`) and applies the result as one `change` event with origin `external`. It is not a reset: history,
  selection of surviving entities, viewport and gestures on surviving entities are kept.
  Pending edits are rebased on the new confirmed state; a pending edit that no longer
  applies is dropped from the display, marked conflicted and reported through a `conflict`
  event. A push whose revision is older than the last applied one is ignored.
- **Delegated node creation.** Creation stays the existing `createNode` command. The adapter
  declares whether nodes are named locally or by the host. For a host that names nodes, the
  planner makes no patch and no ID: it returns a delegated outcome carrying a create-node
  intent, `execute` hands it to the host and returns a pending result, and a never-serialized
  ghost placeholder marks the drop position until the host names the node (an answer that
  carries its ID) and a snapshot holding that node arrives, or the host refuses. Paste and duplicate validate the fragment, then hand over one create-fragment intent, or are
  reported as not supported; the host owns policy for the connections it creates from it.
  The adapter contract (`ModelAdapter`) grows to
  carry what the model needs; no third adapter interface is added.
- **Client-issued connection IDs.** The ID generator may return host-supplied IDs for
  connections. When the host accepts the edit and a later snapshot holds the same ID, the
  diff is empty for that connection, so selection and a gesture on it survive. A host that
  owns the document must supply a globally unique generator (the default counter, `c1`,
  `c2`, ..., collides across clients), so the snapshot model has no default generator.
  For a backend that cannot keep client IDs, an option matches a snapshot connection to
  this client's new local connection by kind and endpoints and keeps the local ID.
- **Gestures and external changes.** A push is an external change, so the existing rule that
  a gesture yields to any change of the entities it involves applies unchanged: a gesture
  continues when a push does not touch the entities it involves, and is otherwise
  cancelled with reason `entity-removed` or `external-change`, which the host reads from
  the `gesture-cancelled` event. A rollback after a rejection is an external change too.
  This change adds no rule of its own.
- **Revisions and refusals.** The adapter uses the library's integer revision for base
  revisions, accepted outcomes and events, and rejects a submission planned against
  another revision with `stale-revision`, like the local adapter. The host's own snapshot
  token is a separate value. Every refusal the adapter reports or receives travels in a
  `rejection` field.
- **Unknown outcome.** A submission the host reports as unknown (or that times out) is
  kept marked unknown, with a plain-text `reason`, never resubmitted, and the adapter asks
  the host to resynchronize.
- **Host-owned and local history.** With `history: "host"` undo and redo are forwarded to host
  callbacks, availability comes from a host provider, and the library records no history
  entries of its own. With local history, entries are pushed at commit and
  dropped when the host rejects the edit, and undo is refused while the newest edit is
  unanswered.
- **Wrapping recipe.** A documentation guide plus a runnable headless example that
  adapts a store of two lists (nodes and connections) to the adapter, including how the
  host maps a submission to its calls and re-pushes a snapshot.
- **Intent decoding.** A pure helper decodes a `Submission` into named intents (move,
  resize, rotate, mirror, create node, delete, connect, disconnect, reconnect, and a
  catch-all) with old and new values (a connection update of its endpoints is a reconnect),
  using absolute rotation and mirror values and claiming each operation by its primary
  field (a resize carries its position change, a mirror its rotation change, and route
  updates fold into the move), so a host
  can map a patch to calls and retries are safe. One gesture stays one submission, so a
  multi-select move is one intent carrying all its nodes.
- **Snapshot diff contract.** The existing `diffSnapshot` becomes a specified
  behavior: no change for equal snapshots, stable IDs, removal of a node removes its
  connections in the same patch.

Requirements implemented or refined: the local adapter rule, the snapshot synchronization rule, the external authority rule, the identifier generation rule and the revision continuity rule (not
applicable in snapshot mode, see design), the one revision type rule, the rule that the base revision is checked by the local adapter (applied to this adapter too), the rule that queued submissions are checked when submitted, the one field name for refusals rule, the operation ID constructor rule, the rule that records stay inside the supported world range, the rule that route constraints are bounded, the rule that the snapshot diff honours payload codecs, the capabilities and read-only mode rule, the tagged edits rule, the pending layer and edit states rule, the no blind retry rule, the responsiveness during slow host work rule and the host-owned history rule,
the rule that external changes are not local undo entries, the typed events rule, the reentrancy contract rule, the rule that patches are the core change primitive, the atomic patch application rule, the one history entry per gesture rule, the history availability through the command contract rule, the one graph snapshot shape rule, the shared snapshot validator rule, the snapshot export and load rule and the validate-before-replace rule,
the one committed edit per gesture rule and the duplicate and paste fragments rule.
New: the snapshot adapter requirements, submission intent decoding, the store-wrapping recipe, node creation through the adapter, the pending-creation placeholder, paste and duplicate creation, client-issued connection IDs, globally unique IDs for a host-owned document, matching connections when the backend assigns IDs, revisioned snapshot push and conflict reporting,
the unconfirmed flag per entity rule, the settling edits rule and the snapshot diff against the read model rule. The pending layer and edit states rule and the responsiveness during slow host work rule get modified deltas (below). Gesture cancellation uses the existing rules that gestures react to changes of the entities they involve and that gestures yield to any change of their entities.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `model-adapters`: snapshot adapter assembly, incremental and revisioned push, pending
  rebase and conflict reporting, gesture survival (by reference to the rule that gestures react to changes of the entities they involve), unknown outcome, host-owned history,
  delegated node creation, client-issued connection IDs with the match fallback and the
  required generator, base revision check, unconfirmed flag, wrapping recipe, intent
  decoding.
- `serialization`: specified diff behavior of a snapshot against the read model.

## Out of scope

- **Revisioned synchronization mode**: changes tagged with
  revisions and operation-ID correlation of authoritative changes. The snapshot revision of
  the revisioned snapshot push rule is only a staleness check on whole snapshots. The adapter contract keeps room for
  the full mode; it is a later change.
- **Asynchronous connection validation** (the `pending` policy outcome) and its
  use by the connect tool and docking. Policy stays synchronous here.
- **Temporary-to-authoritative ID mapping for nodes and ports.** Not needed: a node is
  never shown before the authority has named it and its ports. Connection IDs are issued
  by the client; only the opt-in match fallback keeps a connection-only alias table, and
  no ID is ever renamed.
- **Painting the pending state** in the view. Core exposes the unconfirmed flag of every
  entity; the host or a later view change decides how it looks. The library ships
  no spinner.
- Any retry or deduplication protocol for unknown outcomes (the no blind retry rule allows retry only when
  an adapter declares deduplication; this adapter declares none).
- Collaboration, merging or CRDT logic, React bindings, hover events, docking
  and the reconnect tool.
- A new gesture rule, cancel reason or tool hook: the existing involved-entity rules cover
  pushes and rollbacks.
- A command-level `intent` tag on `Submission`; intents are decoded from the patch.

## Dependencies

- The gesture rule, the `gesture-cancelled` view event, the per-tool `involved` hook and the
  asynchronous validator are in the specs and the code (the asynchronous connection policy
  is archived, and the view hardening widened cancellation to changes of any origin).
  Tasks 4.1 and 4.2 verify them against pushes.
- Planned order, not a code dependency: `add-reconnect-tool`, `add-docking`, then this
  change.
- Uses the view lock only through the cancellation reason already defined there.
