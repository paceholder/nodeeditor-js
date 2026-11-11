# patches-and-history Specification

## Purpose

Defines how edits are expressed and applied: the patch as the core change primitive, commands
as planners that produce patches, Result-object outcomes, typed events, and local undo/redo
built on inverse patches.

## Requirements

### Requirement: Patch as the core change primitive
Every model change SHALL be expressible as a patch: an ordered list of operations, each an add, remove, or update of one node, port, connection, group, or view record. Update operations SHALL carry both the previous and the new value of every changed field.

#### Scenario: Move expressed as update
- **WHEN** a node is moved from (0, 0) to (40, 20)
- **THEN** the resulting patch contains one update operation for that node with old position (0, 0) and new position (40, 20)

#### Scenario: Patch is plain data
- **WHEN** a patch produced by any command is passed through JSON stringify and parse
- **THEN** the parsed patch is equal to the original and can be applied with the same result

### Requirement: Atomic patch application
Applying a patch SHALL validate every operation against the current state before changing anything. Either all operations take effect, or none do and a structured rejection is returned.

#### Scenario: One invalid operation rejects the whole patch
- **WHEN** a patch adds two nodes and a connection to a port that does not exist
- **THEN** the result is a rejection naming the missing port and neither node is added

#### Scenario: Stale old value rejected
- **WHEN** an update operation's old value does not match the entity's current value
- **THEN** the patch is rejected with a conflict code and the model is unchanged

### Requirement: Inverse patches
For every applied patch the library SHALL be able to produce an inverse patch that, applied immediately afterwards, restores the exact prior state including IDs, payloads, endpoints, ordering, and view constraints.

#### Scenario: Round trip through inverse
- **WHEN** a patch deleting a node with two connections is applied and then its inverse is applied
- **THEN** the model snapshot equals the snapshot taken before the first patch

### Requirement: Commands are planners
Commands SHALL be plain-data descriptions of user intent (for example create node, delete selection, connect, move). A command SHALL be planned against current state into a complete patch, including derived effects such as removing incident connections or allocating new IDs, before anything is applied.

#### Scenario: Delete node plans incident removals
- **WHEN** a delete-node command is planned for a node with three incident connections
- **THEN** the planned patch removes the three connections and the node, and nothing is applied until the patch is submitted

#### Scenario: Plan can be inspected without applying
- **WHEN** a caller plans a command and discards the plan
- **THEN** the model, its history, and its ID high-water mark are unchanged

### Requirement: Convenience methods
The library SHALL offer convenience methods for common edits (for example connecting two ports or moving nodes) that build the corresponding command, plan it, and submit it. They SHALL return the same result as submitting the command explicitly.

#### Scenario: Method and command are equivalent
- **WHEN** two fresh models receive the same connect edit, one via the convenience method and one via an explicit command
- **THEN** both return equal results and their snapshots are identical

### Requirement: Tagged edits with structured results
Every submitted edit SHALL carry an operation ID and a base revision. The outcome SHALL be a Result object: on success it lists the accepted revision and the changed entity IDs; on failure it carries a rejection with code, message, and affected entity IDs. Policy and validation failures SHALL NOT be thrown as exceptions.

#### Scenario: Accepted edit result
- **WHEN** a connect command is accepted
- **THEN** the result is ok and lists the new connection ID and both endpoint node IDs as changed

#### Scenario: Rejected edit result
- **WHEN** a connect command violates the connection policy
- **THEN** the result is not ok, carries the policy's reason code, and no exception is thrown

### Requirement: Exceptions only for misuse
The library SHALL throw only for programmer misuse such as calling a disposed instance or passing a value that is not a command; all expected failures SHALL be reported as Result objects.

#### Scenario: Disposed instance
- **WHEN** a command is submitted to a disposed model
- **THEN** the call throws a misuse error

### Requirement: Local undo and redo
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

### Requirement: One history entry per gesture
Previews during a gesture SHALL NOT create history entries or submit edits; a completed gesture SHALL submit exactly one patch (see the one committed edit per gesture rule in the interaction capability).

#### Scenario: Drag produces one submission
- **WHEN** a node is dragged across 200 pointer-move events and released
- **THEN** exactly one patch is submitted and at most one history entry is added

### Requirement: History availability through the command contract
Undo and redo SHALL be exposed as commands with availability queries and human-readable descriptions, whether history is local or owned by the host.

#### Scenario: Availability query
- **WHEN** the history is empty
- **THEN** the undo command reports unavailable with a reason and submitting it returns a rejection

### Requirement: Typed events
The library SHALL publish typed events for committed changes (carrying the applied patch), selection, viewport, hover, diagnostics, and failures. Committed-change events SHALL be delivered in commit order.

#### Scenario: Change event carries the patch
- **WHEN** a subscriber listens for committed changes and a node is added
- **THEN** it receives one event whose patch contains the add operation and the new revision

### Requirement: Reentrancy contract
Event handlers SHALL NOT observe a half-applied patch. An edit submitted from inside an event handler SHALL be queued and applied after the current dispatch completes, and its events SHALL follow the current ones in order.

#### Scenario: Edit from inside a handler
- **WHEN** a change handler submits another edit while handling a committed change
- **THEN** every handler receives the first event before any handler receives the second

#### Scenario: Handler error isolation
- **WHEN** one change handler throws
- **THEN** the committed change stays applied, other handlers still receive the event, and a failure event is published

### Requirement: A queued edit's events precede the next queued edit
An edit submitted from inside an event handler is queued and applied after the current dispatch. When several edits are queued, each one's events (its committed change and any history change) SHALL be delivered to every handler before the next queued edit is applied, so a handler never sees the model already holding a later queued edit while it handles an earlier one.

#### Scenario: Two edits queued from one handler
- **WHEN** a change handler submits edit B and then edit C, and another change handler reads the model while handling B's change event
- **THEN** that handler sees B applied and C not yet applied

### Requirement: Planning sees every registered validator
A validator is a function that may refuse a patch before it commits; the model registers its own (capabilities, connection policy) and a host adds more with `addValidator`. Planning a command (`plan`) and asking whether it is available (`can`) SHALL run the same validators that a commit runs, including those added or removed after the model was created.

#### Scenario: A host validator refuses everything
- **WHEN** a host adds a validator that refuses every patch and asks whether a node can be created
- **THEN** `can` reports unavailable with the validator's reason, `plan` reports rejected, and `execute` is rejected

### Requirement: Commands issued from inside a handler get distinct IDs
A command that creates entities draws fresh IDs from the ID generator. Two commands executed one after the other from inside an event handler, whose submits are therefore queued, SHALL plan with distinct IDs, as if the first had already committed.

#### Scenario: Two creates from one change handler
- **WHEN** a change handler executes two node-create commands
- **THEN** both queued results settle as accepted with different node IDs

### Requirement: A rejected undo or redo does not block history
Undo applies the top undo entry's inverse patch and redo re-applies the top redo entry's patch; both are judged by the same checks as any local edit, including capabilities. When an undo (or redo) is rejected, the failed entry and every entry under it on the undo (or redo) stack SHALL be dropped, a history change SHALL be published, and the history state SHALL report the reason the steps were dropped. The other stack SHALL be kept.

#### Scenario: Undo after an edit that skipped history
- **WHEN** a recorded move of a node is followed by a move of the same node that skips history, and undo is requested
- **THEN** undo is rejected with `conflict`, `canUndo` becomes false with a reason, and a further undo reports nothing to undo

#### Scenario: Undo of a lock
- **WHEN** a recorded patch sets a node's override to `edit: false` and undo is requested
- **THEN** undo is rejected with `capability-denied`, the entry is dropped and `canUndo` reports the reason

### Requirement: Queued undo and redo report their own operation ID
An undo or redo requested from inside an event handler is queued. The operation ID returned with the queued result SHALL be the one its settled result and its change event carry.

#### Scenario: Undo queued from a handler
- **WHEN** a change handler requests undo and the queued undo is later applied
- **THEN** the queued result, the settled result and the change event carry the same operation ID

### Requirement: Local history size limit
The local history SHALL accept an optional limit on the number of undo entries. When recording an entry would exceed it, the oldest entry SHALL be dropped. Without a limit the history keeps every entry.

#### Scenario: Limit of two
- **WHEN** a model with a history limit of 2 records three edits and undo is requested three times
- **THEN** the first two undos are accepted and the third reports nothing to undo

### Requirement: One field name for refusals
A refusal is a structured description (code, message, entity IDs) of why an edit, a command or an input was refused, or a list of them for whole-document validation. Every returned or emitted value that reports a refusal SHALL carry it in a field named `rejection`: result objects, edit and plan outcomes, command availability, policy outcomes, host verdicts, model and view events and the React command hook.

#### Scenario: Rejected edit
- **WHEN** a submitted edit is refused
- **THEN** the outcome has `ok: false` and a `rejection` field with the code, message and entity IDs, and no `error` or `reason` field

#### Scenario: Unavailable command
- **WHEN** a command is checked for availability and cannot run
- **THEN** the answer has `available: false` and a `rejection` field

#### Scenario: Policy refusal
- **WHEN** the connection policy refuses a proposal
- **THEN** its outcome has kind `reject` and a `rejection` field

### Requirement: Reason and error are not refusals
A field named `reason` SHALL hold only a plain-text explanation or an enumerated cause of a state that is not a refusal, such as an edit whose outcome is unknown or a connection still waiting for validation. A field named `error` SHALL hold only a value thrown by host code and caught by the library.

#### Scenario: Waiting for validation
- **WHEN** a connect command runs while the host verdict is missing
- **THEN** the result has status `unverified` and a plain-text `reason`

#### Scenario: Throwing handler
- **WHEN** an event handler throws
- **THEN** the failure event carries the thrown value in `error`
