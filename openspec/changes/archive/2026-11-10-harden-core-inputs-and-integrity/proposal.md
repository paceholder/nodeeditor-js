# Proposal

## Why

A pre-release audit of the headless core found defects that a crafted file, pasted text, a
raw patch or an ordinary host integration can reach. Some break model integrity (a port left
without its node, a capability lock bypassed, an undo stack that can never move again), some
let hostile input degrade the editor (one node with extreme coordinates blanks every query, a
route with a million pins, a million error objects), and some make ordinary host code
misbehave (two commands issued from one event handler collide on the same ID, host validators
that planning never sees). They should be fixed before the first published release, while
breaking changes are still free.

## What Changes

Model integrity and editing rules (core/data, core/edit, the model facade):

- A node update that drops a port from the node's list must also remove that port; the patch
  check and the store's own consistency check both catch the orphan.
- Capabilities are judged against each node as it was before the patch, so a patch can
  neither unlock itself (by changing type or clearing an override in another operation) nor
  be judged by locks it adds. Validators receive the pre-patch graph next to the staged one.
- Update fields, patch ID cursors and snapshot ID cursors accept only their own known keys;
  `__proto__` is refused wherever a caller-supplied key would be written into an object.
- An explicit insertion sequence on an add is bounded and may not repeat one in use.
- Record validation returns a copy holding only the known fields, so the store never keeps
  the caller's objects or unknown keys.
- Node positions, node sizes and route-constraint coordinates must lie inside the supported
  world range; a connection holds at most a fixed number of route constraints.
- The default ID generator never wraps or silently resets a counter; a host generator may own
  cursor merging, and text cursor values advance.
- Planning (`plan`, `can`) sees validators added with `addValidator`.
- Commands planned from inside an event handler reserve their IDs, so queued plans do not
  collide.
- A queued edit's events are delivered before the next queued edit runs, and the host-verdict
  cache is cleared in a hook that runs right after each commit.
- A rejected undo or redo no longer leaves the history stuck: the failed entry and the
  entries under it are dropped and the reason is reported. Queued undo and redo report the
  operation ID they commit with. The local history accepts a size limit.
- `replaceDocument` checks its input before it changes anything and refuses to run from
  inside an event handler.
- Moving nodes looks only at the connections of the moved nodes.

Space and I/O (core/space, core/io):

- The geometry scene skips nodes and connections whose bounds are not finite, and the spatial
  index refuses non-finite boxes; a leaf's enlarged box shrinks again when its node shrinks.
- Pinned orthogonal routing is linear in the number of pins.
- `diffSnapshot` takes payload codecs and reports codec failures as a result; `jsonEqual`
  calls two different non-plain objects unequal.
- Snapshot, document and fragment validation stop collecting errors after a fixed count and
  report how many were left out.
- A host geometry can declare which content fields (title, status, payload, capabilities) its
  answers depend on, and the scene rebuilds the node when one of them changes.
- Fragment `external` entries must have exactly one end inside the fragment.
- Document extras are as strict as the rest of the format (no duplicate selection entries, no
  unknown viewport keys, viewport inside the supported ranges).
- Loading never throws for host migrations or codecs that throw, or for input objects whose
  properties throw when read.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `graph-model`: port ownership on node updates, record copies, world range for records,
  explicit sequence bounds, own-key checks, ID counter bounds and cursor merging,
  pre-patch capability judgement.
- `patches-and-history`: event order for queued edits, recovery from a rejected undo or redo,
  queued undo and redo operation IDs, history size limit, planning sees host validators,
  planning from inside handlers.
- `model-adapters`: whole-document replacement is checked first and refused during dispatch;
  host-verdict cache cleared right after commit.
- `editing-operations`: moving nodes is proportional to the moved nodes' connections; paste
  checks fragment external entries.
- `serialization`: codec-aware snapshot diff, strict JSON equality, bounded error lists,
  strict document extras, cursor key checks, never-throwing load paths.
- `geometry`: finite scene entries, spatial index refuses non-finite boxes and shrinks
  enlarged boxes, geometry content dependencies.
- `routing`: route-constraint limit and linear pinned routing.

## Impact

- Code: `src/core/data/patch/*`, `src/core/data/model/*`, `src/core/base/ids/*`,
  `src/core/edit/{adapter,capabilities,commands,events,history}/*`, `src/core/graph-model.ts`,
  `src/core/space/{scene,spatial-index,routing,geometry}/*`, `src/core/io/{snapshot,fragment}/*`.
- Public API: `ValidationContext` gains `before`; `CommandEnvironment.validators` becomes a
  function; `GraphReader` gains `idWithSeq`; `IdGenerator` gains an optional `merge`;
  `LocalAdapterOptions` (and so `GraphModelOptions`) gains `historyLimit`; `NodeGeometry`
  gains optional `dependsOn`; `AabbTree` gains `boxOf`; `SnapshotLimits` gains
  `maxRouteConstraints` and `maxErrors`; `diffSnapshot` takes options and returns a
  `Result`. The local adapter (internal) gains `onCommit`, `planningCursor` and
  `validators`. The package has no consumers yet, so these are made directly.
- Docs: `docs/guide-core-model.md`, `docs/guide-using-the-model.md`, `docs/geometry.md`,
  `docs/format.md` where they describe the changed behaviour.

## Out of Scope

- The public API rough edges of the audit (exported operation-ID and revision constructors,
  one revision type, one rejection field name); a later change handles them.
- Everything under `src/view` and `src/react`, owned by other changes.
- Caching polyline parts for picking (see `notes.md`).
