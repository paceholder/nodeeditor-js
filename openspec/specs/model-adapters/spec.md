# model-adapters Specification

## Purpose

Defines where authority over the graph lives: the library's read model and pending layer, the
local and external adapters, snapshot and revisioned synchronization modes, and how remote
changes and host-owned history are reconciled without a second source of truth.

## Requirements

### Requirement: Library read model
The library SHALL always keep its own read model with indexes, used synchronously by rendering, hit-testing, and routing. A frame SHALL never wait on the authority to answer.

#### Scenario: Rendering while the host is slow
- **WHEN** an external adapter takes several seconds to answer a submitted edit
- **THEN** pan, zoom, picking, and painting keep using the read model without blocking

### Requirement: External authority without duplicate storage
The library SHALL support an external adapter that makes a host authoritative for state, validation, and history without requiring the host to adopt the library's storage representation or local history stack.

#### Scenario: Host keeps its own format
- **WHEN** a host plugs in an external adapter that converts its own documents to library snapshots
- **THEN** editing works without the host storing the library's document format

### Requirement: Local adapter
The library SHALL ship a local adapter that accepts or rejects submitted patches synchronously and owns a local undo/redo history. Editing tools SHALL use the same adapter contract for local and external authority.

#### Scenario: Synchronous acceptance
- **WHEN** a valid patch is submitted to the local adapter
- **THEN** the result is available immediately and the read model reflects it before the call returns

### Requirement: Pending layer and edit states
Submitted but unconfirmed edits SHALL live in a pending layer separate from confirmed state. Each edit SHALL be in one of the states local preview, pending, conflicted, accepted, rejected, or unknown outcome, and the library SHALL expose, for every entity, whether an edit of it is unconfirmed so that painters and hosts can distinguish it from confirmed state; the library itself ships no visual treatment.

#### Scenario: Optimistic display
- **WHEN** a rotate edit is submitted to an external adapter
- **THEN** the node shows the rotation immediately, is reported as unconfirmed, while the confirmed read model is unchanged

#### Scenario: Rollback on rejection
- **WHEN** the authority rejects a pending edit
- **THEN** the pending layer drops it, the view shows the confirmed state again, and a failure event carries the rejection

### Requirement: Re-apply pending edits over incoming changes
When confirmed state changes while local edits are pending, the library SHALL rebuild the displayed state as confirmed state plus the still-valid pending patches. A pending patch that no longer applies SHALL be marked conflicted and shown as rejected locally until the authority's answer arrives.

#### Scenario: Remote edit during pending move
- **WHEN** a local move of node A is pending and a remote change renames node B
- **THEN** the view shows B's new name and A at its pending position

#### Scenario: Remote deletion invalidates pending edit
- **WHEN** a local move of node A is pending and a remote change deletes A
- **THEN** the pending move is marked conflicted and A disappears from the view

### Requirement: Server-authoritative collaboration
The library SHALL contain no merge or CRDT logic. Edits by other users SHALL arrive through the adapter as external changes; conflicts SHALL be resolved by the authority accepting or rejecting edits.

#### Scenario: Concurrent edits
- **WHEN** two clients edit the same node and the authority accepts one and rejects the other
- **THEN** each client ends with the accepted state and the rejecting client shows the rejection

### Requirement: External changes are not local undo entries
Changes originating outside this editor SHALL update the read model as authoritative and SHALL NOT be added to the local user's undo history. Gestures or references invalidated by such changes SHALL be cancelled or explicitly replanned.

#### Scenario: Remote change and undo
- **WHEN** a remote change adds a node and the local user then undoes
- **THEN** the undo reverts the local user's last edit and the remote node stays

#### Scenario: Gesture target removed
- **WHEN** a remote change deletes the node a local user is dragging a connection from
- **THEN** the gesture is cancelled and the user is told why

### Requirement: Snapshot synchronization mode
An external adapter SHALL be able to push complete graph snapshots without revisions. The library SHALL validate each snapshot, compute the patch from the current read model to it, and apply that patch so that selection, active gestures on surviving entities, and pending edits are preserved.

#### Scenario: Full refetch becomes an incremental update
- **WHEN** a host pushes a full snapshot that differs from the read model only in one node's position
- **THEN** subscribers receive a patch with a single update and the current selection is unchanged

#### Scenario: Invalid snapshot
- **WHEN** a pushed snapshot contains a connection to a missing port
- **THEN** it is rejected with a structured error and the read model keeps the previous state

### Requirement: Revisioned synchronization mode
An external adapter SHALL be able to push a full reset or incremental changes tagged with revisions, and SHALL receive submitted patches with operation ID and base revision. Revision ordering SHALL be declared by the adapter, not inferred from token text.

#### Scenario: Incremental change applied
- **WHEN** the adapter pushes a change whose predecessor is the current revision
- **THEN** the change is applied and the read model advances to the new revision

### Requirement: Revision continuity
In revisioned mode a gap or out-of-order incremental update SHALL trigger rejection or resynchronization, never silent partial application.

#### Scenario: Revision gap
- **WHEN** the adapter pushes a change whose predecessor revision is not the current one
- **THEN** the change is not applied and the library requests a full reset

### Requirement: Order-independent correlation
The library SHALL correlate acknowledgments and authoritative changes by operation ID, independent of arrival order, and SHALL discard stale updates using the adapter's revision ordering.

#### Scenario: Change arrives before acknowledgment
- **WHEN** the authoritative change for a pending edit arrives before its acknowledgment
- **THEN** the edit is reconciled once, the pending entry is retired, and the later acknowledgment causes no second application

### Requirement: No blind retry of unknown outcomes
An edit whose outcome is unknown (for example a lost acknowledgment) SHALL NOT be retried automatically unless the adapter declares deduplication or status recovery; otherwise the library SHALL require resynchronization before retry.

#### Scenario: Lost acknowledgment
- **WHEN** a submission times out and the adapter declares no deduplication support
- **THEN** the edit is marked unknown outcome, not resubmitted, and a resynchronization is requested

### Requirement: Validation identity
Cached per-frame validation SHALL be separate from authoritative commit validation. Asynchronous validation results SHALL carry the candidate, signature, and revision they apply to and SHALL NOT approve a different or superseded candidate. A result for a candidate that is no longer current SHALL NOT change the outcome for the current candidate; it MAY be kept under its own key for reuse.

#### Scenario: Late validation result
- **WHEN** an async validation result arrives for a candidate the user has already moved away from
- **THEN** the result is kept under its own key only and the current candidate stays pending

### Requirement: Responsiveness during slow host work
While host work is pending, unrelated view operations and cancellation of unsubmitted gestures SHALL remain usable. Conflicting edits on the same entities SHALL be handled by a documented policy: queue behind the first, reject, or (for an adapter that hands edits to the host in commit order without waiting and rebases the rest on every answer) apply optimistically in order and mark an edit conflicted when it no longer applies after the host answers an earlier one.

#### Scenario: Conflicting edit while pending
- **WHEN** a move of node A is pending and the user starts a second move of A
- **THEN** the library applies the documented policy of the adapter in use and pan remains available

#### Scenario: Optimistic in-order policy
- **WHEN** an adapter uses the optimistic in-order policy, a move of A is pending, the user rotates A, and the host then rejects the move
- **THEN** the rotate is rebased on the confirmed position, stays displayed if it still applies, and is marked conflicted if it does not

### Requirement: Submitted edits cannot be cancelled by the view
Cancelling a gesture SHALL discard only unsubmitted previews. After submission, the view SHALL wait for and reconcile the authority's outcome; undo of an accepted edit is a subsequent command.

#### Scenario: Escape after submission
- **WHEN** the user presses Escape while a submitted edit is pending
- **THEN** the edit stays pending until the authority answers

### Requirement: Host-owned history
An external adapter SHALL be able to own history so that no hidden local persistent undo stack exists. Undo/redo availability, descriptions, pending state, and rejections SHALL be surfaced through the same command contract as local history.

#### Scenario: Undo forwarded to host
- **WHEN** the user invokes undo with a host-owned history
- **THEN** the undo request is sent to the adapter, shown as pending, and the confirmed result arrives as an authoritative change

### Requirement: Whole-document replacement is checked before it changes anything
The local adapter's whole-document replacement (used by snapshot load) SHALL check the replacement before changing the store: valid records, IDs unique across kinds, port ownership in both directions, and present connection endpoints. Invalid input SHALL raise a misuse error with document, revision, history and events unchanged. A replacement requested while events are being delivered SHALL raise a misuse error, as its revision cannot be returned synchronously.

#### Scenario: A replacement naming a missing port
- **WHEN** a replacement lists a node whose ports list names a port that is not in the replacement
- **THEN** a misuse error is raised, and the revision, the nodes and the undo history are unchanged and no event is published

#### Scenario: Replacement from inside a handler
- **WHEN** a change handler requests a whole-document replacement
- **THEN** a misuse error is raised and the document is unchanged

### Requirement: Host verdicts are cleared right after commit
A host connection validator's answers (verdicts) are cached per proposed connection. The cache entries that a committed edit makes stale SHALL be cleared synchronously right after that commit, before any event is delivered and before any queued edit is applied.

#### Scenario: Verdicts invalidated before the next queued edit
- **WHEN** two edits are queued from one handler and the first one removes a port that a cached verdict concerns
- **THEN** the verdict is gone when the second edit is validated

### Requirement: Base revision is checked by the local adapter
A submission's base revision is the revision of the read model its patch was planned against. The local in-memory adapter SHALL reject a submission whose base revision differs from the current revision with the code `stale-revision`, changing nothing and reporting it like any other rejected edit. Undo and redo SHALL never be refused for a stale base revision. Without a base revision from the caller, the model SHALL use the current one.

#### Scenario: Stale base revision
- **WHEN** a caller reads the revision, another edit is accepted, and the caller submits a patch with the revision it read
- **THEN** the outcome is rejected with code `stale-revision` and the document is unchanged

#### Scenario: Current base revision
- **WHEN** a caller submits a patch with the model's current revision
- **THEN** the edit is accepted

### Requirement: Queued submissions are checked when submitted
A submission made from inside an event handler is queued and applied after the current dispatch. Its base revision SHALL be checked when it is submitted, not when it is applied, so several edits queued from one handler are not refused because the earlier ones advanced the revision.

#### Scenario: Two edits queued from one handler
- **WHEN** a change handler submits two edits, each with the revision current when it was submitted
- **THEN** both are applied after the dispatch

### Requirement: Snapshot adapter edit flow
The library SHALL provide an external adapter for snapshot mode. A submitted edit SHALL show in the displayed read model at once, go to a host callback with its operation ID, base revision and patch, and settle as accepted, rejected or unknown outcome from the host's answer. `submit` SHALL return a deferred result. The callback SHALL be called once per submission, in commit order, without waiting for the answer to an earlier submission; the host decides when to start its own work. The base revision is the library's revision: the non-negative integer that counts the changes of the displayed read model. A submission whose base revision is not the current displayed revision SHALL be rejected at once with the code `stale-revision`, without calling the host and without changing the display; a submission made from inside an event handler SHALL be checked when it is submitted. A host's rejection SHALL be carried in the outcome's `rejection` field.

#### Scenario: Optimistic edit then acceptance
- **WHEN** a move is submitted and the host callback has not answered
- **THEN** the displayed state shows the new position, the edit is pending, and the confirmed state still holds the old position

#### Scenario: Overlapping edits are handed over in order
- **WHEN** the user moves a node, releases, and rotates it before the host has answered the move
- **THEN** both edits show in the displayed state at once, the callback is called twice in that order, and the second call does not wait for the first answer

#### Scenario: Acceptance retires the edit
- **WHEN** the host answers that the move is accepted
- **THEN** the edit leaves the pending layer, its patch becomes confirmed state, and no second change event is emitted for it

#### Scenario: Rejection rolls back
- **WHEN** the host answers that a pending move is rejected
- **THEN** the displayed state returns to the confirmed position in one change event and a failure event carries the host's rejection

#### Scenario: Stale base revision
- **WHEN** a caller reads the revision, a push then changes the displayed state, and the caller submits a patch with the revision it read
- **THEN** the outcome is rejected with code `stale-revision`, the host callback is not called, and the displayed state is unchanged

### Requirement: Snapshot push is an incremental external change
Pushing a snapshot SHALL validate it with the shared validator and its size limits, make it the new confirmed state, diff the displayed read model against that snapshot with the still-applicable pending edits applied on top, and apply the result as one committed change with origin `external`. A push made from inside an event handler SHALL be queued and applied after the current dispatch. It SHALL NOT clear history, SHALL NOT emit `reset`, and SHALL NOT add an undo entry. An invalid snapshot, or one whose payload codec fails while diffing, SHALL return a structured list of rejections with paths and leave all state, including pending edits, unchanged. A push whose diff is empty SHALL emit no change event.

#### Scenario: Refresh without side effects
- **WHEN** a node is selected, history has two entries, and the host pushes a snapshot that changes only another node's title
- **THEN** one change event with a single update is published, the selection and both history entries are unchanged, and no reset event is published

#### Scenario: Unchanged refresh is silent
- **WHEN** the host pushes a snapshot equal to the confirmed state
- **THEN** no change event is published

#### Scenario: Invalid push
- **WHEN** the host pushes a snapshot with a connection to a missing port
- **THEN** the push returns a structured rejection naming the connection and the read model and pending edits are unchanged

#### Scenario: Oversized push
- **WHEN** the host pushes a snapshot larger than the configured size limits
- **THEN** the push returns a structured rejection and nothing changes

#### Scenario: Out-of-range push
- **WHEN** the host pushes a snapshot with a node at x 2e7 or a connection with 300 route constraints
- **THEN** the push is refused with `out-of-range` or `limit-exceeded` at that entity's path and nothing changes

#### Scenario: Push from inside a handler
- **WHEN** a change handler pushes a snapshot while another change is being dispatched
- **THEN** the push is applied after the dispatch ends, in call order, and its result is deferred

### Requirement: Pending edits rebase on a push
After a push the displayed state SHALL be the new confirmed state plus the pending patches that still apply, in submission order, produced as the single change of that push. A pending edit that no longer applies SHALL be marked conflicted, SHALL NOT affect the displayed state, SHALL be reported as a conflict, and SHALL stay listed until the host settles it. A pending edit an incoming snapshot already contains SHALL NOT be applied twice (the order-independent correlation rule in snapshot mode), and the host's snapshot SHALL win over a later rejection of that edit: confirmed state is stored, never derived by undoing pending edits.

#### Scenario: Push during a pending move
- **WHEN** a move of node A is pending and a pushed snapshot renames node B
- **THEN** the displayed state has B renamed and A at its pending position, in one change event

#### Scenario: Push that already contains the edit
- **WHEN** a move of A is pending and the pushed snapshot already holds A at the pending position
- **THEN** the displayed state is unchanged, no change event is published for A, and the edit is still settled by the host's answer

#### Scenario: Rejection after a push that holds the edit
- **WHEN** a move of A from p1 to p2 is pending, the pushed snapshot already holds A at p2, and the host then rejects the move
- **THEN** A stays at p2, because the host's snapshot says so, and a failure event carries the rejection

#### Scenario: Push deletes the target of a pending edit
- **WHEN** a move of A is pending and the pushed snapshot omits A
- **THEN** A disappears from the displayed state and the move is reported as conflicted

### Requirement: Gestures survive unrelated pushes
A snapshot push is an external change, so the rule for changes to involved entities applies to it: it SHALL NOT cancel an active gesture unless the push changes or removes an entity the gesture involves, and when it does the gesture SHALL be cancelled, submit nothing, and a `gesture-cancelled` event SHALL tell the host the entity IDs and the reason: `entity-removed` when the push removed an involved entity and `external-change` when it changed one. A rollback after the host rejects an edit is an external change too and SHALL cancel a gesture on a rolled-back entity in the same way. A push SHALL NOT change the viewport or the selection of entities it does not remove.

#### Scenario: Unrelated refresh during a drag
- **WHEN** node A is being dragged and a push changes only node B
- **THEN** the drag continues, its preview is unaffected, and releasing it submits one move of A

#### Scenario: Dragged node removed
- **WHEN** node A is being dragged and a push removes A
- **THEN** the drag is cancelled, nothing is submitted, and a `gesture-cancelled` event names A with reason `entity-removed`

#### Scenario: Dragged node changed by a push
- **WHEN** node A is being dragged and a push changes A's title
- **THEN** the drag is cancelled with reason `external-change` and nothing is submitted on release

#### Scenario: Viewport and selection survive
- **WHEN** a push arrives while the user has panned and selected nodes that the push does not remove
- **THEN** viewport and selection are unchanged

### Requirement: Unknown outcome and resynchronization
When the host reports that an edit's outcome is unknown, or an optional configured timeout elapses without an answer, the adapter SHALL mark the edit unknown outcome with a plain-text reason, keep it visible and listed, NOT resubmit it, and publish an event requesting resynchronization. A later valid push SHALL rebase the unknown edit by the rule that pending edits rebase on a push; the host SHALL then settle it explicitly. The adapter declares no deduplication.

#### Scenario: Lost acknowledgment
- **WHEN** the host callback reports an unknown outcome for a pending move
- **THEN** the edit's state is unknown, the callback is not called again for it, and a resync-requested event is published

#### Scenario: Resolution after resync
- **WHEN** a resync push contains the moved position and the host then settles the edit as accepted
- **THEN** the edit leaves the pending layer and the displayed state is unchanged

### Requirement: Host-owned history in snapshot mode
A snapshot adapter SHALL support `history: "host"`, in which no local undo stack exists. Undo and redo SHALL call host callbacks, be reported pending until settled, and their effect SHALL arrive as an ordinary push. Availability and labels SHALL come from a host provider through the same history state as local history. Under host-owned history the library SHALL record no history entries of its own, and the built-in undo and redo key bindings SHALL still run the undo and redo commands. In `history: "local"` the adapter SHALL keep a local stack of the user's edits in commit order, excluding external pushes; an entry SHALL be added when the edit is committed and dropped when the host rejects the edit or it is marked conflicted, and undo while the newest edit is pending or unknown SHALL be refused with the rejection code `edit-pending`, the history state giving a plain-text undo reason.

#### Scenario: Undo forwarded
- **WHEN** the user invokes undo under host-owned history
- **THEN** the host undo callback is called once, the command is pending, and no local patch is applied

#### Scenario: Availability from the host
- **WHEN** the host provider reports undo unavailable with a reason
- **THEN** the history state and the undo command report unavailable with that reason

#### Scenario: Availability follows the host's value
- **WHEN** the host pushes a new history state saying redo is available
- **THEN** the history state reports redo available and no local entry exists

#### Scenario: Undo while the newest edit is pending
- **WHEN** under local history the user moves A, then rotates A, and presses undo before the host answered the rotate
- **THEN** undo is refused with the rejection code `edit-pending` and nothing changes; after the host answers it undoes the rotate

#### Scenario: Rejected edit leaves the stack
- **WHEN** under local history the host rejects the user's last edit
- **THEN** the edit is no longer on the undo stack and undo reverts the edit before it

#### Scenario: Pushes are not undo entries
- **WHEN** under local history a push changes a node and the user then undoes
- **THEN** the undo reverts the user's last edit and the pushed change stays

### Requirement: Submission intent decoding
The library SHALL provide a pure decoder from a submission and the read model before it to a list of named intents: move, resize, rotate, mirror, create node, delete (nodes and connections), connect, disconnect, reconnect (an update of a connection's endpoints), and a catch-all for operations it cannot name. Each intent SHALL carry the old and new values. Rotation SHALL be given as the absolute number of quarter turns and mirroring as the absolute flag, never as a step or a toggle, so a retry is safe. Every operation of the patch SHALL be claimed by exactly one intent, by the primary field it changes: an operation that changes the size of a node is a resize and carries the position change it holds, an operation that changes the mirror flag is a mirror and carries the rotation change it holds, and updates of the pinned routes of connections are folded into the move intent of the same patch. A gesture that changes several nodes SHALL decode to one intent carrying all of them.

#### Scenario: Multi-select move is one intent
- **WHEN** a submission moves three nodes by the same delta
- **THEN** the decoder returns one move intent listing the three nodes with their old and new positions

#### Scenario: Move with pinned routes
- **WHEN** a submission moves two nodes and updates the pinned route of the connection between them
- **THEN** the decoder returns one move intent that also carries the route change, and no separate route intent

#### Scenario: Resize that moves the node
- **WHEN** a submission changes a node's size and, in the same operation, its position
- **THEN** the decoder returns one resize intent carrying both the size and the position change, and no move intent

#### Scenario: Mirror that changes rotation
- **WHEN** a submission sets a node's mirror flag and, in the same operation, changes its rotation
- **THEN** the decoder returns one mirror intent carrying the new flag and the rotation change, and no rotate intent

#### Scenario: Delete includes incident connections
- **WHEN** a submission removes a node and its two connections
- **THEN** the decoder returns one delete intent naming the node and both connections

#### Scenario: Reconnect
- **WHEN** a submission updates the endpoints of one connection and keeps its ID
- **THEN** the decoder returns one reconnect intent naming that connection with its old and new endpoints

#### Scenario: Remove plus add is not a reconnect
- **WHEN** a submission removes one connection and adds an unrelated one
- **THEN** the decoder returns a disconnect and a connect, not a reconnect

#### Scenario: Rotate is absolute
- **WHEN** a submission turns a node from one quarter turn to three
- **THEN** the rotate intent carries old 1 and new 3

#### Scenario: Nothing is dropped or counted twice
- **WHEN** a submission holds an operation the decoder has no name for
- **THEN** that operation appears in a catch-all intent and every operation of any decoded patch is claimed by exactly one intent

### Requirement: Store-wrapping recipe
The library documentation and a runnable headless example SHALL show how a host with its own store (for example two lists, nodes and connections, or a remote service) plugs in the snapshot adapter: converting its documents to snapshots, mapping a decoded submission to store calls, answering the adapter, pushing a refreshed snapshot, and what `plan` and `execute` return in each outcome. The example SHALL run in Node and be exercised by a test.

#### Scenario: Example runs headless
- **WHEN** the example's test creates the store, edits through the model and refreshes
- **THEN** it observes an optimistic edit, a store call, a settled edit and a refresh that produces no further change

#### Scenario: Host keeps its own format
- **WHEN** the example store is inspected after edits
- **THEN** it holds only its own list format and no library document

### Requirement: Node creation goes through the adapter
Creating a node SHALL stay one `createNode` command used by every creation path, and its planning SHALL depend on whether the adapter lets the editor name nodes. For a local adapter the command SHALL plan the node and its ports at once with IDs from the ID generator and report the new node's ID, as one history entry. For an adapter that declares nodes are named by the host, the command SHALL make no local patch and SHALL NOT mint a node or port ID: its plan SHALL be a delegated outcome carrying a create-node intent with an operation ID, and executing it SHALL hand the intent to the host and return a pending result. The host SHALL answer with the ID it gave the node, and the result SHALL settle when a pushed snapshot contains a node with that ID (at once if it already does), or as rejected when the host refuses. If the node never appears within the configured timeout the outcome SHALL become unknown and resynchronization SHALL be requested; an ID already claimed by another operation SHALL be refused. A node SHALL NOT be shown in the read model before the authority has named it and its ports. The adapter contract SHALL carry what the model needs for this, without a separate adapter interface.

#### Scenario: Local creation is immediate
- **WHEN** a node is created through the local adapter
- **THEN** the result carries the new node ID, the node and its ports are in the read model, and one history entry exists

#### Scenario: Delegated creation waits for the host
- **WHEN** a node is created through an adapter whose nodes are named by the host
- **THEN** the host callback receives one create-node intent with the type and position, the read model is unchanged, the ID generator was not used, and the result is pending

#### Scenario: The node arrives in a snapshot
- **WHEN** the host pushes a snapshot containing the new node and its ports
- **THEN** the node appears as an external change, the pending result settles with the node's ID, and no history entry is added

#### Scenario: Matching by the named ID
- **WHEN** two creations are pending and the host answers each with a node ID, and the snapshot holds both nodes in the other order
- **THEN** each pending result settles with its own node ID

#### Scenario: The node never appears
- **WHEN** the host accepted a creation but no pushed snapshot contains the node before the timeout
- **THEN** the outcome is unknown, the placeholder is marked unknown and a resync-requested event is published

#### Scenario: The named ID must be one the snapshot contains
- **WHEN** the host answers a creation with the ID of a wrapper record (an ID that identifies its own operation record) that no pushed snapshot ever contains, while the node itself appears under a different ID
- **THEN** the wrapper ID never matches a node, the pending result does not settle from the pushed node, and after the timeout the outcome is unknown; the ID the host names in its answer must therefore be the ID the node has in later snapshots

#### Scenario: ID already claimed
- **WHEN** the host answers a creation with an ID that another operation already claimed
- **THEN** that creation settles as rejected with the rejection code `node-id-claimed`, the placeholder is dropped, and the event is logged

#### Scenario: The host refuses
- **WHEN** the host answers that the creation is rejected
- **THEN** the pending result settles as rejected with the host's rejection and the read model is unchanged

### Requirement: Placeholder for a pending creation
While a delegated creation is pending, the pending layer SHALL hold a placeholder record with the node type, position and operation ID. A placeholder SHALL NOT be part of the read model, SHALL NOT be serialized, and SHALL NOT enter history. It SHALL be removed when the node arrives or the host refuses, and SHALL be marked unknown, and stay until settled, when the outcome is unknown. The view MAY paint it.

#### Scenario: Placeholder is queryable
- **WHEN** a delegated creation is pending
- **THEN** the pending layer lists one placeholder at the requested position, and the exported snapshot does not contain it

#### Scenario: Placeholder removed on arrival
- **WHEN** the node arrives in a pushed snapshot
- **THEN** the placeholder is gone

### Requirement: Paste, duplicate and unavailable creation
Under an adapter whose nodes are named by the host, paste and duplicate SHALL first validate the fragment as untrusted input, exactly as local paste does, and reject an invalid or oversized one before any intent is built; they SHALL then hand the host one create-fragment intent instead of creating anything: it SHALL carry the fragment's nodes (type, position, title, payload), the placement offset, and the fragment's internal connections expressed with keys local to the fragment, since the ports they join do not exist yet. The library SHALL create none of them and SHALL NOT apply the connection policy to the fragment's connections, which the host owns; the host creates the nodes and then the connections, or answers that the operation is not supported with a rejection of code `unsupported-command` and a message of its own, in which case the command settles as rejected carrying that rejection unchanged and nothing is created. The capability policy SHALL be able to report creation as unavailable with a reason, in which case every creation command reports that reason before any delegation and no ID is minted.

#### Scenario: Duplicate under a delegating adapter
- **WHEN** two connected nodes are duplicated through an adapter whose nodes are named by the host
- **THEN** the host receives one create-fragment intent holding two nodes and their connection by fragment-local keys, and the read model is unchanged until it answers

#### Scenario: Invalid fragment is not delegated
- **WHEN** a pasted fragment references a port that does not exist, or exceeds the fragment size limits
- **THEN** the command is rejected with a structured rejection and the host is not called

#### Scenario: Host cannot paste
- **WHEN** the host answers that a fragment cannot be created
- **THEN** the command settles as rejected with the host's rejection, its message unchanged, and nothing is created

#### Scenario: Creation forbidden
- **WHEN** the capability policy forbids creation with a reason and a paste is attempted
- **THEN** the paste reports that rejection, nothing is submitted, and no ID is minted

### Requirement: Client-issued connection IDs
The ID generator SHALL be able to return IDs supplied by the host for connections. When the host accepts a connect edit and a later pushed snapshot holds a connection with the same ID, the snapshot diff SHALL be empty for that connection, so its selection and any gesture on it SHALL survive.

#### Scenario: Same ID in the refresh
- **WHEN** a connection created with a host-supplied ID is selected, the host accepts the edit and pushes a snapshot with that connection
- **THEN** no operation is produced for it, it stays selected, and a gesture on it continues

### Requirement: Globally unique IDs for a host-owned document
A model whose document is owned by a host through the snapshot adapter SHALL be created with an ID generator supplied by the host, and the library SHALL NOT fall back to its default generator there. The default generator is a counter per document with a type prefix (`c1`, `c2`, ...), unique only within one model, so two clients writing one host document would issue the same connection ID. Creating the snapshot model without a generator SHALL be a type error and, from untyped code, SHALL throw a misuse error. The local adapter SHALL keep its default generator.

#### Scenario: No generator given
- **WHEN** untyped code creates a snapshot model without an ID generator
- **THEN** creation throws a misuse error and no model exists

#### Scenario: Two clients create connections
- **WHEN** two snapshot models on one host document each use a generator that prefixes a per-client token, and each user draws a first connection
- **THEN** the two connection IDs differ, and after the host accepts both and pushes one snapshot, each client shows both connections with their own IDs

### Requirement: Conflicts on client-named connections
The snapshot adapter SHALL always keep the ID the client issued for a connection and SHALL NOT pair or rename connections by kind and endpoints. When the host answers a connect edit with a rejection because the two ports are already connected, the rejection SHALL be carried unchanged (the host is expected to use the code `duplicate-connection`), and when it answers that the ID is already used by another entity, the rejection SHALL have the code `connection-id-claimed`. Either rejection, including one that follows an accepted validator verdict, SHALL roll the local connection back like any rejected edit: the display is recomputed without it in one event, a failure event carries the host's `rejection`, its selection is dropped, and a gesture on it is cancelled with reason `entity-removed`, as for any removed entity. The library SHALL NOT resubmit the edit.

#### Scenario: Pair already connected
- **WHEN** the validator accepts a connection from A to B and the host then rejects the edit because A and B are already connected
- **THEN** the connection leaves the display, one failure event carries the host's rejection, and nothing is resubmitted

#### Scenario: ID claimed
- **WHEN** the host answers a connect edit with the ID already used by another entity
- **THEN** the edit settles rejected with the code `connection-id-claimed` and the local connection is rolled back

#### Scenario: Backend ID in the refresh is a different connection
- **WHEN** the pushed snapshot holds the user's new connection under another ID and not under the local ID
- **THEN** the diff removes the local connection and adds the snapshot one, and a gesture on the local one is cancelled with reason `entity-removed`

### Requirement: Revisioned snapshot push
A snapshot push MAY carry a revision token of the host's own, of any type. This token is separate from the library's integer revision, which only the changes a push applies advance. The adapter SHALL ignore a push whose token is older than the last applied one, emit no event, and report that it was ignored as stale. A push with an equal or newer token, or without one, SHALL be applied. The comparison SHALL default to numeric order and SHALL be replaceable by the host.

#### Scenario: Older snapshot is ignored
- **WHEN** a snapshot with revision 5 is pushed, then one with revision 3
- **THEN** the second changes nothing, emits no event and reports stale, and the state is that of revision 5

#### Scenario: Host comparison
- **WHEN** the host supplies its own comparison for non-numeric revisions
- **THEN** the adapter uses it to decide whether a push is stale

### Requirement: Conflict reporting
When a pending edit is marked conflicted, the adapter SHALL log it and publish one conflict event carrying the operation ID, the reason and the IDs of the entities involved, and SHALL list the edit as conflicted until the host settles it. A conflict SHALL NOT change the displayed state beyond dropping the edit.

#### Scenario: Target removed by a refresh
- **WHEN** a move of node A is pending and the pushed snapshot omits A
- **THEN** one conflict event names the operation and node A, and the edit is listed as conflicted

### Requirement: Unconfirmed flag per entity
The view state SHALL tell painters, for each node, port and connection, whether it is unconfirmed: a pending edit or placeholder touches it and the host has not yet confirmed it. The library SHALL NOT ship a visual treatment for it.

#### Scenario: Unconfirmed node
- **WHEN** a move of node A is pending
- **THEN** the view state reports A as unconfirmed, other nodes as confirmed, and A as confirmed after the host accepts the edit

### Requirement: Settling edits
Every pending edit SHALL be in one of the states pending, conflicted or unknown, and every answer from the host (the promise returned by the callback, or a later `settle` call) SHALL be handled by one table. Accepted: a pending or unknown edit leaves the pending layer and its patch is applied to confirmed state; a conflicted edit leaves the pending layer and nothing is displayed or confirmed (its effect is expected in the next push). Rejected: a pending or unknown edit leaves the pending layer, the displayed state is recomputed from confirmed state plus the remaining pending edits in one external change, and a failure event carries the rejection; a conflicted edit leaves the pending layer with a failure event and no display change. Unknown: a pending edit becomes unknown and resynchronization is requested; any other state is unchanged. An answer for an operation that is unknown or already settled, a second answer for an entry that already has one, and an unknown answer for an already unknown edit SHALL be logged and have no effect, and `settle` SHALL report that nothing was settled. A host answer SHALL be one of accepted, rejected with a rejection (code, message and entity IDs), or unknown with a plain-text reason. Replacing the document (`loadSnapshot`, `replaceDocument`) SHALL settle every pending edit and placeholder as rejected with the rejection code `document-replaced`, without rollback and without failure events. Disposing the adapter SHALL settle every deferred result as rejected with the rejection code `disposed` and publish no events. Answers and settle calls made from inside an event handler SHALL be applied after the current dispatch.

#### Scenario: Duplicate answer
- **WHEN** the callback's promise resolves accepted and the host then calls `settle` for the same operation
- **THEN** the second call changes nothing, is logged, and reports that nothing was settled

#### Scenario: Unknown operation
- **WHEN** the host settles an operation ID the adapter never issued
- **THEN** nothing changes and the call reports that nothing was settled

#### Scenario: Accepting a conflicted edit
- **WHEN** an edit marked conflicted is settled as accepted
- **THEN** it leaves the pending layer and the displayed state is unchanged

#### Scenario: Document replaced while edits are pending
- **WHEN** `loadSnapshot` is called while two edits and a placeholder are pending
- **THEN** all three settle as rejected with code `document-replaced`, the displayed state is the loaded document, and no failure event is published

#### Scenario: Dispose with unsettled results
- **WHEN** the adapter is disposed while a deferred result is unsettled
- **THEN** that result settles as rejected with code `disposed` and no event is published
