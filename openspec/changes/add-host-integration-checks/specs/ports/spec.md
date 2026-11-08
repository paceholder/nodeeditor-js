## ADDED Requirements

### Requirement: Image-symbol port normals and capture radius
An image-symbol placement SHALL accept an explicit outward normal per port, because a host knows
each port's side and does not want it guessed from the nearest edge; without one the normal is
derived from the nearest body edge. The normal SHALL rotate and mirror with the node
in the same transform as the anchor. A port glyph MAY be hidden while its capture radius, in
CSS pixels, stays active.

#### Scenario: Corner and interior ports
- **WHEN** a port is placed at a corner or in the interior of the body without a normal
- **THEN** its normal is the documented nearest-edge result, and an explicit normal overrides it

#### Scenario: Interior port with a normal
- **WHEN** a port lies in the interior of the picture and has an explicit normal pointing right
- **THEN** an orthogonal connection leaves the port to the right, not toward the nearest edge

#### Scenario: Rotated and mirrored node
- **WHEN** a node with an explicit port normal is rotated 90 degrees and mirrored
- **THEN** the port normal is the transformed normal and an orthogonal connection leaves along it

#### Scenario: Hidden glyph, active target
- **WHEN** the glyph is hidden and the capture radius is 12 CSS px
- **THEN** a press within 12 px of the anchor targets the port at every zoom level
