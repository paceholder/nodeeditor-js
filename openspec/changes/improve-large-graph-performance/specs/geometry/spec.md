## MODIFIED Requirements

### Requirement: Indexed culling by painted bounds
Visibility culling SHALL query painted bounds (including shadows, labels, arrowheads, and lanes), so partially visible entities and paths crossing the viewport are drawn while fully off-screen entities are skipped. For a path, the culling bounds SHALL be the union of its per-segment boxes, each grown by the painted margin, so a path is culled when none of its segment boxes intersects the viewport, even if its overall bounding box does.

#### Scenario: Label extends into viewport
- **WHEN** a node's body is off-screen but its label's painted bounds intersect the viewport
- **THEN** the node is included in the draw set

#### Scenario: S-curve beside the viewport
- **WHEN** an S-shaped connection's overall bounding box touches the viewport but its stroke, and every one of its margin-grown segment boxes, lies outside it
- **THEN** the connection is not included in the draw set
