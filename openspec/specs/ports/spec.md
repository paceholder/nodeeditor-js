# ports Specification

## Purpose

Defines ports as stable endpoints on nodes: identity, direction, type, cardinality, dynamic
instance-level changes, presentation targets, and target states. Direction and type are data
supplied by the model; their meaning for connections is decided by the connection policy.

## Requirements

### Requirement: PRT-01 Stable port addressing
Ports SHALL be addressed by stable IDs and composite members by stable keys, never by display index. Renaming, reordering, and moving a port SHALL preserve its attachments.

#### Scenario: Insert a port before an attached one
- **WHEN** a new port is inserted before an attached port in a node's port order
- **THEN** existing connections still reference their original port IDs

### Requirement: PRT-02 Atomic dynamic port changes
Instance-level port addition, removal, and modification SHALL be applied atomically together with the affected connections and geometry. Inserting a port SHALL NOT redirect existing attachments.

#### Scenario: Remove a connected port
- **WHEN** a port with two connections is removed in one change that also removes those connections
- **THEN** observers see one consistent change and no connection references the removed port

#### Scenario: Remove a port without handling its connections
- **WHEN** a change removes a connected port but does not include the removal or remapping of its connections
- **THEN** the change is rejected and the model is unchanged

### Requirement: PRT-03 Independent port properties
Each port SHALL declare a direction supplied by the model: `input`, `output`, or `undirected`. Direction, type key, cardinality, and graphical side SHALL be independent properties; direction SHALL NOT be inferred from the port's position.

#### Scenario: Output drawn on the left
- **WHEN** an output port is placed on the left side of a node
- **THEN** it behaves as an output for connection policy and is drawn on the left

#### Scenario: Undirected physical port
- **WHEN** a model declares a mechanical port as `undirected`
- **THEN** the port reports direction `undirected` and no input or output role is assumed

### Requirement: PRT-04 Attachment limits
Ports and composite members SHALL support attachment limits of zero, one, a finite maximum, or unlimited. Limits MAY differ per port, member, and connection kind. A limit of zero SHALL prevent new attachments but SHALL NOT delete existing ones.

#### Scenario: Limit reached
- **WHEN** a port with limit one already has a connection and a new connection to it is proposed
- **THEN** the proposal is rejected with an exhausted-capacity reason

#### Scenario: Limit lowered to zero
- **WHEN** a port with one connection has its limit changed to zero
- **THEN** the existing connection remains and new connections to the port are rejected

### Requirement: PRT-05 Separate glyph, target, label, and anchor
A port's visible glyph, interactive capture target, label, and anchor normal SHALL be separate properties. The capture area MAY be larger than the glyph and SHALL be specifiable in screen-space CSS pixels.

#### Scenario: Small glyph, large target
- **WHEN** a 4 px port glyph has a 12 px screen-space capture radius
- **THEN** pointer input within 12 CSS px of the anchor targets the port at any zoom level

### Requirement: PRT-06 Distinct target states
During connection gestures, ports SHALL be presented as unavailable, disabled, occupied, compatible, incompatible, or pending, each visually distinct and accompanied by a reason where relevant. Occupied SHALL NOT imply incompatible when the limit allows more attachments.

#### Scenario: Occupied but accepting
- **WHEN** a connection is dragged over an occupied port whose limit is unlimited and whose type is compatible
- **THEN** the port is shown as compatible with an occupied indicator, not as incompatible

#### Scenario: Incompatible with reason
- **WHEN** a hydraulic connection is dragged over a signal port
- **THEN** the port is shown as incompatible and the reason names the type mismatch

### Requirement: PRT-07 Preview effects of port removal or type change
Before removing or incompatibly changing a connected port, the library SHALL provide a preview of the affected bindings. The accepted change SHALL either remove or remap those bindings or be rejected; it SHALL NOT leave dangling references.

#### Scenario: Preview disconnects
- **WHEN** a user requests a type change for a port with two incompatible connections
- **THEN** a preview lists both connections as to-be-removed before anything is committed
