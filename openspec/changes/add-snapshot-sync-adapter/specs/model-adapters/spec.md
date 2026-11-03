## ADDED Requirements

### Requirement: ADP-05a Snapshot adapter edit flow
The library SHALL provide an external adapter for snapshot mode. A submitted edit SHALL show in the displayed read model at once, go to a host callback with its operation ID, base revision and patch, and settle as accepted, rejected or unknown outcome from the host's answer. `submit` SHALL return a deferred result (MOD-02, TXN-01).

#### Scenario: Optimistic edit then acceptance
- **WHEN** a move is submitted and the host callback has not answered
- **THEN** the displayed state shows the new position, the edit is pending, and the confirmed state still holds the old position

#### Scenario: Acceptance retires the edit
- **WHEN** the host answers that the move is accepted
- **THEN** the edit leaves the pending layer, its patch becomes confirmed state, and no second change event is emitted for it

#### Scenario: Rejection rolls back
- **WHEN** the host answers that a pending move is rejected
- **THEN** the displayed state returns to the confirmed position in one change event and a failure event carries the host's rejection (TXN-02)

### Requirement: ADP-05b Snapshot push is an incremental external change
Pushing a snapshot SHALL validate it with the shared validator (SNP-02), diff it against confirmed state (SNP-04) and apply the result as one committed change with origin `external`. It SHALL NOT clear history, SHALL NOT emit `reset`, and SHALL NOT add an undo entry (TXN-09). An invalid snapshot SHALL return a structured error and leave all state, including pending edits, unchanged. A push whose diff is empty SHALL emit no change event.

#### Scenario: Refresh without side effects
- **WHEN** a node is selected, history has two entries, and the host pushes a snapshot that changes only another node's title
- **THEN** one change event with a single update is published, the selection and both history entries are unchanged, and no reset event is published

#### Scenario: Unchanged refresh is silent
- **WHEN** the host pushes a snapshot equal to the confirmed state
- **THEN** no change event is published

#### Scenario: Invalid push
- **WHEN** the host pushes a snapshot with a connection to a missing port
- **THEN** the push returns a structured error naming the connection and the read model and pending edits are unchanged

### Requirement: ADP-05c Pending edits rebase on a push
After a push the displayed state SHALL be the new confirmed state plus the pending patches that still apply, in submission order, produced as the single change of that push (ADP-03). A pending edit that no longer applies SHALL be marked conflicted, SHALL NOT affect the displayed state, and SHALL stay listed until the host settles it. A pending edit an incoming snapshot already contains SHALL NOT be applied twice (TXN-03 in snapshot mode).

#### Scenario: Push during a pending move
- **WHEN** a move of node A is pending and a pushed snapshot renames node B
- **THEN** the displayed state has B renamed and A at its pending position, in one change event

#### Scenario: Push that already contains the edit
- **WHEN** a move of A is pending and the pushed snapshot already holds A at the pending position
- **THEN** the displayed state is unchanged, no change event is published for A, and the edit is still settled by the host's answer

#### Scenario: Push deletes the target of a pending edit
- **WHEN** a move of A is pending and the pushed snapshot omits A
- **THEN** A disappears from the displayed state and the move is reported as conflicted

### Requirement: ADP-05d Gestures survive unrelated pushes
A snapshot push SHALL NOT cancel an active gesture unless the push changes or removes an entity the gesture involves. Each tool SHALL declare the entities its gesture involves. When a push does touch them the gesture SHALL be cancelled with a reason naming the entities, and the view SHALL publish an event with that reason so the host can inform the user (TXN-09, INT-08).

#### Scenario: Unrelated refresh during a drag
- **WHEN** node A is being dragged and a push changes only node B
- **THEN** the drag continues, its preview is unaffected, and releasing it submits one move of A

#### Scenario: Dragged node removed
- **WHEN** node A is being dragged and a push removes A
- **THEN** the drag is cancelled, nothing is submitted, and a cancel event states that A was removed externally

#### Scenario: Viewport and selection survive
- **WHEN** a push arrives while the user has panned and selected nodes that the push does not remove
- **THEN** viewport and selection are unchanged

### Requirement: ADP-05e Unknown outcome and resynchronization
When the host reports that an edit's outcome is unknown, or an optional configured timeout elapses without an answer, the adapter SHALL mark the edit unknown outcome, keep it visible and listed, NOT resubmit it, and publish an event requesting resynchronization. A later valid push SHALL rebase the unknown edit by ADP-05c; the host SHALL then settle it explicitly. The adapter declares no deduplication (TXN-04).

#### Scenario: Lost acknowledgment
- **WHEN** the host callback reports an unknown outcome for a pending move
- **THEN** the edit's state is unknown, the callback is not called again for it, and a resync-requested event is published

#### Scenario: Resolution after resync
- **WHEN** a resync push contains the moved position and the host then settles the edit as accepted
- **THEN** the edit leaves the pending layer and the displayed state is unchanged

### Requirement: ADP-05f Host-owned history in snapshot mode
A snapshot adapter SHALL support `history: "host"`, in which no local undo stack exists. Undo and redo SHALL call host callbacks, be reported pending until settled, and their effect SHALL arrive as an ordinary push. Availability and labels SHALL come from a host provider through the same history state as local history. In `history: "local"` the adapter SHALL keep a local stack of its own accepted edits, excluding external pushes (TXN-08, PAT-08, TXN-09).

#### Scenario: Undo forwarded
- **WHEN** the user invokes undo under host-owned history
- **THEN** the host undo callback is called once, the command is pending, and no local patch is applied

#### Scenario: Availability from the host
- **WHEN** the host provider reports undo unavailable with a reason
- **THEN** the history state and the undo command report unavailable with that reason

#### Scenario: Pushes are not undo entries
- **WHEN** under local history a push changes a node and the user then undoes
- **THEN** the undo reverts the user's last edit and the pushed change stays

### Requirement: ADP-08 Submission intent decoding
The library SHALL provide a pure decoder from a submission and the read model before it to a list of named intents: move, resize, rotate, mirror, create node, delete (nodes and connections), connect, disconnect, reconnect, and a catch-all for operations it cannot name. Every operation of the patch SHALL appear in exactly one intent. A gesture that changes several nodes SHALL decode to one intent carrying all of them (INT-08, PAT-07).

#### Scenario: Multi-select move is one intent
- **WHEN** a submission moves three nodes by the same delta
- **THEN** the decoder returns one move intent listing the three nodes with their old and new positions

#### Scenario: Delete includes incident connections
- **WHEN** a submission removes a node and its two connections
- **THEN** the decoder returns one delete intent naming the node and both connections

#### Scenario: Reconnect
- **WHEN** a submission removes a connection and adds one that shares one endpoint port with it
- **THEN** the decoder returns a reconnect intent naming the old connection and the new endpoints

#### Scenario: Nothing is dropped
- **WHEN** a submission holds an operation the decoder has no name for
- **THEN** that operation appears in a catch-all intent and the count of decoded operations equals the patch's

### Requirement: ADP-09 Store-wrapping recipe
The library documentation and a runnable headless example SHALL show how a host with its own store (for example two lists, nodes and connections, or a remote service) plugs in the snapshot adapter: converting its documents to snapshots, mapping a decoded submission to store calls, answering the adapter, pushing a refreshed snapshot, and what `plan` and `execute` return in each outcome. The example SHALL run in Node and be exercised by a test (MOD-02).

#### Scenario: Example runs headless
- **WHEN** the example's test creates the store, edits through the model and refreshes
- **THEN** it observes an optimistic edit, a store call, a settled edit and a refresh that produces no further change

#### Scenario: Host keeps its own format
- **WHEN** the example store is inspected after edits
- **THEN** it holds only its own list format and no library document
