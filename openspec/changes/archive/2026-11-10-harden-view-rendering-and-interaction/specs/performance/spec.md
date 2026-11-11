## ADDED Requirements

### Requirement: Cached text fitting
Fitting a label to a width, shortening it with an ellipsis when needed, SHALL be cached per font, text and width, so a frame that repeats the previous frame's labels SHALL make no text measurements, up to at least 1000 distinct labels.

#### Scenario: Many truncated titles
- **WHEN** 500 card nodes with titles too long for their bars are painted twice at the same zoom
- **THEN** the second paint makes no text measurement

### Requirement: Direct port lookup while painting
Painting the port glyphs of a node SHALL look up each port directly by its ID, with work proportional to the number of ports and no list allocated per node.

#### Scenario: Node with many ports
- **WHEN** a node with 200 ports is painted
- **THEN** each port's record is read once and the node's port list is not requested

### Requirement: Throttled idle pointer work
With no gesture running, the hit testing that chooses the pointer cursor SHALL run at most once per animation frame, however many pointer moves arrive in between.

#### Scenario: Burst of moves
- **WHEN** twenty pointer moves arrive over the view before the next animation frame
- **THEN** the cursor hit test runs once, for the last position
