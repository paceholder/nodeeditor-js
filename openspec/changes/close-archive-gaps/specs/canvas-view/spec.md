## MODIFIED Requirements

### Requirement: Canvas2D stacked layers
The default view SHALL render with Canvas2D using stacked canvases: a background layer (grid), a scene layer (connections, nodes, ports), and an interaction layer (previews, marquee, candidate highlights). Each layer SHALL repaint independently. Canvas2D is the only built-in backend for now; other backends (WebGL, WebGPU, or a scene-graph renderer) are deferred, and no backend swap contract is promised beyond keeping renderer objects behind the boundary.

#### Scenario: Drag preview repaints only interaction layer
- **WHEN** a connection is being dragged from a port and no committed state changes
- **THEN** only the interaction layer repaints each frame

#### Scenario: Pan repaints background and scene
- **WHEN** the user pans the viewport
- **THEN** the background and scene layers repaint and the model is not touched

### Requirement: Renderer objects stay behind the boundary
DOM elements, Canvas contexts, Path2D objects, GPU handles, and image objects SHALL NOT appear in the headless model or in snapshots. Renderer-specific objects SHALL remain inside the view layer. Rendering and picking SHALL be side-effect free on model data and SHALL NOT run application logic; hiding a node, port, or path through level of detail or culling SHALL NOT delete or change any connection.

#### Scenario: Snapshot after painting
- **WHEN** a mounted view has painted nodes with image assets and a snapshot is taken
- **THEN** the snapshot is JSON-compatible and contains asset references only, no image or canvas objects

#### Scenario: Low detail keeps connections
- **WHEN** the zoom drops to a level where ports and labels are not drawn
- **THEN** every connection is still in the model and in snapshots, and the model revision is unchanged

### Requirement: Rendering profiles
The view SHALL publish capabilities and limits for a symbol profile (drawn nodes, no per-node DOM) and a React-content profile (interactive React node bodies over drawn connections). Both SHALL use the same model, command, policy, and snapshot contracts; switching profiles SHALL NOT change identities or history. Arbitrary React content SHALL NOT be rasterized into the canvas automatically; it lives in the DOM overlay, and the published limits for that profile state how many bodies stay mounted.

#### Scenario: Same document, both profiles
- **WHEN** one document is shown in a symbol-profile view and a React-content-profile view
- **THEN** both show the same IDs and connections and edits in either produce the same patches

## ADDED Requirements

### Requirement: Transient overlay connections
The view SHALL provide a hook for drawing host-supplied transient connections, such as a temporary link between two entities or world positions while a host operation runs, on the interaction layer in world coordinates. Transient connections SHALL NOT enter the model, patches, snapshots, history, picking, or the spatial index, and SHALL disappear when the host removes them or the view is disposed.

#### Scenario: Temporary link
- **WHEN** the host supplies a transient connection between two nodes and the user pans and zooms
- **THEN** it follows the nodes, only the interaction layer repaints, and no model change occurs

#### Scenario: Not pickable
- **WHEN** the pointer is over a transient connection
- **THEN** it is not returned by picking and cannot be selected or edited
