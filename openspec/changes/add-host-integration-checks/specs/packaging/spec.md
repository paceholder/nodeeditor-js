## ADDED Requirements

### Requirement: External drop example and coordinate conversion
`view.clientToWorld` SHALL be correct when the view sits in a scrolled, CSS-transformed or
scaled container. One example SHALL create a node at the pointer-up position of a drag that
starts outside the view, using pointer events only and no HTML5 drag and drop.

#### Scenario: Transformed container
- **WHEN** the view is inside a scrolled container scaled by 0.5 and a point is converted
- **THEN** the world position matches the node painted under that point

#### Scenario: Palette drop
- **WHEN** a pointer drag from a palette item ends over the canvas
- **THEN** one node is created at the converted position as one history entry, and a release outside the canvas creates none

#### Scenario: Drop beyond the world range
- **WHEN** the converted drop position lies outside the supported world range of plus or minus 1e7
- **THEN** no node is created and the example reports the refusal with code `out-of-range`
