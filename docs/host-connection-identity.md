# Connection identity with a host that owns the document

Host report for the library owner. It replaces host duty 2 in `docs/host-spike-findings.md`
("accept an optional client-supplied connection ID"). The document is written so that someone
without the earlier conversation can continue the work. Read it top to bottom once.

**Status: decisions 1, 3 and 4 taken by the owner (section 8); 2 is closed unless a host asks.** Library
requests 1 to 4 of section 10 are implemented on `main`; section 12 lists each answer.
Statements marked **to verify** were not checked in code.

## 1. The problem

The host's store is the authority for the document. The user draws a wire in the editor, and
the editor needs an ID for that connection immediately, because selection, undo and a running
gesture refer to it. The host also keeps its own record of the connection. Three questions:

1. Who names the connection, the editor or the host?
2. What is a connection's identity: a surrogate ID, or its two endpoints?
3. What prevents the same connection from existing twice?

## 2. Terms

- **Endpoint pair:** the two ports a connection joins. In the library, port IDs are unique in
  the whole model, and a port belongs to one node, so the two port IDs identify the pair.
- **Surrogate ID:** an ID with no meaning, such as `c7` or a random UUID.
- **Derived ID:** an ID computed from the endpoint pair.
- **Delegated creation:** the host, not the library, creates nodes and their ports, then
  tells the library the IDs it chose. Nodes and ports use this mode, because the host builds
  the ports. This report is about connections only.
- **Verdict:** the host validator's answer to "may these two ports connect?". The library
  caches verdicts per plan and shows a pending badge until one arrives.

## 3. Facts

### Library

- `ConnectionId` is an opaque text. The ID generator is host-supplied (`IdGenerator`), and a
  connect command asks it for the ID.
- The adapter design (`openspec/changes/add-snapshot-sync-adapter/design.md`, D15) offers two
  modes. `connectionIds: "client"` is the default: the editor names the ID and the host keeps
  it, so the pushed snapshot holds the same ID and the diff is empty. `"match"` is the
  fallback: the host names it.
- Reconnect keeps the connection ID. It is one update, so selection and a running gesture
  survive (`openspec/changes/add-reconnect-tool`).
- Temporary-ID mapping, where an entity is renamed after the host answers, is a stated
  non-goal of the adapter.
- The default connection policy already rejects a duplicate connection (ordered pair when
  directed, unordered when undirected) with `duplicate-connection`, unless the option
  `parallel` is on. Several connections on one port are allowed. The host can read both
  directions of the lookup from the model: `getConnection(id)` gives the endpoints, and
  `connectionsOfPort(port)` gives the connections of a port, from which the connection
  between two ports is found.
- The connection policy normalizes the direction of a connection (`from` and `to`).

### Host

- A connection is a node in the host's tree with its own UUID and two port references. It is
  created by a function taking the simulation and the two port IDs, which returns the new UUID.
  Deleting takes that UUID.
- **Defect:** the host accepts a connection between two ports that are already connected, in
  either order. Two identical connections can exist. The host allows many connections on one
  port, which is intended.
- Undo and redo run in the host over the whole project. A deleted subtree is stored with its
  UUIDs, so redo most likely restores the same ID (**to verify**).
- The host's validation call checks kind compatibility, same component, and
  signal-direction compatibility. It reads no state.
- A connection joins two ports that carry domain rules. Parallel connections between the same
  two ports have no meaning in this domain.

## 4. How `"match"` works, and where it breaks

`"match"` serves a store that names its own connections.

1. The user draws a wire. The editor creates it locally as `c7`.
2. The edit goes to the host. The host stores it as `9f3a`.
3. The host pushes a snapshot that contains `9f3a` and no `c7`.
4. A plain diff reads this as "remove `c7`, add `9f3a`". Selection is lost, and a gesture on
   the wire is cancelled.
5. So before each diff the adapter looks for a connection it created that the snapshot lacks,
   and a snapshot connection it does not know. If both have the same kind and endpoints, it
   renames the snapshot's connection to `c7`.

Step 5 is a guess. If two identical connections exist between the same ports, the adapter
cannot tell which is which. That is the case the host does not prevent today.

## 5. Options

| | Who names it | Identity | Main problem |
|---|---|---|---|
| A. Client UUID | editor | surrogate | The host must accept a caller-chosen ID. Duplicates need a second rule. |
| B. Derived ID | computed by both sides from the endpoints | the endpoints | Reconnect changes the identity. |
| C. Host names it, adapter matches | host | surrogate | The pairing is a guess (section 4). |
| D. Host names it, adapter renames | host | surrogate | One entity has two names for a while. A non-goal. |

- **A** is common practice: the party that needs the ID first creates it, and the store
  accepts it. A retry is safe. Duplicates stay possible unless the host adds a rule that
  forbids them, and the rule must hold on every creation path.
- **B** is the design of the owner's Qt editor, where the ID is the four values (two nodes,
  two ports). Both sides compute the same ID, so nothing is negotiated or matched.
  Duplicates cannot exist, because the same pair gives the same ID: one rule, enforced by
  construction. A retry is idempotent. Two clients that connect the same pair agree. The
  host does not accept an ID at all. The cost is reconnect (concern 1).
- **C** and **D** are rejected: a heuristic, and a state the design excludes.

## 6. Recommendation

Two designs remain: **A** (the editor names the connection with a UUID) and **B** (the ID is
derived from the endpoints). The host's code decides between them.

**The host addresses every entity by its UUID in one namespace.** The editor, the project
tree, the properties panel and the selection service all share one selection made of UUIDs.
Selecting a connection in the tree highlights the wire, and selecting a wire opens its
properties, both by UUID. Nodes already work this way, because creation of nodes is
delegated and the host names them. Undo, agent tools and storage use the same UUIDs.

With B the editor's connection ID differs from that UUID. The host would need a two-way map
(derived ID and UUID) at every boundary: selection, properties, tree, deletion, history. The
map is rebuilt from each snapshot and must never be stale. With A there is one ID everywhere
and no map.

So the recommendation changes: **A for this host**, with the duplicate rule added.

- The editor's generator returns a random UUID for a new connection. This is the library's
  existing `"client"` mode. **The library needs no change.**
- The host accepts the ID on creation and keeps it as the
  connection's UUID. Reconnect keeps the ID, as the library designs it, so selection and
  gestures survive.
- The host forbids a second connection between the same port pair, in either order, on every
  creation path and in the validation call. This is a plain domain rule, needed in any case
  because the host must not rely on the editor to keep its data valid. It is the one thing B
  would have given by construction.

B stays the better design for a host that has no entity-wide ID namespace, or that wants
retries and independent clients to agree without any ID exchange. If the owner wants the
library to support such hosts, the endpoint helper and reconnect-as-transfer (concern 1) are
the way, as an option and not in the core.

## 7. Concerns, with what to do about each

1. **Reconnect under derived IDs.** The library's reconnect keeps the ID. With B, after the
   end moves, the ID no longer equals the derivation, so the host's snapshot would hold the
   new derived ID and the diff would show a removal and an addition. Needed: when the host
   uses derived IDs, a reconnect becomes an identity transfer. The old ID is deleted and a new
   one is created in one undo step, and the library moves the selection, the hover and any
   running gesture to the new ID. Decide whether this is a flag on the reconnect tool or
   follows from the generator type. Check the reconnect change first.
2. **Delete needs the endpoints.** The host stores UUIDs but the editor knows derived IDs.
   Either the delete intent carries the endpoint pair, or the host keeps a table from derived
   ID to UUID, rebuilt from each snapshot it builds. Carrying the endpoints in the intent is
   simpler. **To verify** which fields the connection intents carry in the adapter design.
3. **Direction and order.** The host stores a pair in no particular order. If the derived ID
   depended on the order, the same connection could get two IDs. The helper must be
   order-independent for undirected kinds, and the host must build its snapshot IDs with the
   same function the editor uses. Test both orders.
4. **A rejection after an accepted verdict.** The validator can say yes, and the creation call
   can still fail, because another client connected the pair first or a port changed. The
   library must roll the local connection back, keep the selection sensible, and report it
   through the existing conflict event. Check that the adapter design covers this order. With
   B the second creation for the same pair is detectable and can be answered as "already
   exists", which is a success for the second client in effect.
5. **Two sources of connection rules.** The library's local policy checks direction and port
   `typeKey` compatibility. The host validates its own kind rules. If they disagree the user
   sees a green badge, then a refusal. Decide between exporting the host's compatibility table
   so one source builds the local policy, and keeping the local policy minimal with the host
   validator as the only judge. The first is faster but duplicates a domain rule table.
6. **Verdict latency.** One round trip per hovered target is acceptable only if the host
   answers quickly. Measure the validation timeout, the cache and the hover behaviour after the
   adapter exists (already an open measurement item).
7. **`"match"` mode.** It is a heuristic with a known failure case. Before 1.0, consider
   removing it, or documenting it as a last resort for stores that cannot accept IDs. A public
   option that invites unreliable integrations is costly to remove after 1.0.
8. **Retries.** The library never resubmits (host duty 5). After a timeout the result is
   `unknown` and the next snapshot decides. With A or B a repeated request is harmless. With
   C or D it can create a second connection.
9. **History in the host.** After a host undo or redo the pushed snapshot may restore a
   connection. With B its ID is the same as before by construction. With A it depends on the
   host restoring the stored UUID (**to verify**). Also check that a restored ID cannot collide
   with an ID the library generated in between.
10. **Reconnect and the duplicate rule.** Moving one end onto a port that already has a
    connection to the other end must be refused. With B this is the same rule as creation
    (the new derived ID exists). The validator request for a reconnect must carry it.
11. **Duplicates in the library and in the host.** The library's default policy already
    forbids a duplicate, so the editor refuses it before any host call, and the host's rule is
    the second line of defence that other clients and other creation paths need. Both must use
    the same definition: unordered for an undirected kind, ordered for a directed kind. The
    guide should say which side owns the rule and that `parallel` turns it off.
12. **Ports that come and go, and storage.** A derived ID is only as stable as the port IDs it
    is built from. It must use stable surrogate port IDs, never positions or indices: in the
    Qt editor a port index shifts when a port is removed, so an ID built on it can point to a
    different port. If a host re-creates a port under a new ID (for example when a component
    changes its port set), the connection's derived ID changes with it, and the editor sees
    a removal and an addition. That matches the data, because the connection's endpoint also
    changed, but check that the host never re-uses a port ID for a different port. The
    derived ID is not a storage key. The host keeps its own record and its own key for each
    connection. The derived ID exists only in snapshots and intents, and the host resolves it
    to its record through the endpoint pair, which is unique by the rule above.

## 8. Decisions needed from the owner

1. **Decided: A.** The editor names the connection with a UUID, and the host accepts and
   keeps it. Reason: the host uses one UUID namespace for selection, tree, properties and
   undo, and B would need an ID map at each boundary.
2. Only if any host wants B: is the endpoint helper plus reconnect-as-transfer acceptable in
   the library, or should the core carry endpoint identity as a built-in connection mode?
3. **Decided: remove `"match"` before 1.0.** It is a heuristic with a known failure case.
   Hosts that cannot accept client IDs need another answer, which is not designed yet.
4. **Decided: keep the local policy minimal.** The library does not copy the host's
   compatibility rules to the client. The host validator is the only judge of its domain
   rules (concern 5).

## 9. Order of work

1. **Host, independent of the adapter:** reject a connection whose port pair is already
   connected, in either order, on every creation path and in the validation call. Test it.
2. **Library:** decisions 1 to 3 above. With A: documentation (a random-UUID generator
   example, what the host must reject) and rejection codes for the two conflicts ("already
   connected" and "ID claimed"). The endpoint helper and reconnect-as-transfer only if B is
   wanted.
3. **Joint, once the adapter exists:** wire the validator and creation, verify concerns 2, 4
   and 9, then measure concern 6.

## 10. Requests still open

Requests 1 to 5 of the first version (sync adapter, removing `"match"`, guide text, rejection
codes, unscoped format identifiers) are done on `main`; the details are in section 12.

1. **Planned items.** A dash per connection kind in the theme, and fit on first content
   (`initialFit` runs only at mount, so a document loaded after mount needs a manual fit).
2. **To measure with a wired host:** verdict latency per hovered target, the validation
   timeout, first paint, and a large document with connections.

New findings and proposals from the first integration are in `docs/host-integration-findings.md`.

## 11. What is not done

No code was changed in the library or in the host for this proposal. The host's duplicate
defect is confirmed by reading its create and delete functions; it has no test yet.

## 12. Library answers (implemented on `main`)

Sections 1 to 11 are the host's proposal and stay as written. This section is the library's
reply to each request and concern.

### Requests still open (section 10)

| # | Answer |
|---|---|
| 1 (planned items) | Planned, not built: dash per connection kind and fit on first content (change `add-host-integration-checks`). |
| 2 (to measure) | Waits on the host running the adapter. Pushing one changed node costs about 8 ms at 500 nodes and about 87 ms at 5000 (measured once, laptop on battery, so indicative); a push is linear in document size. |

### Concerns of section 7

1, 2, 3, 12 (derived IDs): moot, since A was chosen. 4: covered by request 4. 5: still open
(decided, section 8). 6: measure after the adapter is wired. 7: `"match"` is gone. 8: the guide
states that retrying the same ID with the same ports must be safe. 9: host side, see below.
10: the reconnect tool is not built yet; its plan will say that the validator request for a
reconnect carries the duplicate rule. 11: the guide names the owner of each rule: the
library's default policy refuses a duplicate locally unless `parallel` is on, and the host
repeats the rule as its second line of defence.

### Decisions of section 8

1 and 3 are implemented. 2 (derived IDs) stays closed unless a host asks for it. 4 is
decided: the local policy stays minimal and the host validator is the only judge of the
host's rules, so no host rule table is copied to the client. Consequence for the host: a
hover over a target waits for the validator's verdict, so its latency matters (see the
questions in `docs/host-spike-findings.md`, section 1).

### Behaviour the host should know

- Accepted edits and new placeholders publish no model event. A painter that shows the
  unconfirmed flag calls `view.invalidate("scene")` when it hands over or answers an edit.
- A restored connection after a host undo must come back under its stored UUID (concern 9);
  the adapter refuses a created node whose ID a pending local edit adds (`node-id-claimed`).
- Not decided yet, with the library's leaning: answers that arrive out of order for edits
  that depend on each other (confirm in commit order); `plan` consuming an operation ID
  (a non-consuming peek); a node pushed after hand-over that carries the ID a pending creation
  later claims; creation blocked by a capability policy in delegated mode (read-only mode
  blocks it today).
