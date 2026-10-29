# routing Specification

## Purpose

Defines connection paths: built-in route modes, the custom path contract, persistent manual
route constraints, obstacle-aware orthogonal routing, route outcomes, invalidation, and
decorations. Paths are presentation; they never change topology or application data.

## Requirements

### Requirement: ROU-01 Built-in route modes
The library SHALL supply straight, cubic-Bezier, and orthogonal route modes. Routing, path painting, labels and decorations, and picking SHALL be separately replaceable registrations.

#### Scenario: Switch route mode
- **WHEN** a connection's route mode changes from Bezier to orthogonal
- **THEN** its path is recomputed while its ID, endpoints, and painter stay unchanged

#### Scenario: Replace picker only
- **WHEN** a host registers a custom picker for one connection kind
- **THEN** the existing router and painter for that kind keep working unchanged

### Requirement: ROU-02 Custom path contract
A custom path SHALL provide finite bounds, renderer-neutral drawing data, endpoint tangents or normals as needed, and hit-testing with nearest-point support. No SVG-only or Canvas-only type SHALL be required in the headless model.

#### Scenario: Custom path is pickable
- **WHEN** a host registers a custom path that supplies bounds and nearest-point support
- **THEN** the path is culled, drawn, and selectable like a built-in path

#### Scenario: Missing picker contract
- **WHEN** a custom path omits bounds or nearest-point support
- **THEN** a diagnostic is reported instead of silently drawing an unselectable path

### Requirement: ROU-03 Persistent route constraints
Users SHALL be able to add manual waypoints and move orthogonal segments. User constraints SHALL be persisted separately from automatic route vertices and SHALL survive save, load, and endpoint movement.

#### Scenario: Waypoint survives reload
- **WHEN** a user locks a waypoint, the document is saved and reloaded
- **THEN** the waypoint is present and the automatic vertices are recomputed around it

#### Scenario: Endpoint moves
- **WHEN** a connected node moves after a segment was manually placed
- **THEN** the manual segment constraint is kept and only free segments adapt

### Requirement: ROU-04 Port escape and clearance
Routes SHALL leave and enter ports along the port's escape direction with configured clearance. Endpoint-local exceptions SHALL NOT allow a path through unrelated node interiors.

#### Scenario: Escape direction
- **WHEN** an orthogonal route starts at a port whose normal faces up
- **THEN** its first segment leaves upward for at least the clearance distance

### Requirement: ROU-05 Obstacle-aware orthogonal routing
The library SHALL provide obstacle-aware orthogonal routing, built in or as a packaged optional router satisfying the same contract. A route that could not avoid obstacles SHALL be explicitly marked and never advertised as obstacle-free.

#### Scenario: Route around a node
- **WHEN** an unrelated node lies on the straight line between two ports
- **THEN** the orthogonal route goes around it with clearance

#### Scenario: No clear path
- **WHEN** obstacles fully block every clear route
- **THEN** the route is drawn with a marked unresolved status

### Requirement: ROU-06 Route outcomes
Routing SHALL report complete, provisional, or unroutable outcomes. A routing failure SHALL NOT delete an accepted connection or change application data.

#### Scenario: Unroutable connection
- **WHEN** constraints make a connection unroutable
- **THEN** the connection stays in the model with an unroutable status and a fallback path is shown

### Requirement: ROU-07 Deterministic and stable routing
The built-in router SHALL produce identical output for identical inputs and options, SHALL preserve unaffected locked constraints, and SHALL favor stability of existing routes while nodes move.

#### Scenario: Repeat routing
- **WHEN** the same graph and options are routed twice
- **THEN** both results are identical

### Requirement: ROU-08 Bounded route invalidation
Moving a node SHALL invalidate its incident routes and only those non-incident routes intersecting the moved obstacle's old or new expanded bounds. Unrelated routes SHALL NOT recompute on every pointer event.

#### Scenario: Move one obstacle
- **WHEN** a node is dragged across a dense graph
- **THEN** only incident routes and routes crossing its old or new expanded bounds are recomputed

### Requirement: ROU-09 Decorations without policy
Path painting SHALL support labels, arrowheads, dashed lines, multiple lanes, and diagnostic decorations without embedding connection policy in the painter. Expanded painted bounds SHALL participate in culling.

#### Scenario: Restyle a connection
- **WHEN** a connection is given a dashed style, an arrowhead, and a label
- **THEN** its bindings and policy outcome are unchanged and its painted bounds include the label and arrowhead

### Requirement: ROU-10 Bounded asynchronous routing
If routing runs asynchronously, pending work SHALL be bounded and superseded or out-of-order results SHALL be discarded by route and scene revision. Routing failure SHALL NOT block pan, pick, or cancel.

#### Scenario: Late result discarded
- **WHEN** a route result for an older scene revision arrives after a newer one was applied
- **THEN** the older result is discarded

#### Scenario: Router failure keeps editor usable
- **WHEN** the router rejects or times out
- **THEN** panning, picking, and cancelling still work and the route shows a failure status

### Requirement: ROU-12 Route-only edits keep topology
Route edits and path recomputation SHALL be presentation changes only. They SHALL NOT change connection identity, endpoints, or application payloads, and SHALL NOT invoke host application-data commands implicitly (CON-08).

#### Scenario: Move a segment
- **WHEN** a user moves an orthogonal segment and the change commits
- **THEN** the patch contains only route-constraint changes for that connection

### Requirement: ROU-11 Segment snapping, label placement, and crossing styles (SHOULD)
The library SHALL offer snap-to-segment, edge-label positioning, and configurable crossing or bridge styles, independent of junction semantics. This is not an R1 release gate.

#### Scenario: Bridge at crossing
- **WHEN** a bridge crossing style is enabled and two unrelated paths cross
- **THEN** a bridge is drawn and no junction is created
