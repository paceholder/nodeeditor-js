## ADDED Requirements

### Requirement: INT-14 Endpoint reconnection gesture
A selected connection SHALL show a grip at each endpoint with a capture radius specified in CSS pixels and a distinct cursor. Pressing a grip and dragging past the drag threshold SHALL start a reconnect of that end: the stored connection SHALL stay unchanged and visible while a provisional path from the fixed end follows the pointer and snaps to the nearest candidate port using the existing deterministic candidate order (GEO-04a). Candidate ports SHALL show the target states of PRT-06, evaluated by the policy with the connection being moved passed as replaced, so occupancy and duplicate checks ignore it (CON-01a). Releasing on a compatible port SHALL submit one `reconnect` command that keeps the connection ID and kind semantics of CON-08, and the gesture SHALL produce one history entry (INT-08). Parallel connections SHALL be reconnectable independently (CON-02). A press below the drag threshold SHALL behave as a click on the connection (INT-05).

#### Scenario: Reconnect to a valid port
- **WHEN** the user drags the target-end grip of a selected connection and releases on a compatible, free port of another node
- **THEN** one `reconnect` command is submitted, the connection keeps its ID, its target is the new port, and one undo restores the old target

#### Scenario: Port occupied only by the moved connection
- **WHEN** the user drags the end of a connection toward the port it is already attached to, whose limit is one
- **THEN** the port is shown as compatible, not occupied, because the connection being moved is ignored

#### Scenario: Reconnect to an invalid port
- **WHEN** the user releases on an incompatible port
- **THEN** nothing is committed, the original connection is kept, and before release the port showed the incompatible state with its reason

#### Scenario: Parallel connections
- **WHEN** two parallel connections join the same port pair and the user reconnects one of them
- **THEN** only that connection changes and both keep their IDs

#### Scenario: Click on a grip
- **WHEN** the user presses and releases a grip without exceeding the drag threshold
- **THEN** no reconnect starts and the press is handled as a click on the connection

### Requirement: INT-14a Reconnect release and cancellation
Releasing on empty space SHALL cancel the reconnect and keep the connection, or delete the connection when the host option `onEmptyDrop` is `delete`; a delete SHALL be one history entry and subject to the delete capability (CON-07). Escape, pointercancel, lost capture, window blur, a hidden or unmounted view, a reset, and removal of the connection, its fixed end port or the hovered target during the gesture SHALL cancel it, discard the provisional path and submit nothing (INT-05). A `reconnect` command rejected at commit (CON-05) SHALL leave the original connection unchanged and deliver the rejection. A policy choice outcome for the target SHALL commit nothing and show the choice-required cue (INT-12b). A tool or host that forbids detaching SHALL prevent the grip from starting a gesture (CON-07).

#### Scenario: Drop on empty space cancels
- **WHEN** the option is `cancel` and the user releases on empty space
- **THEN** no command is submitted and the connection keeps its original endpoints

#### Scenario: Drop on empty space deletes
- **WHEN** the option is `delete` and the user releases on empty space
- **THEN** the connection is deleted as one history entry and one undo restores it with its ID

#### Scenario: Escape during reconnect
- **WHEN** the user presses Escape while dragging an endpoint
- **THEN** the provisional path is cleared, nothing is submitted, and the connection keeps its original endpoints and ID (CON-07)

#### Scenario: Fixed end removed
- **WHEN** an external change removes the node holding the fixed end during the gesture
- **THEN** the gesture is cancelled and nothing is submitted

#### Scenario: Target filled before release
- **WHEN** another edit fills the chosen target's last free slot after the preview showed it compatible
- **THEN** the commit is rejected with the exhausted-capacity reason and the original connection is unchanged

#### Scenario: Detach not permitted
- **WHEN** the capability model forbids editing the connection
- **THEN** the endpoint grips are not shown as draggable and a press on them starts no reconnect
