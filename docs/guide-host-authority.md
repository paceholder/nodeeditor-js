# Guide: a host that owns the document

A tutorial for application developers whose graph lives in a store of their own (a remote
service, a database, an in-memory model of another application) rather than in the
editor. The editor keeps showing and editing the graph as usual; the store decides what is
kept. Everything here uses the public entry point `@paceholder/nodeeditor-js` and runs in
plain Node. Read [guide-using-the-model.md](guide-using-the-model.md) first: commands,
results, events and patches work the same way here. For the reasons behind the design read
section 5 of [architecture.md](architecture.md).

The runnable example is `examples/host-authority/`: a store of two lists (nodes and links)
behind a fake asynchronous transport, the mapping from edits to store calls, and a test
that drives it (`npx vitest run examples/host-authority`). The snippets below come from it.

If you know QtNodes: there you would subclass `AbstractGraphModel` and forward every
`addConnection`/`setNodeData` call to your store, synchronously. Here the editor keeps its
own read model, shows each edit at once, and hands the edit to you; you answer later, and
you tell the editor what your store holds by pushing whole snapshots of it.

## 1. The flow

```mermaid
sequenceDiagram
  participant U as User / API
  participant M as Snapshot model
  participant H as Your host code
  participant S as Your store
  U->>M: command (move, connect, delete, ...)
  M->>M: plan, check, apply to the displayed read model
  M-->>U: pending result (shown at once, marked unconfirmed)
  M->>H: onSubmit(submission)
  H->>H: decodeIntents(submission) -> store calls
  H->>S: one atomic batch per submission
  S-->>H: ok / refused
  H-->>M: { status: "accepted" } or { status: "rejected", rejection }
  M-->>U: settled (accepted: nothing to redraw; rejected: rolled back)
  S-->>H: change notification
  H->>S: read the whole document
  H->>M: pushSnapshot(toSnapshot(doc), doc.version)
  M->>M: diff against what is shown, apply as one external change
```

Two copies of the graph exist inside the model. The **confirmed state** is what you last
told it: the last pushed snapshot, advanced by every edit you have accepted since. The
**displayed state** (the read model, `model.reader`) is the confirmed state plus the edits
still waiting for your answer, in the order they were made. Rendering and picking only
read the displayed state, so the editor never waits for your store.

## 2. Creating the model

```ts
import { createSnapshotModel } from "@paceholder/nodeeditor-js";

const model = createSnapshotModel({
  registry,                        // the node types your store offers, as usual
  idGenerator: prefixedIds("alice"), // required, section 3
  onSubmit,                        // section 4
  nodeCreation: "delegated",       // your store names nodes and ports, section 9
  onDelegate,
  timeoutMs: 5000,                 // silence becomes an unknown outcome, section 7
});
```

`createSnapshotModel` returns a `GraphModel` (every command, `on`, `reader`, views and the
React bindings work unchanged) plus `pushSnapshot`, `pendingEdits`, `placeholders`,
`unconfirmed` and `settle`. Further options: `history` (section 8), `pushLimits` (size
limits of pushed snapshots, section 6), `compareRevisions` (section 6), `payloadCodecs`
(also decode pushed snapshots), `onLog` (notes about ignored answers and state changes)
and the usual model settings (`connectionPolicy`, `connectionValidator`, `readOnly`, ...).
`timeoutMs` is the one wait for everything your host answers: edits, undo and redo,
creations and the connection validator. There is no default; without it the model waits
forever.

Start the model with a first push of your document. Until then it is empty.

## 3. Which IDs you issue, and why the generator is yours

Nodes and ports can be named by your store (`nodeCreation: "delegated"`, section 9) or by
the editor (`nodeCreation: "local"`, the default). **Connections are always named by the
editor**, with the ID generator you pass, and your store must keep that ID as the
connection's own ID. There is no option to let the store rename a connection, and the
editor never pairs a connection with another one by its endpoints.

The generator is a required option. The default generator of `createGraphModel` is a
counter per document (`c1`, `c2`, ...), unique only inside one model: two clients editing
one stored document would both name their first connection `c1`. So a host-owned document
needs IDs that are unique across every client. Two ways:

```ts
import { createCounterIdGenerator, type IdGenerator } from "@paceholder/nodeeditor-js";

// A counter behind a per-client prefix: alice.c1, alice.c2, ...
export function prefixedIds(clientId: string): IdGenerator {
  const counter = createCounterIdGenerator();
  const prefix = `${clientId}.`;
  return {
    next(kind, cursor) {
      const { id, cursor: next } = counter.next(kind, cursor);
      return { id: `${prefix}${id}`, cursor: next };
    },
    // A pushed alice.c7 advances the counter, so a client that comes back under the
    // same prefix does not issue alice.c1 again.
    observe(id, cursor) {
      if (!id.startsWith(prefix) || !counter.observe) return cursor;
      return counter.observe(id.slice(prefix.length), cursor);
    },
  };
}

// A random UUID per ID: nothing to coordinate, longer IDs.
export const randomIds: IdGenerator = {
  next: (kind, cursor) => ({ id: `${kind}-${crypto.randomUUID()}`, cursor }),
};
```

The prefix must be unique per client session (a user ID alone is not, if one user can
open two windows). A plain counter is safe only when one client ever writes the document.
Creating the model without a generator is a type error; from untyped code it throws a
`MisuseError`.

### What your store must check for a new connection

Because the editor names connections, your store is the second line of defence against
two clients connecting the same thing. Refuse two cases and answer with a rejection:

| Case | Answer with code |
| --- | --- |
| A connection between the same two ports already exists: in either order for an undirected kind, in the same order for a directed one | `duplicate-connection` |
| The ID is already used by another connection or another entity | `connection-id-claimed` |

A retry of the same ID with the same two ports must be safe: it is the same connection,
not a second one, so answer it as accepted. The editor itself never resubmits an edit
(not even after a timeout, section 7), so this matters only for retries of your own
transport.

The editor's default connection policy already refuses a connection between ports that
are connected, unless `createDefaultConnectionPolicy({ parallel: true })` turns that rule
off. Your store keeps its own rule either way: the editor only knows what you last pushed,
and another client may have connected the pair a moment ago.

Either refusal rolls the connection back like any rejected edit (section 5): it leaves the
display in one change, a `failure` event carries your rejection, its selection is dropped,
and a gesture on it (dragging one of its ends, say) is cancelled with the reason
`entity-removed`. The same happens when a connection was accepted by an asynchronous
connection validator and your store refuses it afterwards.

A store that cannot keep the editor's connection IDs (one that always assigns its own) is
not supported. If a pushed snapshot holds the user's new connection under another ID, the
editor sees two different connections: it removes its own and adds yours.

## 4. Answering an edit

`onSubmit` is called once per submission, in commit order, right after the edit is shown.
It does not wait for the answer to an earlier submission: you decide when each store call
starts, and you may chain them. A submission carries the `operationId`, the `baseRevision`
it was planned against, the `patch`, a `label` and `origin` (`local`, `undo` or `redo`).

`decodeIntents(submission, model.reader)` names what the patch does, so you map intents to
store calls instead of reading patch operations:

| Intent | What it carries |
| --- | --- |
| `move` | every moved node with old and new position, and the route changes of the same patch (`routes`; ignore them if your store keeps no routes) |
| `resize` | nodes with old and new size, and the position change of the same operation |
| `rotate` | absolute quarter turns, old and new (never a step) |
| `mirror` | the absolute flag, old and new, and the rotation change of the same operation |
| `create-node` | a node and its ports, for a model that names nodes itself |
| `delete` | removed nodes with their ports and every connection removed with them |
| `connect`, `disconnect` | one connection record |
| `reconnect` | one connection whose `from` or `to` changed, with old and new endpoints |
| `other` | every operation no other intent names, in patch order |

One gesture is one submission, so dragging three selected nodes is one `move` intent
listing all three. A **reconnect arrives as one `reconnect` intent** that keeps the
connection's ID, never as a disconnect plus a connect; if your store only offers remove
and add, do both in one batch. A disconnect plus an unrelated connect in one patch stays
two intents. Rotation and mirroring are absolute values, so replaying an intent is
harmless; a store with a relative "rotate by one" call turns the difference into steps
itself. `onSubmit` runs after the edit is shown, so `model.reader` already shows it; the
decoder reads it only for an old value the patch leaves out, and command patches leave
none out.

```ts
const onSubmit = async (submission: Submission): Promise<HostAnswer> => {
  try {
    const mapped = mapSubmission(submission, model.reader); // intents -> store operations
    if (!mapped.ok) return { status: "rejected", rejection: mapped.rejection };
    const reply = await store.apply(mapped.ops);              // one atomic batch
    return reply.ok
      ? { status: "accepted" }
      : { status: "rejected", rejection: rejectionOfReply(reply) };
  } catch (error) {
    // The call may or may not have reached the store.
    return { status: "unknown", reason: `The store did not answer: ${String(error)}` };
  }
};
```

Make one submission one atomic store call where you can: a gesture the store takes only
half of cannot be described to the editor.

### The answer

An answer is one of three shapes:

```ts
{ status: "accepted" }                                  // optionally nodeId, section 9
{ status: "rejected", rejection: { code, message, entities } }
{ status: "unknown", reason: "plain text" }
```

Every refusal travels in a field named `rejection`, here and everywhere else in the
library (`Result`, the rejected outcome, the `failure` event); `reason` is only the plain
text of a state that is not a refusal. Build the rejection with
`rejectionOf(code, message, entities?)`. When `entities` is empty the model fills in the
IDs the edit touched. Choose the code from `RejectionCode`: `unsupported-command` for an
edit your store has no call for, `duplicate-connection` and `connection-id-claimed` from
section 3, `conflict` or `unknown-entity` when the stored data moved on.

You can also answer later with `model.settle(operationId, answer)`, the same shape, for
example after a reconnect of your transport. The first answer for an edit wins; `settle`
returns `false` when nothing was settled.

## 5. What `plan` and `execute` return

Commands behave as on a local model, except that an edit that passes the editor's own
checks is never accepted at once: it waits for you.

| Situation | `plan` | `execute` |
| --- | --- | --- |
| An edit the editor's checks allow | `ready` with the patch | `pending` (shown at once); `settled` resolves to `accepted`, `rejected` or `unknown` |
| Called from inside an event handler | `ready` | `queued`; checked and shown after the current dispatch, then as above |
| Refused by policy, capabilities or validation | `rejected` | `rejected` at once; your host is not called |
| Planned against an older revision (`submit` with `baseRevision`) | (not planned) | `rejected` with `stale-revision`; your host is not called |
| The policy offers several plans | `choice` | `choice-required` |
| The connection validator has no verdict yet | `pending` | `unverified` |
| A creation under `nodeCreation: "delegated"` | `delegated` with the intent | `pending`; settles with the node ID (section 9) |
| Undo or redo | `history` | `pending`, or `rejected` with `edit-pending` (section 8) |

`accepted` carries `revision`, the library's revision when the edit settled, and for a
creation `nodeId`. An accepted edit is already on screen, so acceptance publishes no
`change` event. A rejection recomputes the display from the confirmed state plus the
remaining pending edits and applies the difference as one `change` with origin
`external`, then publishes a `failure` event with your `rejection`. A rollback is not an
undo entry.

## 6. Pushing snapshots

Push your whole document whenever it may have changed: after every change notification,
after a reconnect, on a timer. Convert it to a graph snapshot (the shape of
[format.md](format.md)) first; your store keeps its own format.

```ts
async function refresh() {
  const doc = await store.read();
  return model.pushSnapshot(toSnapshot(doc), doc.version);
}
```

A push is **not** a reset, unlike `loadSnapshot`:

1. The snapshot is validated with the same validator as `loadSnapshot`, with its size
   limits (`DEFAULT_SNAPSHOT_LIMITS`: 100 000 nodes, 200 000 connections, 1024 ports per
   node, 256 route constraints per connection, a payload depth of 64; raise them with
   `pushLimits`). Positions must lie within plus or minus 1e7. A problem returns
   `{ ok: false, status: "refused", rejection: [...] }` with JSON paths, and nothing
   changes, pending edits included. A payload codec that fails while diffing is reported
   the same way.
2. The snapshot becomes the confirmed state. The pending edits are re-applied on top of
   it in order; one that no longer applies (its node is gone, say) is dropped from the
   display and marked conflicted (section 7). One the snapshot already contains is not
   applied twice.
3. What is shown is diffed against that result and the difference applied as **one**
   `change` with origin `external`: `{ ok: true, status: "applied", operations }`. An
   equal snapshot changes nothing and publishes nothing.

Entities keep their IDs, so selection, the viewport, history and gestures on untouched
entities survive. A pushed change never enters the local undo history. A push made from
inside an event handler (or from inside `onSubmit`) is queued and applied after the
current dispatch: it returns `{ status: "queued", settled }`.

**Two kinds of revision.** The library's revision (`model.revision()`, a submission's
`baseRevision`, `Accepted.revision`, every `change` event) is a plain integer that counts
the changes of the displayed state: every optimistic edit, rollback, and push that changes
something adds one; an acceptance adds nothing. The second argument of `pushSnapshot` is
*your* token for the snapshot, of any type, and never becomes the library's revision. With
it, a push older than the last applied one is ignored
(`{ ok: true, status: "ignored", reason: "stale" }`), which protects you against reads that
come back out of order. An equal token is applied again, and a push without a token is
always applied. Tokens are compared as finite numbers unless you pass
`compareRevisions(a, b)` (negative when `a` is older). A refused push does not count as
applied.

### Gestures and pushes

A push is an external change, so the editor's usual rule applies: a gesture continues
while the push leaves the entities it involves alone, and is cancelled otherwise, with a
`gesture-cancelled` view event naming the entities and the reason: `entity-removed` when
the push removed one, `external-change` when it changed one. A rollback after your
rejection is an external change too: it cancels a drag of the rolled-back node with
`external-change`, and a gesture on a rolled-back new connection with `entity-removed`.
A cancelled gesture submits nothing.

## 7. Pending edits, conflicts and unknown outcomes

`model.pendingEdits()` lists every unanswered edit in submission order, each with its
`operationId`, `label`, `patch` and `state`:

- `pending`: handed to you, no answer yet; displayed.
- `conflicted`: it no longer applies to the confirmed state after a push or after you
  refused an earlier edit; not displayed. The model publishes one `conflict` event
  (`operationId`, `reason`, `entities`) so you can tell the user, and keeps the edit
  listed until you answer it.
- `unknown`: you answered `unknown`, or `timeoutMs` passed without an answer. The edit
  stays displayed, is re-applied on every push, and is **never handed to you again**: the
  library does not retry, because it cannot know whether your store applied it. It
  publishes one `resync-requested` event; fetch the document, push it, find out what
  happened, then `settle` the edit.

```ts
model.on("resync-requested", async ({ operationId }) => {
  await refresh();
  const applied = await store.wasApplied(operationId);   // your own bookkeeping
  model.settle(operationId, applied ? { status: "accepted" } : {
    status: "rejected",
    rejection: rejectionOf("conflict", "The store did not apply the edit"),
  });
});
```

### Showing what is unconfirmed

`model.unconfirmed()` returns the node, port and connection IDs that a displayed edit
still awaiting you touches. A mounted view passes it to painters as the `unconfirmed`
flag, and `placeholders()` (section 9) to interaction painters; no built-in painter draws
either, so the look is yours ([guide-view.md](guide-view.md)). An accepted edit and a new
placeholder change nothing in the read model and publish no model event, so the view does
not repaint for them by itself: a painter that shows the flag needs
`view.invalidate("scene")` (or `view.interaction.invalidate()` for placeholders) when your
host hands over or answers an edit, for example at the start and end of `onSubmit`.

## 8. Undo and redo

Choose who keeps the history with `history`:

- `"local"` (the default): the editor keeps a stack of this user's edits in commit order.
  Pushes never enter it. An edit leaves the stack when you reject it or it becomes
  conflicted. Undo submits the inverse patch to you like any edit. While the newest edit
  (the one undo would revert) is still pending or unknown, undo is refused with the code
  `edit-pending`, and `historyState().undoReason` says why; it becomes available when you
  answer.
- `"host"`: your store keeps the history. `onUndo({ operationId })` and `onRedo` answer
  like `onSubmit`, the command is `pending` until they do, and the effect arrives with your
  next push. `historyState()` is read from your `historyState` provider (availability,
  labels, reasons) after every change and answer. The editor records no entries, and the
  undo and redo key bindings still run.

## 9. Node creation by the store

With `nodeCreation: "delegated"` the editor never creates a node itself, because a node is
created together with ports only your store knows. `createNode` (and every path that uses
it, such as a palette drop) mints no node or port ID and makes no patch. It hands
`onDelegate` a `create-node` intent (`operationId`, `type`, `position`, optional
`payload` and `title`) and returns `pending`. Meanwhile `model.placeholders()` lists a
placeholder at the requested position, which a view may paint; it is never in the read
model, a snapshot or the history.

Answer with the ID the store gave the node, built with `nodeId(text)`:

```ts
const onDelegate = async (intent: DelegatedIntent): Promise<HostAnswer> => {
  if (intent.kind === "create-fragment")
    return { status: "rejected",
             rejection: rejectionOf("unsupported-command", "This store cannot paste") };
  const { type, position, title } = intent;
  const reply = await store.apply([
    { op: "add-node", kind: type, x: position.x, y: position.y, label: title ?? type },
  ]);
  return reply.ok
    ? { status: "accepted", nodeId: nodeId(reply.created[0]) }
    : { status: "rejected", rejection: rejectionOfReply(reply) };
};
```

The result settles as accepted, with that `nodeId`, once a pushed snapshot holds a node
with that ID (at once if the last push already did); the node appears as part of that
push, with the ports you gave it, and adds no history entry. Matching is by the ID only,
so the ID must be the one the node has in your later snapshots, not the ID of the store's
own operation record: such an ID never matches, and the creation becomes unknown when
`timeoutMs` passes (the placeholder stays, marked unknown, and a `resync-requested` event
is published). An ID that another creation already claimed, or that existed before, is
refused with `node-id-claimed`. A refusal settles the result as rejected with your
rejection.

**Paste and duplicate** first validate the fragment exactly like a local paste (shape,
references, and the fragment size limits, `fragmentLimits`, by default the snapshot
limits above); an invalid fragment is rejected before you are called. Then `onDelegate`
receives one `create-fragment` intent: the nodes (type, position, title, payload, ports),
the placement `offset`, and the fragment's internal connections, all addressed with keys
local to the fragment (`node-1`, `port-1`, `connection-1`), since none of them has an ID
yet. Connections to nodes outside the fragment appear only when the command asked to
preserve them, with the existing port IDs. Create the nodes, then the connections between
the ports you named, and answer plain `accepted`; the nodes arrive with your next push.
The editor cannot apply its connection policy to those connections, because their ports
do not exist yet: **your store owns the policy for connections it creates from a
fragment**. If your store cannot do it, answer `unsupported-command` with a message of
your own; the view reports exactly that message and nothing is created.

With `nodeCreation: "local"` the editor names nodes and ports with your generator and a
creation is an ordinary submission (a `create-node` intent with the node and its ports);
your store must then keep those IDs too.

A model-wide refusal of creation (`readOnly`, or a node type with `creatable: false`) is
reported before any hand-over, and no ID is used.

## 10. How every answer settles

Every answer, whether it comes from the promise of a callback or from `settle`, goes
through one table:

| Edit state | accepted | rejected | unknown |
| --- | --- | --- | --- |
| pending | leaves the list; its patch joins the confirmed state; no event | leaves the list; display recomputed in one external change; `failure` event | becomes unknown; `resync-requested` |
| conflicted | leaves the list; nothing changes (its effect is expected in the next push) | leaves the list; nothing displayed changes; `failure` event | stays conflicted; logged |
| unknown | as for pending | as for pending | stays unknown; logged |
| no such edit (never issued, or already settled) | logged; `settle` returns false | logged; returns false | logged; returns false |

Further rules:

- A second answer for an edit that already has one is logged and changes nothing.
- If a push already holds the effect of an edit you then reject, the effect stays: your
  snapshot wins over your own rejection.
- `loadSnapshot` (opening another document) is still a reset: every pending edit and
  placeholder settles as rejected with `document-replaced`, without rollback and without
  `failure` events.
- `dispose()` settles every unsettled result as rejected with `disposed` and publishes
  nothing.
- Answers, pushes and `settle` calls made from inside an event handler are applied after
  the current dispatch.

## 11. Limits

- Snapshot mode only. Revisioned synchronization (changes tagged with revisions and
  acknowledged by operation ID) is not implemented yet.
- A push costs time linear in the document size, even when little changed. Measured on a
  laptop for a one-node change: about 8 ms at 500 nodes and 87 ms at 5000 nodes (median),
  plus about a third when an edit is pending. Push when your document changed, not on
  every frame.
- The confirmed state is a second copy of the document in memory.
- No retry or deduplication of unknown outcomes: you settle them.
- No merging or conflict resolution beyond re-applying pending edits; the store decides.
- The connection policy stays synchronous and local; a host validator
  (`connectionValidator`) can ask your service before a connection is made, and your
  store still has the last word when the edit arrives.
- No built-in look for unconfirmed entities or placeholders.
