## ADDED Requirements

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
