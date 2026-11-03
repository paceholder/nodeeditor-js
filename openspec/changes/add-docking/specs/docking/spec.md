## ADDED Requirements

### Requirement: DCK-06 Connect-without-moving mode
Docking SHALL offer two modes chosen by an option: `snap`, where the dragged node moves so the two anchors coincide, and `connect`, where the node keeps the position where the user releases it and only the connection is added. In `connect` mode the preview SHALL show a line between the two ports and no ghost at a snapped position, and the commit SHALL contain the move to the released position plus the connection in one patch and one history entry. The mode SHALL NOT affect candidate ranking, hysteresis, suppression or compatibility (DCK-01, DCK-02, DCK-03).

#### Scenario: Connect without moving
- **WHEN** docking is enabled in `connect` mode and the user releases a node 30 px from a compatible port
- **THEN** the node is at the released position, one connection joins the two ports, and one undo reverts both

#### Scenario: Snap mode moves the node
- **WHEN** the same release happens in `snap` mode
- **THEN** the node ends with the two anchors coincident and one undo reverts both the move and the connection

### Requirement: DCK-07 Docking under pending validation
A docking candidate whose policy outcome is pending (CON-04) SHALL be previewed with the pending state of PRT-06 and SHALL NOT capture the node position in `snap` mode. A release on a pending candidate SHALL commit the plain move only if the host option says so (`move-only`, the default) or SHALL wait for the verdict and then commit the move and the connection together or the move alone on rejection (`wait`). A verdict arriving after the gesture ended SHALL have no effect. Candidate choice during the drag SHALL remain stable while verdicts arrive (hysteresis, DCK-01) (TXN-05, TXN-06).

#### Scenario: Release on a pending candidate, move-only
- **WHEN** the option is `move-only` and the user releases on a candidate whose verdict is unknown
- **THEN** only the move is committed and no connection is created

#### Scenario: Verdict changes the preview
- **WHEN** the candidate is pending during the drag and the validator then rejects it
- **THEN** the preview shows the rejection reason and the drag is no longer captured by it

## MODIFIED Requirements

### Requirement: DCK-01 Docking candidate preview
When docking is enabled, placement and movement SHALL preview compatible nearby docking candidates. Candidates SHALL be ports of other nodes within a configurable screen-space radius of a port of the dragged node, found through the spatial index. Ranking SHALL consider compatibility as decided by the connection policy (CON-03), screen distance, orientation (facing normals), and stable tie-breaks by port ID, with hysteresis to prevent flicker. A port excluded by the policy, for example one whose attachment limit is reached (PRT-04), SHALL NOT be a compatible candidate.

#### Scenario: Approach a compatible port
- **WHEN** a dragged node's port comes within docking distance of a compatible port
- **THEN** the snapped position and proposed binding are previewed

#### Scenario: Incompatible nearby port
- **WHEN** the nearest port is incompatible
- **THEN** a reason is shown and the drag is not captured by it

#### Scenario: Hysteresis
- **WHEN** the pointer jitters at the boundary between two candidates
- **THEN** the chosen candidate does not alternate between frames

#### Scenario: Occupied port excluded
- **WHEN** the nearest port has a limit of one and already has a connection
- **THEN** it is shown as occupied with its reason and the next compatible port, if any, is the candidate

### Requirement: DCK-02 Opt-in and suppressible docking
Docking SHALL be opt-in per tool or host and suppressible per gesture by a modifier. Moving near another node SHALL NOT change topology unless docking is enabled and confirmed. With docking disabled the move tool SHALL behave exactly as before and SHALL NOT evaluate candidates.

#### Scenario: Docking disabled
- **WHEN** docking is disabled and a node is dropped touching a compatible port
- **THEN** only the position changes

#### Scenario: Suppress with modifier
- **WHEN** docking is enabled and the user holds the suppression modifier while dropping
- **THEN** no binding is created and no candidate is previewed

### Requirement: DCK-03 Atomic dock commit
On confirmation or release, the position change (snapped in `snap` mode, DCK-06) and the new binding SHALL commit as one patch and one history entry, through one `dock` command validated by the connection policy at commit (CON-05). A rejected or failed commit SHALL restore the prior state (INT-08).

#### Scenario: Dock accepted
- **WHEN** the user releases on a docking candidate
- **THEN** one patch moves the node and adds the connection, and one undo reverts both

#### Scenario: Dock rejected by host
- **WHEN** the adapter rejects the dock plan
- **THEN** neither the position nor the binding changes

#### Scenario: Candidate filled during the gesture
- **WHEN** the candidate port becomes occupied by another edit before release
- **THEN** the commit is rejected with the exhausted-capacity reason and neither the move nor a connection is committed

### Requirement: DCK-05 Zero-length connections stay addressable
Connections with coincident anchors SHALL remain inspectable, selectable through an inspector or command, and undoable even when no path stroke is visible. The view SHALL show a minimal visible mark for a selected zero-length connection so the selection is perceivable (UX-02).

#### Scenario: Select a docked connection
- **WHEN** a user selects a docked connection through the command API
- **THEN** it is selected and can be deleted or inspected like any other connection, and a mark is drawn at the shared anchor
