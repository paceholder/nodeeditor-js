# Design

## Context

The core applies every edit as a patch: each operation is staged on a copy-on-write overlay
of the committed graph, the staged result is checked for reference integrity, the registered
validators (capabilities, connection policy, host validators) judge it, and only then is it
committed in one store batch. Commands are planners that produce patches; `plan` and `can`
dry-run the same checks without writing. A local adapter owns the store, the undo history
and an event hub that queues work submitted from inside event handlers. Snapshots,
documents and clipboard fragments are parsed by one validator that treats input as
untrusted.

The audit found gaps at each of these steps. Most fixes are local; the decisions below are
the ones where more than one fix was possible.

## Goals / Non-Goals

**Goals:** every finding of the two core sections of the audit fixed or answered with
evidence; each fix proven by a test that names the rule; no new requirement codes.

**Non-Goals:** the public API rough edges (later change), view and React code, new features.

## Decisions

### D1 Capabilities are judged against the record before the patch

The capability validator resolves every action against the node as it was in the committed
graph before the patch. `ValidationContext` gains a `before` reader (the committed graph the
patch was staged on), filled by `applyPatch` and by the command dry run. A node that the
patch itself adds has no earlier record and is judged by its staged record, as before. The
host capability policy also receives the pre-patch graph, so its decision and the record it
is asked about agree.

Rejected: rewinding only the `capabilities` field of the same operation (the current code),
which a type change or a second operation bypasses; judging both before and after the patch,
which would let a lock that a patch adds refuse that same patch and would judge a type change
by the target type's locks.

### D2 Undo and redo stay subject to capability checks; a rejected step drops its stack

Undo and redo are edits like any other, so read-only mode, record locks, type defaults and the
host policy apply to them. Skipping the checks would make the history a way around a lock.
The consequence is that an undo can be refused for good (the inverse of a patch that locked a
node is judged by that lock; an entry whose old values no longer match is a conflict). So when
an undo or redo is rejected, the local history drops the failed entry and every entry under it
on the same stack, because each lower entry was recorded against the state the failed one
would have restored. The other stack is kept; its entries carry their own old values and are
checked when they run. The adapter publishes the `failure` event as before and a `history`
event whose `undoReason` (or `redoReason`) names the rejection, so a host can tell the user why
undo is gone.

Rejected: keeping the entry (the stack stays blocked with `canUndo` true, the defect); dropping
only the top entry (lower entries would then apply to a state they were not recorded against
and could partly succeed); clearing both stacks (loses redo entries that may still apply).
Owner to review: a host policy that refuses temporarily (for example while a simulation runs)
now costs the user the undo stack below the refused entry.

### D3 History limit option, unlimited by default

`LocalAdapterOptions.historyLimit` (and so `GraphModelOptions.historyLimit`) caps the number
of undo entries; recording past the cap drops the oldest. The default is no limit, which keeps
today's behaviour. Owner to review: a finite default (for example 1000) trades a bounded
memory use for losing old steps silently.

### D4 World range in record validation

`MAX_WORLD_COORD` (1e7) moves to the data layer (`src/core/data/model/values.ts`) so record
validation can use it; `src/core/space/geometry/limits.ts` re-exports it. Node position
coordinates must lie within plus or minus 1e7, node width and height at most 2e7 (a node may
span the whole range), and the `at` coordinate of every route constraint within plus or minus
1e7. A violation is the existing `out-of-range` rejection code, which is added to the snapshot
error codes. Because snapshot load, paste, duplicate and patches all validate through these
functions, one check covers them all. `z` stays any finite number; it is a paint order, not a
coordinate.

As a second line of defence the geometry scene leaves out a node or connection whose computed
bounds are not finite (a host geometry may still produce NaN), and the AABB tree and the
brute-force index throw `MisuseError` for a non-finite box: an index caller that passes NaN
is misusing it, and silently storing the box would poison every ancestor.

### D5 Route-constraint limit of 256

A connection holds at most 256 route constraints (`MAX_ROUTE_CONSTRAINTS`), checked by record
validation; `SnapshotLimits.maxRouteConstraints` (default 256) lets a host lower it for
untrusted input, and the snapshot parser checks the length before reading the entries. A
hand-drawn orthogonal route has a handful of pins; 256 leaves wide room while keeping a pinned
route's cost small. Pinned routing precomputes, in one backward pass, the next pin coordinate
per orientation, so building the route is linear in the pins.

Rejected: a limit only in snapshot parsing (raw patches could still carry a million pins).

### D6 ID counters never wrap and never reset silently

The default counter generator: `observe` ignores an ID whose counter is above 2^50 (such an ID
can never be reached by counting, so tracking it would only exhaust the counter); `next`
throws `MisuseError` when the current counter is not a non-negative safe integer or the next
one would pass `Number.MAX_SAFE_INTEGER`, instead of treating it as 0 and reusing IDs.
Snapshot and patch ID cursors reject numeric values that are not safe integers. Snapshot load
therefore refuses a cursor of 1e300 instead of resetting it.

### D7 Generators may own cursor merging; text values advance

`IdGenerator` gains an optional `merge(current, incoming)`. Without it, the model merges per
key: two numbers keep the larger, and any other incoming value (text, or a type change)
replaces the current one, because the generator produced the patch's cursor from the cursor
the planner read. A host generator whose text values must be compared (to guard against a
stale patch) implements `merge`.

### D8 Queued plans reserve their IDs

The local adapter keeps a planning cursor next to the committed one: when a submission is
queued (from inside an event handler), its patch cursor is merged into the planning cursor
right away. Commands plan from the planning cursor, so a second command issued from the same
handler continues after the first. A queued patch that is later rejected leaves a gap, which
is allowed: IDs only have to be unique and never reused. The committed `idCursor()` that
snapshots save is unchanged.

Rejected: deferring planning with the submit, which would turn every `execute` from a handler
into a queued result, losing the synchronous `choice-required` and `unverified` outcomes.

### D9 A queued job's events come before the next job; commit hook

While the event queue drains, events emitted by a queued job (its `change` and `history`
events) are placed in front of the remaining queue instead of behind it, so every handler
sees edit N's events before edit N + 1 is applied. The adapter gains an internal commit hook
(`onCommit`) that runs synchronously after each commit and before any event is delivered; the
model facade clears the host-verdict cache there, so a verdict an edit invalidates can never
judge the next queued edit. The `reset` path clears the cache in the same hook.

### D10 `replaceDocument` is checked first and refused during dispatch

`replaceDocument` stays on the facade (snapshot load needs it and hosts may build their own
loaders) but runs a full structural check of the replacement (record shapes, unique IDs across
kinds, port ownership in both directions, connection endpoints) before the store batch; bad
input throws `MisuseError` with nothing changed. Called while events are being dispatched it
throws `MisuseError` too.

Rejected: queueing the replacement like a submit. `replaceDocument` (and `loadSnapshot`)
return the new revision synchronously; a queued replacement could only return a revision that
does not exist yet. A host that loads from a handler can defer with `queueMicrotask`.

### D11 Explicit insertion sequence

An explicit `seq` on an add must be a positive integer no larger than 2^40 and must not be
the sequence of another live entity of the same kind (or of another add staged in the same
patch); a violation is a `conflict` rejection. Undo restores entities with the sequence they
had, which is free after their removal. The bound keeps automatic sequences (one more than the
largest seen) exact. Collections gain a reverse lookup from sequence to ID.

### D12 Records are copied during validation

`validateNodeRecord`, `validatePortRecord` and `validateConnectionRecord` return a new record
holding only the known fields, with fresh copies of the library-owned values (position, size,
ports list, capabilities, placement, endpoints, route). Unknown keys are dropped. The payload
is kept by reference: it is application data of any size, a codec may produce non-JSON
values, and the core has no structured clone without the DOM library. With frozen records the
payload object is frozen in place, which the guide states.

### D13 Bounded error lists

The error sink keeps at most `SnapshotLimits.maxErrors` (default 100) errors and counts the
rest; the result then ends with one `limit-exceeded` error at the root path saying how many
were left out. Parsers decide whether an entry failed by the sink's count, not by the length
of its list.

### D14 `diffSnapshot` with codecs returns a result

`diffSnapshot(from, to, options)` accepts `codecs`. For a node type with a codec it encodes the
current payload and compares the JSON with the snapshot's payload; only when they differ does
it decode the snapshot payload into the update. A codec failure is reported, so the function
returns `Result<Patch, readonly SnapshotError[]>`. `jsonEqual` returns false for two different
objects that are not plain objects or arrays (a `Date`, a `Map`, a class instance), since
their keys say nothing about their value.

### D15 Geometry content dependencies

`NodeGeometry` gains optional `dependsOn`: a list of node content fields (`title`, `status`,
`payload`, `capabilities`) its answers read. The scene rebuilds a node, and its connections,
when an update touches a geometry field or a field its geometry declared. Built-in geometries
declare nothing.

Rejected: rebuilding on every content change (costly for payload-heavy hosts whose geometry
ignores the payload); passing geometry a narrowed view without content (breaks a host that
sizes a node from its title).

### D16 Strict document extras and cursor keys

Selection entries must be unique, the viewport has only `x`, `y` and `zoom`, its `x` and `y`
lie in the world range and its zoom in the supported zoom range (1e-3 to 1e3, constants moved
to the data layer beside the world range). An ID-cursor key `__proto__` is an error at its
path instead of being dropped.

### D17 Load paths never throw

Validation and load wrap the points where untrusted or host code runs: reading properties of
the input object (a getter may throw), host migrations, and payload codecs. A throw becomes an
error in the result (`invalid-shape` for unreadable input and failed migrations,
`non-json-payload` for a codec), with the thrown message.

### D18 Fragment external entries

Each `external` entry must have exactly one end whose node is in the fragment, and that end's
port must belong to that node in the fragment. Anything else is an error at `external[i]`
(`invalid-shape` for zero or two inside ends, `port-node-mismatch` for a foreign port).

### D19 Enlarged index boxes shrink

When an index entry's tight bounds still fit its enlarged ("fat") box, the update is free,
unless the fat box is more than twice as wide or tall as a freshly enlarged box would be; then
the entry is re-inserted with a fitted box.

## Risks / Trade-offs

- D2 drops history the user may have wanted after a temporary refusal; recorded for review.
- D4 refuses documents that previously loaded with coordinates beyond 1e7. The range was
  already documented as the supported one.
- D6 and D16 make some previously accepted documents fail to load; each failure names its path.
