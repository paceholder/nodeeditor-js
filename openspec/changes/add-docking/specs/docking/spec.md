## ADDED Requirements

### Requirement: Connect-without-moving mode
Docking SHALL offer two modes chosen by an option: `snap`, where the dragged node moves so the two anchors coincide, and `connect`, where the node keeps the position where the user releases it and only the connection is added. In `connect` mode the preview SHALL show a line between the two ports and no ghost at a snapped position, and the commit SHALL contain the move to the released position plus the connection in one patch and one history entry. The mode SHALL NOT affect candidate ranking, hysteresis, suppression or compatibility.

#### Scenario: Connect without moving
- **WHEN** docking is enabled in `connect` mode and the user releases a node 30 px from a compatible port
- **THEN** the node is at the released position, one connection joins the two ports, and one undo reverts both

#### Scenario: Snap mode moves the node
- **WHEN** the same release happens in `snap` mode
- **THEN** the node ends with the two anchors coincident and one undo reverts both the move and the connection

### Requirement: Docking under pending validation
A docking candidate whose policy outcome is pending SHALL be previewed with the pending target state and SHALL NOT capture the node position in `snap` mode. A release on a pending candidate SHALL commit the plain move only if the host option says so (`move-only`, the default) or SHALL wait for the verdict (`wait`). While waiting the node SHALL stay shown at the released position and nothing SHALL be submitted. After an accepted verdict the dock SHALL be planned again, with the node at the anchor-coincident position in `snap` mode or the released position in `connect` mode, and committed as one history entry; if that plan is rejected, nothing SHALL be committed. After a rejected verdict, or a failed or timed-out validation, only the move to the released position SHALL be committed, because the answer concerns the connection alone. A wait under `wait` SHALL end, committing nothing, on Escape, a new press, locking the view, and any committed change from any origin that removes or changes an entity the waiting gesture involves: the moved nodes, the moving port, the candidate port and the candidate's node. While the node is still being dragged the candidate SHALL NOT be an involved entity: a change to it SHALL update or drop the candidate on the next frame and SHALL NOT cancel the drag. A verdict arriving after the gesture ended SHALL have no effect. Candidate choice during the drag SHALL remain stable while verdicts arrive (hysteresis).

#### Scenario: Release on a pending candidate, move-only
- **WHEN** the option is `move-only` and the user releases on a candidate whose verdict is unknown
- **THEN** only the move is committed and no connection is created

#### Scenario: Release on a pending candidate, wait
- **WHEN** the option is `wait` and the user releases on a candidate whose verdict is unknown, and the validator then accepts
- **THEN** the move and the connection are committed together as one history entry

#### Scenario: Wait ends in rejection
- **WHEN** the option is `wait` and the validator then rejects the candidate
- **THEN** only the move is committed and the rejection reason is emitted as a `connection-rejected` event

#### Scenario: Snap mode after an accepted verdict
- **WHEN** the option is `wait`, the mode is `snap`, and the user released 12 px from the candidate and the validator then accepts
- **THEN** the node ends with the two anchors coincident and the connection exists, in one history entry

#### Scenario: Candidate filled during the wait
- **WHEN** the validator accepts but another edit filled the candidate's last free slot during the wait
- **THEN** nothing is committed and the node is back at its original position

#### Scenario: Candidate removed while waiting
- **WHEN** the option is `wait` and a change from any origin removes the candidate's node before the verdict
- **THEN** the wait is cancelled with reason `entity-removed` and nothing is committed

#### Scenario: Candidate changed during the drag
- **WHEN** a node is being dragged with a candidate captured and a local host edit changes the candidate node's title
- **THEN** the drag continues, the candidate is evaluated again on the next frame, and releasing commits as usual

#### Scenario: Verdict changes the preview
- **WHEN** the candidate is pending during the drag and the validator then rejects it
- **THEN** the preview shows the rejection reason and the drag is no longer captured by it

## MODIFIED Requirements

### Requirement: Docking candidate preview
When docking is enabled, placement and movement SHALL preview compatible nearby docking candidates. Candidates SHALL be ports of other nodes within a configurable screen-space radius of a port of the dragged node, found through the spatial index. Ranking SHALL consider compatibility as decided by the connection policy, screen distance, orientation (facing normals), and stable tie-breaks by port ID, with hysteresis to prevent flicker. The default radius SHALL be 40 CSS pixels and the default hysteresis margin 6 CSS pixels; both SHALL be options. A port excluded by the policy, for example one whose attachment limit is reached, SHALL NOT be a compatible candidate.

#### Scenario: Approach a compatible port
- **WHEN** a dragged node's port comes within docking distance of a compatible port
- **THEN** the snapped position and proposed binding are previewed

#### Scenario: Incompatible nearby port
- **WHEN** the nearest port is incompatible
- **THEN** the policy's rejection message is shown and the drag is not captured by it

#### Scenario: Hysteresis
- **WHEN** the pointer jitters at the boundary between two candidates
- **THEN** the chosen candidate does not alternate between frames

#### Scenario: Occupied port excluded
- **WHEN** the nearest port has a limit of one and already has a connection
- **THEN** it is shown as occupied with its reason and the next compatible port, if any, is the candidate

### Requirement: Opt-in and suppressible docking
Docking SHALL be opt-in through one host option that is either a settings object or `false`, with `false` the default, and suppressible per gesture by a modifier, which defaults to Alt. A settings object that omits fields SHALL keep their defaults. Moving near another node SHALL NOT change topology unless docking is enabled and confirmed, where confirmed means the user releases the gesture with a compatible candidate captured and, when a verdict is awaited, that verdict is accepted. With docking disabled the move tool SHALL behave exactly as before and SHALL NOT evaluate candidates.

#### Scenario: Docking disabled
- **WHEN** docking is disabled and a node is dropped touching a compatible port
- **THEN** only the position changes

#### Scenario: Partial settings
- **WHEN** the host turns docking on with only the mode `connect`
- **THEN** the radius is 40 CSS px, the hysteresis 6 CSS px, the suppression modifier Alt, and a release on a pending candidate commits the move only

#### Scenario: Suppress with modifier
- **WHEN** docking is enabled and the user holds the suppression modifier while dropping
- **THEN** no binding is created and no candidate is previewed

### Requirement: Atomic dock commit
On confirmation or release, the position change (snapped in `snap` mode) and the new binding SHALL commit as one patch and one history entry, through one `dock` command validated by the connection policy at commit. A rejected or failed commit SHALL restore the prior state.

#### Scenario: Dock accepted
- **WHEN** the user releases on a docking candidate
- **THEN** one patch moves the node and adds the connection, and one undo reverts both

#### Scenario: Dock rejected by host
- **WHEN** the adapter rejects the dock plan
- **THEN** neither the position nor the binding changes

#### Scenario: Candidate filled during the gesture
- **WHEN** the candidate port becomes occupied by another edit before release
- **THEN** the commit is rejected with a rejection of code `capacity-exhausted` and neither the move nor a connection is committed

#### Scenario: Snapped position outside the world range
- **WHEN** snapping would place the node beyond the supported world range of plus or minus 1e7
- **THEN** the dock is rejected with code `out-of-range` as a whole and neither the move nor the connection is committed

### Requirement: Zero-length connections stay addressable
Connections with coincident anchors SHALL remain inspectable, selectable through an inspector or command, and undoable even when no path stroke is visible. The view SHALL show a minimal visible mark for a selected zero-length connection so the selection is perceivable.

#### Scenario: Select a docked connection
- **WHEN** a user selects a docked connection through the command API
- **THEN** it is selected and can be deleted or inspected like any other connection, and a mark is drawn at the shared anchor
