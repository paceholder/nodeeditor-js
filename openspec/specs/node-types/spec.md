# node-types Specification

## Purpose

Defines how hosts register node types and how node instances expose appearance, geometry,
transforms, labels, status, and diagnostics. Node painting, geometry, and tools are separate
registrations so each can change without touching the others.

## Requirements

### Requirement: NOD-01 Type registration
The library SHALL let hosts register node types, each with default payload creation, appearance, geometry, capability defaults, and optional property-editor integration. Adding or changing one type SHALL NOT require editing a central switch statement or any other type's registration.

#### Scenario: Register a new type in isolation
- **WHEN** a host registers a `Pump` type with its own payload factory, geometry, and painter
- **THEN** nodes of type `Pump` can be created and rendered without modifying code for any other type

#### Scenario: Capability defaults from type
- **WHEN** a type declares that its nodes cannot be resized
- **THEN** new nodes of that type report the resize capability as denied

### Requirement: NOD-02 Custom shapes and portless nodes
Nodes SHALL support both standard card shapes and arbitrary custom shapes with independently supplied body bounds, precise hit shape, label placement, and port anchor frames. A node MAY have no ports.

#### Scenario: Non-rectangular hit shape
- **WHEN** a diamond-shaped image-symbol node is clicked inside its bounding box but outside the diamond
- **THEN** the node is not hit

#### Scenario: Node without ports
- **WHEN** a host creates a node whose type declares no ports
- **THEN** the node renders, can be selected and moved, and has no attachment targets

### Requirement: NOD-03 Sizes and port layouts
Nodes SHALL support non-square dimensions, independent per-node sizes, horizontal and vertical default port layouts, custom per-port positions anywhere on or inside the outline, and arbitrary port counts.

#### Scenario: Ports placed on the outline of an image symbol
- **WHEN** a 25-by-49 image-symbol node declares ports at its top edge, left edge, and an interior point
- **THEN** each port anchor is drawn and hit-tested at its declared position

### Requirement: NOD-04 Node transforms
Nodes SHALL support movement, quarter-turn rotation, and horizontal mirroring. Painting, port anchors, anchor normals, bounds, and picking SHALL all use the same node transform.

#### Scenario: Rotate a node
- **WHEN** a non-square node is rotated by a quarter turn
- **THEN** its painted body, port anchors, anchor normals, and hit shape all rotate together and incident connections follow the new anchors

#### Scenario: Mirror a node
- **WHEN** a node is mirrored horizontally
- **THEN** a port previously on the left side is drawn, picked, and attached on the right side with its normal pointing outward

### Requirement: NOD-04a Capability-gated resizing
Resizing SHALL be governed by the node's resize capability and SHALL respect type- or instance-declared minimum and maximum sizes.

#### Scenario: Resize clamped to bounds
- **WHEN** a resize command requests a width below the node's declared minimum
- **THEN** the result clamps to the minimum or is rejected according to the documented resize policy, and never stores a smaller width

#### Scenario: Resize denied
- **WHEN** a resize is requested for a node whose resize capability is denied
- **THEN** the command is rejected with a capability reason and the size is unchanged

### Requirement: NOD-05 Independent labels and decorations
Node title, optional secondary label, port labels, tooltip/inspector metadata, validation state, and progress/status decorations SHALL be independently updatable. Updating status SHALL NOT require replacing the node or changing its identity.

#### Scenario: Status update keeps identity
- **WHEN** a host sets a node's status decoration to "error"
- **THEN** the node keeps its ID, payload, connections, and selection, and only its decoration changes

### Requirement: NOD-06 Interactive React node content
The library SHALL support interactive React content inside node bodies and focused overlay editors. Form input inside such content SHALL NOT trigger graph-level delete, duplicate, or navigation commands. Delivery is scheduled after the symbol renderer meets its performance budgets; earlier slices only reserve the DOM overlay slot.

#### Scenario: Typing in a node form
- **WHEN** the user presses Delete while a text input inside a React node body has focus
- **THEN** the input's text is edited and no graph delete command runs

### Requirement: NOD-07 Unknown types and missing assets
Nodes whose type is not registered, or whose assets cannot be loaded, SHALL appear as placeholders with their identity, bounds, ports, and a diagnostic. Missing extensions SHALL NOT make nodes disappear or destroy their payloads.

#### Scenario: Unregistered type
- **WHEN** a snapshot contains a node of a type the host has not registered
- **THEN** the node is shown as a placeholder with a diagnostic and its payload is preserved unchanged in later snapshots

#### Scenario: Missing image asset
- **WHEN** an image-symbol node's picture fails to load
- **THEN** the node keeps its geometry and ports and shows a missing-asset indicator

### Requirement: NOD-08 Independent extension registrations
Node-body painting, port painting, connection painting, node geometry, and tool behavior SHALL be registered independently. A host SHALL be able to reuse one painter with different geometries or policies.

#### Scenario: Reuse painter with new geometry
- **WHEN** a host registers a new geometry for an existing type and keeps its painter
- **THEN** the node renders with the new outline and anchors without any change to painter code

### Requirement: NOD-09 Creatable types and create-at-position
The library SHALL expose the list of registered creatable types and a create-at-world-position command usable by palettes, context menus, and the API.

#### Scenario: Create from palette
- **WHEN** the user drops a palette entry at a world position
- **THEN** one node of that type is created at that position as one history entry

### Requirement: NOD-09a Failing type factories
Type factories SHALL report failure through structured results. A failed factory SHALL leave no partial node, port, or connection in the graph.

#### Scenario: Factory failure
- **WHEN** a type's payload factory returns a failure during create
- **THEN** the create command returns a rejection with the factory's reason and the model is unchanged
