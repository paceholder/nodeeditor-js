# docking Specification

## Purpose

Defines direct docking: connecting nearby compatible ports while positioning nodes so their
anchors coincide, as an opt-in, previewed, atomic edit that never merges node identities or
silently changes topology.

## Requirements

### Requirement: DCK-01 Docking candidate preview
When docking is enabled, placement and movement SHALL preview compatible nearby docking candidates. Ranking SHALL consider compatibility, screen distance, orientation, and stable tie-breaks, with hysteresis to prevent flicker.

#### Scenario: Approach a compatible port
- **WHEN** a dragged node's port comes within docking distance of a compatible port
- **THEN** the snapped position and proposed binding are previewed

#### Scenario: Incompatible nearby port
- **WHEN** the nearest port is incompatible
- **THEN** a reason is shown and the drag is not captured by it

#### Scenario: Hysteresis
- **WHEN** the pointer jitters at the boundary between two candidates
- **THEN** the chosen candidate does not alternate between frames

### Requirement: DCK-02 Opt-in and suppressible docking
Docking SHALL be opt-in per tool or host and suppressible per gesture by a modifier. Moving near another node SHALL NOT change topology unless docking is enabled and confirmed.

#### Scenario: Docking disabled
- **WHEN** docking is disabled and a node is dropped touching a compatible port
- **THEN** only the position changes

#### Scenario: Suppress with modifier
- **WHEN** docking is enabled and the user holds the suppression modifier while dropping
- **THEN** no binding is created

### Requirement: DCK-03 Atomic dock commit
On confirmation or release, the snapped position and the new binding SHALL commit as one patch and one history entry. A rejected or failed commit SHALL restore the prior state.

#### Scenario: Dock accepted
- **WHEN** the user releases on a docking candidate
- **THEN** one patch moves the node and adds the connection, and one undo reverts both

#### Scenario: Dock rejected by host
- **WHEN** the adapter rejects the dock plan
- **THEN** neither the position nor the binding changes

### Requirement: DCK-04 Undocking preserves connections
Moving previously docked nodes apart SHALL keep their connection by default and reveal a visible route. Only an explicit permitted disconnect action SHALL remove it.

#### Scenario: Pull docked node away
- **WHEN** a docked node is dragged away from its partner
- **THEN** the connection remains with the same ID and its path becomes visible

### Requirement: DCK-05 Zero-length connections stay addressable
Connections with coincident anchors SHALL remain inspectable, selectable through an inspector or command, and undoable even when no path stroke is visible.

#### Scenario: Select a docked connection
- **WHEN** a user selects a docked connection through the command API
- **THEN** it is selected and can be deleted or inspected like any other connection
