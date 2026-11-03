# Proposal

## Why

The architecture says the library keeps its own read model while a host may be the
authority over the document (MOD-02, ADP-05). Only the local adapter exists today. A host
whose document lives in a remote store, and which re-reads the whole document after every
change notification, cannot use the editor without it: `loadSnapshot` is a reset (it
clears history, selection bookkeeping and active gestures), there is no pending layer for
optimistic edits, and nothing tells a host how to turn a submitted edit into a call to its
store. The same host also needs one clear point at which to learn what the user did
(move, create, delete, connect), kept as one call per gesture.

This change delivers the first external adapter, in snapshot synchronization mode, with
the pending layer and host-owned history it needs, a recipe for wrapping an existing
store, and a decoder from a submitted patch to named intents.

## What Changes

- **Snapshot adapter.** A new external adapter (`authority: "external"`) that applies a
  user's edit to the displayed state at once, hands the submission to a host callback, and
  settles it as accepted, rejected or unknown outcome from the host's answer. The graph
  model can be created on top of it, so the view and commands work unchanged.
- **Pending layer.** Confirmed state and still-unconfirmed edits are kept apart. The
  displayed read model is confirmed state plus the valid pending patches (TXN-02, ADP-03).
  The pending state of each edit is queryable and published as events.
- **Incremental snapshot push.** `pushSnapshot(snapshot)` validates with the shared
  validator, diffs against confirmed state (reusing `diffSnapshot`) and applies the result
  as one `change` event with origin `external`. It is not a reset: history, selection of
  surviving entities, viewport and gestures on surviving entities are kept. Pending edits
  are rebased on the new confirmed state; a pending edit that no longer applies is marked
  conflicted.
- **Gestures and external changes.** A gesture continues when a push does not touch the
  entities it involves; otherwise it is cancelled with a reason the host can show
  (TXN-09). Tools declare the entities a gesture involves.
- **Unknown outcome.** A submission the host reports as unknown (or that times out) is
  kept marked unknown, never resubmitted, and the adapter asks the host to resynchronize
  (TXN-04).
- **Host-owned history.** With `history: "host"` undo and redo are forwarded to host
  callbacks and availability comes from a host provider (TXN-08, PAT-08).
- **Wrapping recipe.** A documentation guide plus a runnable headless example that
  adapts a store of two lists (nodes and connections) to the adapter, including how the
  host maps a submission to its calls and re-pushes a snapshot.
- **Intent decoding (G9).** A pure helper decodes a `Submission` into named intents
  (move, resize, rotate, mirror, create node, delete, connect, disconnect, reconnect, and
  a catch-all) so a host can map a patch to calls. One gesture stays one submission, so a
  multi-select move is one intent carrying all its nodes (INT-08).
- **Snapshot diff contract (SNP-04).** The existing `diffSnapshot` becomes a specified
  behavior: no change for equal snapshots, stable IDs, removal of a node removes its
  connections in the same patch.

Requirement IDs implemented or refined: ADP-02, ADP-05, MOD-02, MOD-06 (not applicable
in snapshot mode, see design), TXN-01, TXN-02, TXN-04, TXN-06, TXN-08, TXN-09, TXN-10,
TXN-10a, PAT-01, PAT-02, PAT-07, PAT-08, SNP-01, SNP-02, SNP-03, SER-04, INT-08, UC-13.
New: ADP-05a to ADP-05f, ADP-08, ADP-09, SNP-04.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `model-adapters`: snapshot adapter assembly, incremental push, pending rebase, gesture
  survival, unknown outcome, host-owned history, wrapping recipe, intent decoding.
- `serialization`: specified diff behavior of a snapshot against the read model.

## Out of scope

- **Revisioned synchronization mode** (ADP-06, MOD-06, TXN-03): changes tagged with
  revisions and operation-ID correlation of authoritative changes. The adapter contract
  keeps room for it; it is a later change.
- **Asynchronous connection validation** (TXN-05, the `pending` policy outcome) and its
  use by the connect tool and docking. Policy stays synchronous here.
- **Temporary-to-authoritative ID mapping.** Edits that create entities use IDs from the
  model's ID generator, and the host must accept them or supply a generator that produces
  acceptable IDs (see design, open decision).
- **Painting the pending state** in the view (a visual marker for TXN-02). Core exposes
  the pending state of every edit and entity; view painting is a follow-up.
- Queuing policy details for two overlapping edits of one entity beyond the rule in
  design D6, and any retry or deduplication protocol for unknown outcomes (TXN-04 allows
  retry only when an adapter declares deduplication; this adapter declares none).
- Collaboration, merging or CRDT logic (ADP-04), React bindings, hover events, docking
  and the reconnect tool.
- A command-level `intent` tag on `Submission`; intents are decoded from the patch.
