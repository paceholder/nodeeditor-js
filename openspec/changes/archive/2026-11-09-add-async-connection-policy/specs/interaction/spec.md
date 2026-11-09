## ADDED Requirements

### Requirement: Pending target resolution
While the connect tool's candidate target is pending, the target SHALL show the pending state, distinct from compatible, incompatible and choice-required and not color alone, and the gesture SHALL stay responsive: the preview follows the pointer and cancellation works. A release on a pending target SHALL keep the preview at the release point and commit nothing until the verdict arrives; an accepted verdict SHALL then submit one connect command, revalidated at commit, and a rejected, failed or timed-out verdict SHALL commit nothing, clear the preview and deliver the rejection as a `connection-rejected` event. Escape, a new press outside overlay content, disposal, locking the view, and the cancellations of the rule that gestures react to changes of the entities they involve (a reset, or removal of the source or target port) SHALL cancel the wait, abort the validator request, ignore a later verdict for it, and commit nothing. A cancelled wait SHALL NOT delay the next gesture: a new press cancels the waiting gesture and then starts normally. Validation SHALL NOT make a submitted edit cancellable because nothing is submitted while waiting.

A connection alternative picked through the host chooser SHALL be judged the same way: when it lacks a verdict, the target SHALL show pending and the choice SHALL wait, committing one connect when the verdict is accepted and delivering a `connection-rejected` event otherwise. The wait SHALL end with nothing committed, and its validator request SHALL be aborted, on every cancellation above, and, as for a gesture, when a node or port of the picked connection is removed or is changed by a change with origin `external`; the view SHALL then emit a `gesture-cancelled` event carrying the reason and the entity IDs. A change committed by the choice itself SHALL NOT cancel it.

#### Scenario: Picked alternative judged by the validator
- **WHEN** the host chooser picks an alternative and the validator then accepts it
- **THEN** exactly one connect command of the picked kind is submitted; if the validator rejects it, nothing is committed and a `connection-rejected` event carries the reason; Escape during the wait commits nothing and aborts the request

#### Scenario: Picked alternative waiting while an involved entity changes
- **WHEN** the picked alternative waits for its verdict and an external change updates one of its nodes, or any change removes one of its ports
- **THEN** the wait is cancelled, the request is aborted, nothing is committed, a `gesture-cancelled` event names the reason and the entities, and a verdict that arrives later has no effect; a change of an unrelated node leaves the wait running

#### Scenario: Pending shown during drag
- **WHEN** the drag hovers a target whose verdict is unknown
- **THEN** the target shows the pending cue, a later accepted verdict changes it to compatible without the pointer moving, and pan and zoom stay usable

#### Scenario: Release on a pending target, then accepted
- **WHEN** the user releases on a pending target and the validator then accepts
- **THEN** exactly one connect command is submitted and the history gains one entry

#### Scenario: Release on a pending target, then rejected
- **WHEN** the user releases on a pending target and the validator then rejects
- **THEN** nothing is committed, the preview is cleared and a `connection-rejected` event carries the reason

#### Scenario: Escape while waiting
- **WHEN** a release is waiting for a verdict and the user presses Escape
- **THEN** the request is aborted, nothing is committed, and a later verdict has no effect

#### Scenario: New press while waiting
- **WHEN** a release is waiting and the user presses on another port
- **THEN** the waiting gesture is cancelled and a new connect gesture starts from the pressed port

#### Scenario: Target removed while waiting
- **WHEN** an external change removes the target port's node during the wait
- **THEN** the wait is cancelled, the request is aborted and nothing is committed

#### Scenario: Locked while waiting
- **WHEN** a release is waiting for a verdict and the view is locked
- **THEN** the wait is cancelled, the request is aborted, a `gesture-cancelled` event states the lock, and a verdict that arrives later has no effect

### Requirement: Gestures react to changes of the entities they involve
A tool SHALL be able to declare, for the state of a running gesture, the nodes, ports and connections the gesture reads or will write. When an entity so declared is removed, from any origin, the view SHALL cancel the gesture. When one is changed by a change with origin `external`, the view SHALL cancel it too. A change that does not touch the declared entities SHALL leave the gesture running, its preview unaffected. A change committed by the gesture itself SHALL NOT cancel it. A cancelled gesture SHALL submit nothing, and the view SHALL emit a `gesture-cancelled` event carrying the reason and the entity IDs, so a host can tell the user. A reset SHALL cancel every gesture.

#### Scenario: Unrelated change during a drag
- **WHEN** node A is being dragged and an external change renames node B
- **THEN** the drag continues and releasing it submits one move of A

#### Scenario: Dragged node removed
- **WHEN** node A is being dragged and a change from any origin removes A
- **THEN** the drag is cancelled, nothing is submitted, and a `gesture-cancelled` event names A and the removal

#### Scenario: Involved entity changed externally
- **WHEN** a resize of node A is in progress and an external change updates A's size
- **THEN** the resize is cancelled with a reason that names the external change

#### Scenario: Pan and marquee involve nothing
- **WHEN** a pan or a marquee is in progress and an external change removes a node
- **THEN** the gesture continues
