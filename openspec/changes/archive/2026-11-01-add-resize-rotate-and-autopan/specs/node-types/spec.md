## MODIFIED Requirements

### Requirement: NOD-04 Node transforms
Nodes SHALL support movement, quarter-turn rotation, and horizontal and vertical mirroring in screen axes: for any rotation, a horizontal mirror swaps the node's screen-left and screen-right and a vertical mirror swaps its top and bottom, about the node centre. Painting, port anchors, anchor normals, bounds, and picking SHALL all use the same node transform. A node stores one mirror flag and a quarter-turn rotation; a vertical mirror SHALL be stored as a horizontal mirror plus a half turn, and either mirror SHALL be one command and one history entry.

#### Scenario: Rotate a node
- **WHEN** a non-square node is rotated by a quarter turn
- **THEN** its painted body, port anchors, anchor normals, and hit shape all rotate together and incident connections follow the new anchors

#### Scenario: Mirror a node
- **WHEN** a node is mirrored horizontally
- **THEN** a port previously on the left side is drawn, picked, and attached on the right side with its normal pointing outward

#### Scenario: Mirror a node vertically
- **WHEN** an unrotated node with a port on its top edge is mirrored vertically
- **THEN** the port is drawn, picked, and attached on the bottom edge with its normal pointing outward, the node's centre is unchanged, and the history gains exactly one entry

#### Scenario: Mirror a rotated node
- **WHEN** a node rotated by one quarter turn is mirrored horizontally
- **THEN** the port that was on screen-left is on screen-right afterwards and no port changes its screen-vertical position

#### Scenario: Vertical mirror of a rotated node
- **WHEN** a node rotated by one quarter turn is mirrored vertically
- **THEN** the port that was on screen-top is on screen-bottom afterwards and no port changes its screen-horizontal position

#### Scenario: Undo a vertical mirror
- **WHEN** a vertical mirror is undone once
- **THEN** the node's mirror flag and rotation are both back to their previous values

### Requirement: NOD-04a Capability-gated resizing
Resizing SHALL be governed by the node's resize capability and SHALL respect type- or instance-declared minimum and maximum sizes. Resizing SHALL be opt-in: unless the node's type, a record override or the host capability policy allows it, the resize capability SHALL be denied. A resize SHALL keep a chosen point of the node's local frame (centre, edge midpoint or corner) fixed in world space for any rotation and mirroring. An interactive resize SHALL clamp to the limits while dragging; a resize command whose size lies outside the limits SHALL be rejected with an out-of-range reason. The position change a resize implies SHALL be judged by the resize capability, not the move capability.

#### Scenario: Resize clamped to bounds
- **WHEN** a resize command requests a width below the node's declared minimum
- **THEN** the result clamps to the minimum or is rejected according to the documented resize policy, and never stores a smaller width

#### Scenario: Resize denied
- **WHEN** a resize is requested for a node whose resize capability is denied
- **THEN** the command is rejected with a capability reason and the size is unchanged

#### Scenario: Type without resize declared
- **WHEN** a node type registers no resize capability and a resize command, or a local patch changing the size, targets one of its nodes
- **THEN** it is rejected with a capability reason and the size is unchanged

#### Scenario: Type opts in, instance opts out
- **WHEN** a node type allows resizing and one of its nodes carries a record override denying it
- **THEN** other nodes of the type can be resized and that node cannot

#### Scenario: Command outside the limits
- **WHEN** a resize command asks for a width above the node type's declared maximum
- **THEN** the command is rejected with an out-of-range reason naming the node, and the size and position are unchanged

#### Scenario: Instance limits refine type limits
- **WHEN** the node type declares a minimum width of 20 and the host's size-limit hook raises it to 40 for one node
- **THEN** a resize of that node to width 30 is rejected while the same resize of another node of the type is accepted

#### Scenario: Opposite side stays fixed on a rotated node
- **WHEN** a node rotated by one quarter turn and mirrored is resized with its local left edge as the fixed side
- **THEN** the world position of that edge's midpoint is unchanged and the node's centre moves by half the size change along that edge's normal

#### Scenario: Resize without the move capability
- **WHEN** a resizable node whose move capability is denied is resized with a corner fixed
- **THEN** the resize is accepted, while a patch that changes its position by more than the resize implies is rejected with the move capability reason

#### Scenario: Port anchors follow the new size
- **WHEN** an image-symbol node with a port placed at the middle of its right edge is resized to twice its width
- **THEN** the port is still drawn, picked, and attached at the middle of the new right edge and its incident connection follows

#### Scenario: Load keeps sizes outside new limits
- **WHEN** a document stores a node smaller than its type's declared minimum and is loaded, then resized and undone
- **THEN** the load succeeds with the stored size, and the undo restores that stored size

#### Scenario: Externally applied sizes
- **WHEN** an external adapter or a host snapshot changes the size of a node whose type did not opt in to resizing
- **THEN** the change is applied, because external changes are already decided by their authority
