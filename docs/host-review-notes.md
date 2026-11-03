# Open questions for the host review

Short notes for the review on the host side. Each section says what the question is, why it
matters, and what we need to know. Neutral wording; nothing here goes into library files.

## Decisions so far (library owner)

- Overlapping edits: the UI applies every edit optimistically at once; edits are handed to
  the host one after another in order. A conflict between a pending edit and an incoming
  refresh is logged; section 2 asks how the previous editor solved it.
- Selection events get an origin tag (`"user"` or `"api"`).
- Marquee selects partly covered nodes, identically in both drag directions.
- Packaging: the host links the repository directly; a registry can come later.
- IDs: build only the client-side generator route until the host answers section 1.

## 1. Who mints entity IDs

How it works in the library today (requirement MOD-03a): the document asks a generator
for each new ID. The default generator makes `n1`, `p1`, `c1`. A host can plug in its own
generator, for example one that returns UUIDs. The library treats IDs as opaque strings and
never parses them. The idea matches a `generateNodeId` hook with a default implementation;
here the hook is an object (`next(kind, cursor)`) so planning stays pure.

The catch: the generator runs synchronously, when the edit is planned. It can make a UUID
on the client. It cannot ask a server.

Two possibilities:

- **A. The server accepts IDs created by the client.** The generator makes UUIDs, the
  edit goes to the server with them, the next refresh holds the same IDs. Selection and
  drags survive the refresh. Nothing else to build.
- **B. The server always assigns its own IDs.** The editor holds a temporary ID until the
  refresh arrives with the real one. Without extra work the refresh looks like "the temporary
  node was removed and a new node appeared", so selection and gesture state are lost. Fix:
  an ID alias map in the adapter that renames the temporary ID to the real one in place.
  More work, touches MOD-03 and PRT-01.

A node dropped from a palette has ports too, so the question covers port IDs and
connection IDs, not only node IDs.

**Questions for the host:** how did the previous editor handle new entities: a client UUID, or a temporary ID that was renamed after the server answered? Can create calls take an ID chosen by the client? Are port IDs
fixed by the component type or created per instance?

## 2. Overlapping edits

Situation: the user drags a node, releases, and immediately rotates it, before the server
has answered the first edit.

The library sends each edit as one patch tagged with the revision it was based on. Two
policies are possible:

- **Send in order, don't wait (proposed).** Edit 2 goes out while edit 1 is still open.
  The view shows both results at once (optimistic). If the server rejects edit 1, edit 2 is
  re-checked and may also fail. The user is never blocked.
- **Send one at a time.** Edit 2 waits until edit 1 is answered. Simpler to reason about,
  but the UI either lags or the user is blocked during slow round trips.

What we need to know about the server:

1. Does it keep the order of calls it receives from one client?
2. Does a later edit of the same component conflict with an earlier unfinished one
   (for example move then rotate), or are they independent fields?
3. How long does a typical edit take, and can it fail often (validation) or rarely?
4. After each change the host re-reads the whole schematic. Can an answer arrive
   that is older than the edit the user just made? If yes, the refresh must not undo the
   user's pending edit; the adapter re-applies pending edits on top of each refresh.

## 3. The adapter

Not an extra layer of the host: it is the library's adapter contract (MOD-02). Every edit
the user makes becomes a patch, and the adapter decides whether it is accepted. The local
in-memory adapter exists today. The planned snapshot-sync adapter does this for a host
that owns the document:

1. The user edit is applied at once as a pending change and shown.
2. The adapter sends it to the host (a callback the host implements: "node 7 moved to
   x, y", "connection created between these ports").
3. When the host pushes a full refreshed snapshot, the adapter compares it with the current
   state and emits only the differences. Nothing is reset: selection, zoom and an open drag
   stay. Pending edits are applied again on top of the new state.
4. If the host rejects an edit, the pending change is rolled back.

The adapter is plain library code; the host supplies the callback and the snapshot.

## 4. Selection change origin

When the host sets the selection from outside (for example from a tree view), the editor
raises a selection event too. The host then cannot tell its own change from a user click,
and the two panels can ping-pong. Proposal: every selection event says where it came from,
`"user"` for a click in the editor and `"api"` for a programmatic change. The host ignores
`"api"` events. Is that enough, or does the host also want the event suppressed entirely?

## 5. Marquee selection

Marquee is the rectangle you drag on empty canvas to select several nodes at once.
There are two ways to decide what gets selected:

- **Contain:** only nodes fully inside the rectangle.
- **Intersect:** any node the rectangle touches, even partly.

Today the library chooses by drag direction (right-to-left selects partly covered nodes).
The host selects partly covered nodes. Should it work that way in both directions, or
should the direction rule stay (it is a common convention in CAD tools)?

## 6. Package consumption

The host can reach the repository directly, so a git dependency or a workspace link works.
Remaining choice: the host builds from source, or CI builds `dist` and publishes it to a
private registry. Start with a git or workspace link; a registry can come later.
