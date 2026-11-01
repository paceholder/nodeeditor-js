# canvas-view Specification

## Purpose

Defines the browser view: Canvas2D rendering with stacked dirty-driven layers, independent
painter and extension registrations, themes and z-order, rendering profiles, the image asset
service, built-in node presets, and DOM overlay and presence slots.

## Requirements

### Requirement: Independent extension contracts
Node painters, port glyph painters, node geometry, connection-path painters and pickers, routing, themes, overlays, and interaction tools SHALL be registered through independent typed contracts. Changing one SHALL NOT require changing another.

#### Scenario: New port glyph only
- **WHEN** a host registers a new port glyph painter for one port type
- **THEN** node-body painters, connection painters, and geometry are unchanged and the new glyph is drawn

#### Scenario: Reuse painter with new geometry
- **WHEN** a host registers a new node geometry and reuses an existing node painter
- **THEN** the node is drawn and picked according to the new geometry

### Requirement: Renderer objects stay behind the boundary
DOM elements, Canvas contexts, Path2D objects, GPU handles, and image objects SHALL NOT appear in the headless model or in snapshots. Renderer-specific objects SHALL remain inside the view layer.

#### Scenario: Snapshot after painting
- **WHEN** a mounted view has painted nodes with image assets and a snapshot is taken
- **THEN** the snapshot is JSON-compatible and contains asset references only, no image or canvas objects

### Requirement: Shared viewport and input ownership
Drawn content and DOM overlays SHALL share one viewport transform and explicit pointer and focus ownership. Invisible or inactive overlays SHALL NOT intercept unrelated graph input.

#### Scenario: Overlay follows pan and zoom
- **WHEN** a focused DOM editor is open on a node and the user zooms
- **THEN** the editor stays aligned with the node's drawn position

#### Scenario: Hidden overlay does not block input
- **WHEN** an overlay is closed or hidden
- **THEN** pointer events at its former position reach the canvas

### Requirement: Targeted invalidation
The view SHALL receive dirty notifications distinguishing geometry, style, content, and asset changes. Theme and value changes SHALL NOT invalidate unrelated topology or routes.

#### Scenario: Theme change
- **WHEN** the theme's selection color changes
- **THEN** the scene repaints without recomputing any route or rebuilding any index

#### Scenario: Status decoration update
- **WHEN** one node's status decoration changes
- **THEN** only that node's painted region is invalidated

### Requirement: Rendering profiles
The view SHALL publish capabilities and limits for a symbol profile (drawn nodes, no per-node DOM) and a React-content profile (interactive React node bodies over drawn connections). Both SHALL use the same model, command, policy, and snapshot contracts; switching profiles SHALL NOT change identities or history.

#### Scenario: Same document, both profiles
- **WHEN** one document is shown in a symbol-profile view and a React-content-profile view
- **THEN** both show the same IDs and connections and edits in either produce the same patches

### Requirement: Image export (SHOULD)
The library SHALL provide PNG and SVG export or an export adapter with bounds and asset-readiness checks. Unsupported custom content SHALL be reported, and React-only bodies SHALL NOT be silently omitted from an export claimed complete. Not an R1 release gate.

#### Scenario: Export with React content
- **WHEN** a view containing React node bodies is exported to PNG
- **THEN** the result reports which bodies were not rendered

### Requirement: Canvas2D stacked layers
The default view SHALL render with Canvas2D using stacked canvases: a background layer (grid), a scene layer (connections, nodes, ports), and an interaction layer (previews, marquee, candidate highlights). Each layer SHALL repaint independently.

#### Scenario: Drag preview repaints only interaction layer
- **WHEN** a connection is being dragged from a port and no committed state changes
- **THEN** only the interaction layer repaints each frame

#### Scenario: Pan repaints background and scene
- **WHEN** the user pans the viewport
- **THEN** the background and scene layers repaint and the model is not touched

### Requirement: Dirty-driven frame scheduling
Repaints SHALL be requested only by dirty notifications and coalesced to at most one per animation frame per layer. Once dirty work and intentional animations finish, no render loop or polling SHALL keep running.

#### Scenario: Many changes in one frame
- **WHEN** ten model changes arrive before the next animation frame
- **THEN** each affected layer repaints once in that frame

#### Scenario: Idle editor
- **WHEN** no input, change, or animation occurs for several seconds
- **THEN** no animation frames are requested

### Requirement: Culled painting
The scene layer SHALL paint only entities whose painted bounds intersect the viewport, using the spatial index, and SHALL draw visible paths whose endpoints are off-screen.

#### Scenario: Large graph navigation
- **WHEN** the viewport shows 1k of 10k nodes
- **THEN** only the visible nodes and the paths intersecting the viewport are painted

### Requirement: Level of detail
The view SHALL support detail levels selected by zoom. Low detail MAY suppress nonessential text and decorations but SHALL preserve attachment and junction distinctions, selection, and discoverable errors. Ports keep a constant on-screen size, so below a configurable port-hiding zoom threshold the view SHALL neither draw ports nor offer them as pick or connection-capture targets, so that a press there pans, selects or moves instead of starting a connection; the threshold MAY be set to zero to always show ports. The lowest level, overview, MAY additionally draw nodes as plain outlines and connections as simplified strokes. At every level connection endpoints SHALL still meet their nodes at the port positions, and selected nodes and connections, error and status indicators, and junction markers SHALL remain visible.

#### Scenario: Zoomed far out
- **WHEN** the zoom drops below the low-detail threshold
- **THEN** labels are hidden while selected nodes, junction markers, and error indicators remain visible

#### Scenario: Ports hidden when zoomed out
- **WHEN** the zoom is below the port-hiding threshold and the user presses where a port anchor lies on an unselected node
- **THEN** no port glyph is drawn there, the pick result contains no port, and the press does not start a connection

#### Scenario: Overview keeps what matters
- **WHEN** the zoom drops below the overview threshold in F-LARGE with one selected node, one selected connection, and one node in error
- **THEN** port glyphs are not drawn, while the selected node and connection are distinguishable and the error indicator is visible

### Requirement: Gesture bitmap reuse (SHOULD)
The view SHOULD offer an option, off by default, that during a pan or zoom gesture with a large visible set redraws the last painted scene frame translated and scaled to the current viewport instead of repainting every entity, and repaints exactly once the viewport has not changed for a short settle time. While the option is on, picking, selection and committed model changes SHALL behave exactly as without it, and any model change or selection change SHALL trigger an exact repaint. Reuse SHALL stay within a bounded zoom ratio and uncovered area; beyond either, the frame is exact.

#### Scenario: Option off by default
- **WHEN** a view is mounted without the option
- **THEN** every scene frame during pan and zoom is an exact repaint

#### Scenario: Settle repaint
- **WHEN** the option is on and a zoom gesture over F-LARGE at fit-all stops
- **THEN** the scene is repainted exactly within the settle time, and no further frames are requested afterwards

#### Scenario: Long continuous gesture
- **WHEN** the option is on and a zoom or pan continues without pause
- **THEN** exact frames are painted whenever the bounds are exceeded, so the view is never more than the bounded zoom ratio away from an exact frame

#### Scenario: Change during a gesture
- **WHEN** the option is on and a model change arrives during a pan
- **THEN** the next frame is an exact repaint that shows the change

### Requirement: Theme tokens and overrides
Each view instance SHALL accept theme tokens with per-type and per-entity overrides for colors, line widths, fonts, port shapes, selection, and diagnostics. No host CSS framework SHALL be required.

#### Scenario: Two themes on one model
- **WHEN** two views of one model use different themes
- **THEN** each paints with its own tokens and neither affects the other

### Requirement: Z-order and interactive order
The view SHALL define a default z-order for routes, nodes, ports, labels, groups, decorations, and overlays, with explicit overrides. Picking SHALL follow the documented interactive order.

#### Scenario: Override z-order
- **WHEN** a host configures connections to draw above nodes
- **THEN** connections paint above nodes and picking prefers them where they overlap

### Requirement: Body, painted, and hit bounds
The view SHALL distinguish body bounds, painted bounds, and hit bounds. Painted bounds SHALL include shadows, labels, arrowheads, and bundle lanes and SHALL be used for culling.

#### Scenario: Shadow outside body
- **WHEN** a node paints a shadow beyond its body
- **THEN** its painted bounds include the shadow and its hit bounds do not

### Requirement: Alignment and snap guides (SHOULD)
The library SHALL offer alignment, equal spacing, and snap guides as explicit undoable commands, and an external layout engine MAY propose a batch of positions as one change. Not an R1 release gate.

#### Scenario: Align left
- **WHEN** three selected nodes are aligned left
- **THEN** one patch moves them and one undo restores their positions

### Requirement: Asset service with host resolver
The view SHALL load node images through an asset service that resolves asset references via a host-provided resolver. Painters SHALL reference assets by ID and SHALL NOT load images themselves. The library SHALL NOT fetch any resource without a configured resolver.

#### Scenario: Painter draws an asset
- **WHEN** a painter requests asset `pump-symbol` in a rectangle
- **THEN** the service obtains it through the host resolver and draws it when ready

#### Scenario: No resolver configured
- **WHEN** no resolver is configured and a node references an asset
- **THEN** no network request is made and a missing-asset placeholder is drawn

### Requirement: Zoom-bucketed bitmap cache
The asset service SHALL rasterize vector (SVG) and raster (PNG, JPEG, WebP) assets into bitmaps per zoom-and-pixel-ratio bucket and reuse them across frames. While a sharper bucket is prepared, the nearest cached bitmap SHALL be drawn.

#### Scenario: Repeated frames reuse bitmaps
- **WHEN** a scene with 500 copies of one SVG symbol is panned
- **THEN** the SVG is rasterized once for the current bucket and frames only copy bitmaps

#### Scenario: Zoom crosses a bucket
- **WHEN** zoom moves into a new bucket
- **THEN** the previous bitmap is drawn scaled until the new one is ready, then the scene repaints sharp

### Requirement: Bounded asset memory
The bitmap cache SHALL be bounded and evict least-recently-used entries. Disposing a view SHALL release its cached bitmaps.

#### Scenario: Cache limit reached
- **WHEN** the cache exceeds its configured budget
- **THEN** the least recently drawn bitmaps are released first

### Requirement: Asset failure states
Missing, failed, or unsafe assets SHALL produce a visible bounded placeholder with a diagnostic and SHALL NOT trigger unbounded retries or alter the document.

#### Scenario: Asset load fails
- **WHEN** the resolver rejects an asset
- **THEN** affected nodes show a placeholder with a diagnostic and their payloads are unchanged

#### Scenario: Active SVG content
- **WHEN** an SVG asset contains scripts or external references and no safe host policy resolves it
- **THEN** it is rejected and a placeholder is drawn

### Requirement: Image-symbol node preset
The library SHALL ship an image-symbol node preset: a node drawn as a vector or raster picture with ports placed anywhere on its outline, supporting rotation and mirroring, and labeled independently of the picture.

#### Scenario: Rotated symbol with ports
- **WHEN** an image-symbol node with four outline ports is rotated a quarter turn
- **THEN** the picture, ports, and anchors rotate together and connections follow

### Requirement: Card node preset
The library SHALL ship a card node preset with a title, optional secondary label, and labeled ports in horizontal or vertical layout, as a secondary example built on the same geometry and painter contracts.

#### Scenario: Card with labeled ports
- **WHEN** a card node is created with two inputs and one output
- **THEN** it is drawn with a title and port labels and its ports are pickable

### Requirement: DOM overlay slot
The view SHALL provide a DOM overlay layer, aligned to the viewport transform, for focused editors, host menus, tooltips, and later React node bodies. An overlay element SHALL be anchorable to a world point, to a node, or to a fixed viewport point that stays in place while the view pans and zooms. Overlay content SHALL be created only on explicit mount and SHALL be removed on dispose. Host content in the overlay SHALL handle its own pointer and keyboard input: it SHALL NOT start graph gestures or run graph shortcuts and clipboard commands.

#### Scenario: Inline editor on a node
- **WHEN** the host opens a text editor overlay for a node
- **THEN** it appears at the node's screen position and is removed when closed or the view is disposed

#### Scenario: Menu fixed on screen
- **WHEN** a host attaches a menu element at the viewport position reported by a context-menu event and the user then zooms with the wheel
- **THEN** the menu stays at the same viewport position, and a click on one of its items starts no graph gesture

#### Scenario: Menu following the graph
- **WHEN** a host attaches a menu at the world position of a context-menu event and the user pans the view
- **THEN** the menu stays at that world position on screen

### Requirement: Presence overlay hook
The view SHALL provide a hook for drawing host-supplied presence data, such as remote cursors and selections, in world coordinates. Presence data SHALL NOT enter the model, patches, snapshots, or history.

#### Scenario: Remote cursor
- **WHEN** the host supplies a remote user's cursor position in world coordinates
- **THEN** it is drawn at that world position, follows pan and zoom, and no model change occurs
