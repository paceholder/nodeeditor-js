## ADDED Requirements

### Requirement: Endpoint reconnection gesture
A selected connection SHALL show a grip at each endpoint with a capture radius specified in CSS pixels and a distinct cursor. Pressing a grip, without Alt held, and dragging past the drag threshold SHALL start a reconnect of that end; with Alt held the press SHALL be handled by the connect tool, so a new connection can start from the port the grip sits on: the stored connection SHALL stay unchanged and visible while a provisional path from the fixed end follows the pointer and snaps to the nearest candidate port using the existing deterministic candidate order. Candidate ports SHALL show the target states of the distinct target states rule, evaluated by the policy with the connection being moved passed as replaced, so occupancy and duplicate checks ignore it. Releasing on a compatible port SHALL submit one `reconnect` command that keeps the connection ID and kind semantics of the rule that connection identity is independent of presentation, and the gesture SHALL produce one history entry. Parallel connections SHALL be reconnectable independently. A press below the drag threshold SHALL behave as a click on the connection.

#### Scenario: Reconnect to a valid port
- **WHEN** the user drags the target-end grip of a selected connection and releases on a compatible, free port of another node
- **THEN** one `reconnect` command is submitted, the connection keeps its ID, its target is the new port, and one undo restores the old target

#### Scenario: Port occupied only by the moved connection
- **WHEN** the user drags the end of a connection toward the port it is already attached to, whose limit is one
- **THEN** the port is shown as compatible, not occupied, because the connection being moved is ignored

#### Scenario: Reconnect to an invalid port
- **WHEN** the user releases on an incompatible port
- **THEN** nothing is committed, the original connection is kept, before release the port showed the incompatible state with the rejection's message, and the `connection-rejected` event carries the rejection

#### Scenario: Parallel connections
- **WHEN** two parallel connections join the same port pair and the user reconnects one of them
- **THEN** only that connection changes and both keep their IDs

#### Scenario: Click on a grip
- **WHEN** the user presses and releases a grip without exceeding the drag threshold
- **THEN** no reconnect starts and the press is handled as a click on the connection

### Requirement: Reconnect release and cancellation
Releasing on empty space SHALL cancel the reconnect and keep the connection (the default), or delete the connection when the host option `onEmptyDrop` is `delete`; a delete SHALL be one history entry and subject to the delete capability. Escape, pointercancel, lost capture, window blur, a hidden or unmounted view, locking the view, a pointer move that arrives without the button that started the gesture, a context menu before the drag threshold and a second touch SHALL cancel it, and so SHALL any committed change, from any origin (local edit, undo, redo or external), that removes or changes an entity this gesture involves: the connection, its fixed end port and that port's node, and while a verdict is awaited also the target port and its node. The `gesture-cancelled` event SHALL name the reason (`entity-removed`, `external-change` or `entity-changed` for a change). The gesture's own commit SHALL NOT cancel it. A cancelled gesture SHALL discard the provisional path and submit nothing. A `reconnect` command rejected at commit SHALL leave the original connection unchanged and emit the rejection as a `connection-rejected` event. A policy choice outcome for the target SHALL commit nothing and show the choice-required cue. A tool or host that forbids detaching SHALL prevent the grip from starting a gesture. The tool SHALL be off unless the host sets the option `reconnect` to an object; an empty object enables it with defaults, a partial object SHALL keep the defaults of the fields it omits, and `reconnect: false` turns it off. While off, no grips are drawn and a press on a connection end behaves as a press on the connection.

#### Scenario: Drop on empty space cancels
- **WHEN** the option is `cancel` and the user releases on empty space
- **THEN** no command is submitted and the connection keeps its original endpoints

#### Scenario: Drop on empty space deletes
- **WHEN** the option is `delete` and the user releases on empty space
- **THEN** the connection is deleted as one history entry and one undo restores it with its ID

#### Scenario: Escape during reconnect
- **WHEN** the user presses Escape while dragging an endpoint
- **THEN** the provisional path is cleared, nothing is submitted, and the connection keeps its original endpoints and ID

#### Scenario: Fixed end removed
- **WHEN** an external change removes the node holding the fixed end during the gesture
- **THEN** the gesture is cancelled with reason `entity-removed` and nothing is submitted

#### Scenario: Undo during a reconnect
- **WHEN** the user drags an endpoint and an undo, run by the host while the drag lasts, changes the connection
- **THEN** the gesture is cancelled with reason `entity-changed`, nothing is submitted on release, and the connection keeps what the undo gave it

#### Scenario: Lost release
- **WHEN** the user drags an endpoint and a mouse move arrives that reports no button held
- **THEN** the gesture is cancelled and the connection keeps its original endpoints

#### Scenario: Target filled before release
- **WHEN** another edit fills the chosen target's last free slot after the preview showed it compatible
- **THEN** the commit is rejected with a rejection of code `capacity-exhausted` and the original connection is unchanged

#### Scenario: Off by default
- **WHEN** the host sets no `reconnect` option and selects a connection
- **THEN** no endpoint grips are drawn and dragging an end starts no reconnect

#### Scenario: New wire from a port with a selected wire
- **WHEN** a connection is selected, the tool is enabled, and the user presses Alt on the grip at its port and drags to another port
- **THEN** a new connection is drawn from that port by the connect tool and the selected one is unchanged

#### Scenario: Partial option
- **WHEN** the host sets `reconnect` to `{ onEmptyDrop: "delete" }`
- **THEN** the grip capture radius keeps its default

#### Scenario: Detach not permitted
- **WHEN** the capability model forbids editing the connection
- **THEN** the endpoint grips are not shown as draggable and a press on them starts no reconnect
