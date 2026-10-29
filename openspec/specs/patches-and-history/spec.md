# patches-and-history Specification

## Purpose

Defines how edits are expressed and applied: the patch as the core change primitive, commands
as planners that produce patches, Result-object outcomes, typed events, and local undo/redo
built on inverse patches.

## Requirements

### Requirement: PAT-01 Patch as the core change primitive
Every model change SHALL be expressible as a patch: an ordered list of operations, each an add, remove, or update of one node, port, connection, group, or view record. Update operations SHALL carry both the previous and the new value of every changed field.

#### Scenario: Move expressed as update
- **WHEN** a node is moved from (0, 0) to (40, 20)
- **THEN** the resulting patch contains one update operation for that node with old position (0, 0) and new position (40, 20)

#### Scenario: Patch is plain data
- **WHEN** a patch produced by any command is passed through JSON stringify and parse
- **THEN** the parsed patch is equal to the original and can be applied with the same result

### Requirement: PAT-02 Atomic patch application
Applying a patch SHALL validate every operation against the current state before changing anything. Either all operations take effect, or none do and a structured rejection is returned (TXN-01).

#### Scenario: One invalid operation rejects the whole patch
- **WHEN** a patch adds two nodes and a connection to a port that does not exist
- **THEN** the result is a rejection naming the missing port and neither node is added

#### Scenario: Stale old value rejected
- **WHEN** an update operation's old value does not match the entity's current value
- **THEN** the patch is rejected with a conflict code and the model is unchanged

### Requirement: PAT-03 Inverse patches
For every applied patch the library SHALL be able to produce an inverse patch that, applied immediately afterwards, restores the exact prior state including IDs, payloads, endpoints, ordering, and view constraints.

#### Scenario: Round trip through inverse
- **WHEN** a patch deleting a node with two connections is applied and then its inverse is applied
- **THEN** the model snapshot equals the snapshot taken before the first patch

### Requirement: PAT-04 Commands are planners
Commands SHALL be plain-data descriptions of user intent (for example create node, delete selection, connect, move). A command SHALL be planned against current state into a complete patch, including derived effects such as removing incident connections or allocating new IDs, before anything is applied.

#### Scenario: Delete node plans incident removals
- **WHEN** a delete-node command is planned for a node with three incident connections
- **THEN** the planned patch removes the three connections and the node, and nothing is applied until the patch is submitted

#### Scenario: Plan can be inspected without applying
- **WHEN** a caller plans a command and discards the plan
- **THEN** the model, its history, and its ID high-water mark are unchanged

### Requirement: PAT-05 Convenience methods
The library SHALL offer convenience methods for common edits (for example connecting two ports or moving nodes) that build the corresponding command, plan it, and submit it. They SHALL return the same result as submitting the command explicitly.

#### Scenario: Method and command are equivalent
- **WHEN** two fresh models receive the same connect edit, one via the convenience method and one via an explicit command
- **THEN** both return equal results and their snapshots are identical

### Requirement: TXN-01 Tagged edits with structured results
Every submitted edit SHALL carry an operation ID and a base revision. The outcome SHALL be a Result object: on success it lists the accepted revision and the changed entity IDs; on failure it carries a rejection with code, message, and affected entity IDs. Policy and validation failures SHALL NOT be thrown as exceptions.

#### Scenario: Accepted edit result
- **WHEN** a connect command is accepted
- **THEN** the result is ok and lists the new connection ID and both endpoint node IDs as changed

#### Scenario: Rejected edit result
- **WHEN** a connect command violates the connection policy
- **THEN** the result is not ok, carries the policy's reason code, and no exception is thrown

### Requirement: PAT-06 Exceptions only for misuse
The library SHALL throw only for programmer misuse such as calling a disposed instance or passing a value that is not a command; all expected failures SHALL be reported as Result objects.

#### Scenario: Disposed instance
- **WHEN** a command is submitted to a disposed model
- **THEN** the call throws a misuse error

### Requirement: TXN-07 Local undo and redo
The local history SHALL record one undo group per completed gesture or assembly, undo by applying the group's inverse patch, invalidate redo after a new local edit, and restore affected IDs, payloads, endpoints, and view constraints exactly.

#### Scenario: One gesture, one undo step
- **WHEN** a user drags three selected nodes and releases, then undoes once
- **THEN** all three nodes return to their start positions

#### Scenario: Redo invalidated by new edit
- **WHEN** an edit is undone and a different edit is then applied
- **THEN** redo is unavailable

#### Scenario: Undo of a deletion restores identity
- **WHEN** a deletion of a node with connections is undone
- **THEN** the node and connections reappear with their original IDs and route constraints

### Requirement: PAT-07 One history entry per gesture
Previews during a gesture SHALL NOT create history entries or submit edits; a completed gesture SHALL submit exactly one patch (see INT-08 in the interaction capability).

#### Scenario: Drag produces one submission
- **WHEN** a node is dragged across 200 pointer-move events and released
- **THEN** exactly one patch is submitted and at most one history entry is added

### Requirement: PAT-08 History availability through the command contract
Undo and redo SHALL be exposed as commands with availability queries and human-readable descriptions, whether history is local or owned by the host (TXN-08).

#### Scenario: Availability query
- **WHEN** the history is empty
- **THEN** the undo command reports unavailable with a reason and submitting it returns a rejection

### Requirement: TXN-10 Typed events
The library SHALL publish typed events for committed changes (carrying the applied patch), selection, viewport, hover, diagnostics, and failures. Committed-change events SHALL be delivered in commit order.

#### Scenario: Change event carries the patch
- **WHEN** a subscriber listens for committed changes and a node is added
- **THEN** it receives one event whose patch contains the add operation and the new revision

### Requirement: TXN-10a Reentrancy contract
Event handlers SHALL NOT observe a half-applied patch. An edit submitted from inside an event handler SHALL be queued and applied after the current dispatch completes, and its events SHALL follow the current ones in order.

#### Scenario: Edit from inside a handler
- **WHEN** a change handler submits another edit while handling a committed change
- **THEN** every handler receives the first event before any handler receives the second

#### Scenario: Handler error isolation
- **WHEN** one change handler throws
- **THEN** the committed change stays applied, other handlers still receive the event, and a failure event is published
