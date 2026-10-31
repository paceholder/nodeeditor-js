# geometry Specification

## Purpose

Defines coordinate spaces, transforms, node and port geometry, spatial indexing, and
two-phase hit-testing. Geometry lives in core so painting, picking, anchors, and culling
share one headless, testable contract.

## Requirements

### Requirement: GEO-01 Named coordinate spaces
Public geometry and input contracts SHALL name node-local, world, viewport CSS-pixel, and device-pixel spaces, and SHALL provide conversion and inverse conversion operations between them.

#### Scenario: Round trip between spaces
- **WHEN** a world point is converted to viewport CSS pixels and back at any supported zoom and pan
- **THEN** the result equals the original point within floating-point tolerance

#### Scenario: Device pixels at DPR 2
- **WHEN** the device pixel ratio is 2
- **THEN** a viewport CSS-pixel point converts to device pixels with coordinates doubled and the inverse restores it

### Requirement: GEO-02 One transform convention
Node drawing, bounds, port anchor positions and normals, and hit tests SHALL use one documented transform convention. Persisted geometry SHALL be stored in world or node-local values, never rounded screen positions.

#### Scenario: Persisted values are world values
- **WHEN** a node is moved at fractional zoom and the model is snapshotted
- **THEN** the stored position is a world coordinate independent of zoom and not rounded to screen pixels

### Requirement: GEO-02a Shared node transform
Movement, quarter-turn rotation, and horizontal mirroring of a node SHALL be expressed as one node transform applied identically to painting, bounds, port anchors, anchor normals, and hit shapes (NOD-04).

#### Scenario: Rotated non-square node
- **WHEN** a 25-by-49 node is rotated by each quarter turn with and without mirroring
- **THEN** for every state the painted outline, hit shape, transformed bounds, and port anchors coincide and anchor normals rotate with the node

#### Scenario: Mirrored anchor normal
- **WHEN** a node whose port faces right is mirrored horizontally
- **THEN** the port's anchor moves to the mirrored position and its normal faces left

### Requirement: GEO-02b Node geometry contract
A node geometry SHALL supply body bounds, a precise hit shape, and port anchor positions with outward normals in node-local space, independently of the painter. Ports MAY be placed anywhere on or inside the outline (NOD-02, NOD-03).

#### Scenario: Custom port positions
- **WHEN** a geometry places three ports at arbitrary points on a non-rectangular outline
- **THEN** anchor queries return those points transformed to world space with their normals

#### Scenario: Node without ports
- **WHEN** a geometry declares no ports
- **THEN** the node is valid, paintable, and pickable

### Requirement: GEO-03 Correct under layout and display changes
Coordinate conversion SHALL remain correct under page scroll, nested container offsets, container resize, fractional zoom, high-DPI displays, and moving the window between displays with different pixel ratios.

#### Scenario: Scrolled page with nested offsets
- **WHEN** the editor sits inside a scrolled page and an offset container and the user clicks a port
- **THEN** the pointer resolves to that port's world position

#### Scenario: Pixel ratio change
- **WHEN** the device pixel ratio changes while the editor is mounted
- **THEN** subsequent conversions and hit tests use the new ratio without remount

### Requirement: GEO-04 Two-phase hit-testing
Picking SHALL run a broad-phase bounds query followed by precise shape or distance tests, supporting non-rectangular nodes, thin and custom paths, bundled lanes, and paths whose endpoints are off-screen.

#### Scenario: Click inside bounds but outside shape
- **WHEN** the pointer is inside a diamond node's bounding box but outside the diamond
- **THEN** the node is not hit

#### Scenario: Path with off-screen endpoints
- **WHEN** a connection crosses the viewport with both endpoints outside it and the user clicks its visible segment
- **THEN** the connection is hit

### Requirement: GEO-04a Hit result identity and order
A hit result SHALL identify the entity kind and ID, and for bundled paths whether the assembly or a specific member was hit. Overlapping candidates SHALL be ordered deterministically by documented interactive order (VIS-02).

#### Scenario: Port over node body
- **WHEN** the pointer is over a port glyph drawn on top of its node
- **THEN** the first hit is the port and the node follows it in the candidate list

#### Scenario: Coincident paths
- **WHEN** two parallel connections share the same path under the pointer
- **THEN** both are returned in a deterministic order so a chooser can disambiguate them

### Requirement: GEO-05 Screen-space tolerances
Capture and hit tolerances configured in screen space SHALL be expressed in CSS pixels and SHALL NOT scale with graph zoom or device pixel ratio.

#### Scenario: Port capture radius at different zooms
- **WHEN** the port capture radius is 8 CSS pixels and the zoom changes from 0.5 to 4
- **THEN** the capture area stays 8 CSS pixels on screen

### Requirement: GEO-06 Finite ranges and degenerate inputs
The library SHALL document supported finite coordinate and zoom ranges and SHALL reject non-finite values and non-invertible transforms. Empty graphs, coincident anchors, and zero-size containers SHALL NOT produce NaN transforms or crashes.

#### Scenario: Zero-size container
- **WHEN** a view is mounted in a container of size zero
- **THEN** no transform contains NaN and the view waits for measurable bounds

#### Scenario: Zoom outside range
- **WHEN** a caller requests a zoom of zero or beyond the documented maximum
- **THEN** the request is rejected or clamped as documented and the transform stays invertible

#### Scenario: Coincident anchors
- **WHEN** a connection's two anchors are at the same world point
- **THEN** routing, bounds, and hit tests complete without NaN

### Requirement: IDX-01 Spatial index contract
Core SHALL provide a spatial index behind a documented interface supporting insert, remove, update, rectangle query, and point query over world-space bounds, with no third-party dependency. Implementations SHALL be swappable without changing callers.

#### Scenario: Rectangle query
- **WHEN** the index holds 10k node bounds and a viewport rectangle is queried
- **THEN** exactly the entries intersecting that rectangle are returned

#### Scenario: Alternative implementation
- **WHEN** a test substitutes a brute-force implementation of the index interface
- **THEN** culling and picking results are identical

### Requirement: IDX-02 Incremental index updates
Moving, adding, or removing an entity SHALL update only its own index entries. Ordinary node movement SHALL NOT rebuild the whole index (PERF-04).

#### Scenario: Drag one node
- **WHEN** one node moves during a drag
- **THEN** only that node's entry and the entries of its incident routes are updated

### Requirement: IDX-03 Indexed culling by painted bounds
Visibility culling SHALL query painted bounds (including shadows, labels, arrowheads, and lanes), so partially visible entities and paths crossing the viewport are drawn while fully off-screen entities are skipped (VIS-03). For a path, the culling bounds SHALL be the union of its per-segment boxes, each grown by the painted margin, so a path is culled when none of its segment boxes intersects the viewport, even if its overall bounding box does.

#### Scenario: Label extends into viewport
- **WHEN** a node's body is off-screen but its label's painted bounds intersect the viewport
- **THEN** the node is included in the draw set

#### Scenario: S-curve beside the viewport
- **WHEN** an S-shaped connection's overall bounding box touches the viewport but its stroke, and every one of its margin-grown segment boxes, lies outside it
- **THEN** the connection is not included in the draw set

### Requirement: IDX-04 Deterministic index results
Index query results consumed for painting or picking SHALL be returned in, or sorted into, a deterministic order independent of insertion history (MOD-08).

#### Scenario: Same graph, different insertion order
- **WHEN** two indexes receive the same entries in different orders
- **THEN** the same query yields the same ordered result
