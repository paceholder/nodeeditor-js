## ADDED Requirements

### Requirement: Route constraint data
A connection SHALL be able to carry an ordered list of route constraints in world coordinates, stored separately from the automatic route vertices and listed from the connection's `from` end to its `to` end. The first constraint kind SHALL be a pinned segment: a horizontal or vertical segment at a fixed coordinate. Constraints SHALL be part of the durable view data: validated on load, kept in snapshots and saved documents, restored by undo and redo, and copied with the connection. A router SHALL receive the constraints of the connection it routes; a router that does not use a constraint SHALL ignore it and the constraint SHALL stay stored.

#### Scenario: Pinned segment survives reload
- **WHEN** a connection with a pinned vertical segment at x = 120 is saved and the document is loaded again
- **THEN** the loaded connection has the same pinned segment and its route passes along x = 120

#### Scenario: Invalid constraint rejected on load
- **WHEN** a snapshot holds a connection whose route constraint has a non-finite coordinate or an unknown constraint kind
- **THEN** loading fails with a validation error naming that connection

#### Scenario: Route kind ignores constraints
- **WHEN** a connection with a pinned segment is routed by a Bezier route
- **THEN** it is drawn as the Bezier curve and its pinned segment is still in the model

### Requirement: Pluggable route editors
Pointer mechanics for editing a route SHALL be a registration per connection kind, independent of the router, the path painter and other tools. A route editor SHALL define the handles it offers on a connection, how a press finds a handle, the constraints a drag produces, and what a double-click on a handle does. A connection whose kind has no editor SHALL behave as before: a press selects it and a drag does nothing. The library SHALL supply an orthogonal segment editor.

#### Scenario: Kind without an editor
- **WHEN** a selected connection's kind has no route editor and the user drags from it
- **THEN** no route edit starts and the model is unchanged

#### Scenario: Editor replaced
- **WHEN** a host registers its own route editor for an orthogonal kind
- **THEN** presses on that kind's connections use the host editor, and its router and painter are unchanged

### Requirement: Orthogonal segment drag
With the orthogonal segment editor, each inner segment of a selected orthogonal connection (every segment except the first and the last) SHALL be draggable perpendicular to its direction, with a grip drawn on it and a resize cursor while hovered. Dragging SHALL preview the re-routed connection and on release commit one route edit: the dragged segment becomes a pinned segment at its new coordinate, and earlier pins of the connection are kept. The orthogonal router SHALL route through the pins in order and adapt only free segments, adding bends when a pin cannot be reached otherwise, and SHALL report which path segment realizes each pin. Routing with pins SHALL be deterministic and independent of end order. A drag cancelled with Escape SHALL leave the model unchanged.

#### Scenario: Move a middle segment
- **WHEN** the user drags the vertical middle segment of a selected S-shaped orthogonal connection 40 units to the right and releases
- **THEN** one history entry is added, the patch updates only that connection's route constraints, and the segment is drawn 40 units to the right

#### Scenario: Endpoint moves after a pin
- **WHEN** a connected node moves after a segment was pinned
- **THEN** the pinned segment keeps its coordinate and only the free segments adapt

#### Scenario: Pin behind the target
- **WHEN** a node moves so that a pinned vertical segment lies beyond the target port
- **THEN** the route still passes along the pinned segment, with extra bends to reach the target from its escape direction

#### Scenario: First and last segments are not draggable
- **WHEN** the user presses on the first segment of a selected orthogonal connection
- **THEN** no route edit starts and the press behaves as a press on the connection

#### Scenario: Undo a segment move
- **WHEN** the user moves a segment and then undoes
- **THEN** the connection's constraints and route are as before the drag

### Requirement: Freeing and resetting a route
Double-clicking a pinned segment with the orthogonal segment editor SHALL remove that pin in one history entry. A reset-route command SHALL remove all constraints of the selected connections in one history entry and SHALL be unavailable when none of them has constraints.

#### Scenario: Double-click frees a segment
- **WHEN** the user double-clicks a pinned segment
- **THEN** its pin is removed, other pins of the connection stay, and the free part takes the automatic shape

#### Scenario: Reset route
- **WHEN** two selected connections have pins and the reset-route command runs
- **THEN** both connections lose all constraints in one history entry

### Requirement: Constraints follow copies and whole moves
Paste and duplicate SHALL shift copied pinned segments by the placement offset along their coordinate axis. A move command that moves both endpoint nodes of a connection SHALL shift that connection's pins by the same offset in the same patch; a move of only one endpoint SHALL keep them.

#### Scenario: Duplicate keeps the shape
- **WHEN** two connected nodes and their connection with a pinned segment are duplicated
- **THEN** the copy's pinned segment is shifted by the duplicate offset and the copy has the same shape as the original

#### Scenario: Moving both ends
- **WHEN** both endpoint nodes of a connection with a pinned vertical segment are moved 50 units right in one gesture
- **THEN** the pin moves 50 units right in the same history entry
