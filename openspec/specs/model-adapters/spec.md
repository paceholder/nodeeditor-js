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
Submitted but unconfirmed edits SHALL live in a pending layer separate from confirmed state. Each edit SHALL be in one of the states local preview, pending, accepted, rejected, or unknown outcome, and a pending edit SHALL be visually distinguishable from confirmed state.

#### Scenario: Optimistic display
- **WHEN** a rotate edit is submitted to an external adapter
- **THEN** the node shows the rotation immediately, marked pending, while the confirmed read model is unchanged

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
Cached per-frame validation SHALL be separate from authoritative commit validation. Asynchronous validation results SHALL carry the candidate, signature, and revision they apply to and SHALL NOT approve a different or superseded candidate.

#### Scenario: Late validation result
- **WHEN** an async validation result arrives for a candidate the user has already moved away from
- **THEN** the result is discarded and the current candidate stays pending

### Requirement: Responsiveness during slow host work
While host work is pending, unrelated view operations and cancellation of unsubmitted gestures SHALL remain usable. Conflicting edits on the same entities SHALL be serialized or rejected according to a documented policy.

#### Scenario: Conflicting edit while pending
- **WHEN** a move of node A is pending and the user starts a second move of A
- **THEN** the library applies the documented policy (queue behind the first or reject) and pan remains available

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
