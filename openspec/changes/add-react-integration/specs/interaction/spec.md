## ADDED Requirements

### Requirement: Hover event
The view SHALL raise a `"hover"` event through `view.on` when the entity under the pointer changes. The payload SHALL be plain data by stable IDs: the entity kind (node, port, connection), its IDs, and for a node its screen rectangle in client coordinates, or a leave form when no entity is under the pointer. Detection SHALL reuse geometric picking and the spatial index, never pixel lookups. The event SHALL fire at most once per animation frame and only when the hovered entity changes. It SHALL NOT fire during a gesture (drag, marquee, pan, connection drag) and SHALL respect the level-of-detail rule that hides ports when zoomed out. A connection's hit member MAY be included when the picker already returns it. Delays (for example a one-second tooltip delay) and popover content stay in the host.

#### Scenario: Enter, move within, leave
- **WHEN** the pointer moves onto a node, moves within it, and then leaves it
- **THEN** exactly one enter event and one leave event are raised, none while moving within

#### Scenario: Node rectangle in the payload
- **WHEN** the pointer enters a node
- **THEN** the event carries the node's ID and its screen rectangle, so a host can place a popover without a second query

#### Scenario: Drag raises none
- **WHEN** the user drags a node across other nodes
- **THEN** no hover event is raised until the gesture ends, then one for the entity under the pointer

#### Scenario: Ports hidden when zoomed out
- **WHEN** the zoom is below the port-hiding threshold and the pointer is over a port anchor
- **THEN** the hover target is the node, not the port

#### Scenario: Burst of moves
- **WHEN** many pointer moves cross several nodes within one frame
- **THEN** at most one event is raised for that frame, for the final entity

### Requirement: Hover state
The view SHALL expose the current hover target as state (`view.hover`) and SHALL feed the default `isHovered` painting state from it, so painters can show hover styling without host wiring. Hover state SHALL NOT enter the model, patches, snapshots, or history.

#### Scenario: Default hovered styling input
- **WHEN** the pointer is over a node and a painter reads the hovered flag
- **THEN** the flag is true for that node only, and false after the pointer leaves

#### Scenario: Removed hovered entity
- **WHEN** the hovered node is deleted
- **THEN** the hover state clears and a leave event is raised
