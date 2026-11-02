# routing Specification

## Purpose

Defines connection paths: built-in route modes, the custom path contract, persistent manual
route constraints, obstacle-aware orthogonal routing, route outcomes, invalidation, and
decorations. Paths are presentation; they never change topology or application data.

## Requirements

### Requirement: Built-in route modes
The library SHALL supply straight, cubic-Bezier, and orthogonal route modes. Routing, path painting, labels and decorations, and picking SHALL be separately replaceable registrations. A connection's route SHALL be selected by its connection kind; a kind without a registration SHALL use the default route, which is Bezier unless the host configures another.

#### Scenario: Switch route mode
- **WHEN** the route registered for a connection kind changes from Bezier to orthogonal
- **THEN** the paths of that kind are recomputed while their IDs, endpoints, and painter stay unchanged, no patch or history entry is created, and connections of other kinds are not recomputed

#### Scenario: Replace picker only
- **WHEN** a host registers a custom picker for one connection kind
- **THEN** the existing router and painter for that kind keep working unchanged

#### Scenario: Default route unchanged
- **WHEN** a host registers no route at all
- **THEN** every connection is drawn with the cubic-Bezier route as before

### Requirement: Orthogonal route shape
An orthogonal route SHALL consist of horizontal and vertical segments and SHALL use the fewest bends that satisfy port escape and endpoint-node clearance, then the shortest length. Aligned ports facing each other SHALL get one straight segment, offset facing ports an S-shape with its middle segment halfway between them, ports facing the same way a U-shape, and perpendicular ports an L-shape where escape allows.

#### Scenario: Aligned facing ports
- **WHEN** an output port facing right and an input port facing left lie on the same horizontal line, the input to the right of the output
- **THEN** the route is one horizontal segment with no bend

#### Scenario: Offset facing ports
- **WHEN** an output port facing right at (0, 0) connects to an input port facing left at (200, 80)
- **THEN** the route has two bends and its vertical middle segment lies at x = 100

#### Scenario: Ports facing the same way
- **WHEN** two ports both face right and their nodes do not overlap vertically
- **THEN** the route leaves both ports to the right, joins them with one vertical segment beyond the farther port's clearance, and has two bends

#### Scenario: Perpendicular ports
- **WHEN** a port facing right connects to a port facing up that lies to the right of and below it by more than the clearance
- **THEN** the route has one bend

#### Scenario: Rotated node
- **WHEN** the source node is rotated by one quarter turn so that its output port faces down
- **THEN** the route's first segment leaves that port downward

### Requirement: Orthogonal route clear of its endpoint nodes
An orthogonal route SHALL NOT pass through the body of either of its endpoint nodes, except for the escape segment at that node's own port. When the target lies behind the source port, the route SHALL go around both endpoint nodes, or between them when they are separated by the clearance on both sides, choosing the shorter route with a fixed tie-break. Nodes other than the endpoint nodes SHALL NOT be obstacles for this route.

#### Scenario: Backwards wire goes around
- **WHEN** an output port facing right connects to an input port facing left on a node to the left of the source node, and the two nodes overlap vertically
- **THEN** the route passes above or below both nodes, whichever is shorter, and crosses neither node's body

#### Scenario: Equal detours
- **WHEN** the route above and the route below both endpoint nodes have the same bends and length
- **THEN** the route above is chosen, every time

#### Scenario: Backwards wire between separated nodes
- **WHEN** a backwards wire connects two nodes whose bodies are apart vertically by more than twice the clearance
- **THEN** the route runs between the two nodes instead of around them

#### Scenario: Connection to the same node
- **WHEN** a node's right-facing output is connected to its own left-facing input
- **THEN** the route goes around that node and does not cross its body

#### Scenario: Unrelated node in the way
- **WHEN** an unrelated node lies across the route between two endpoint nodes
- **THEN** the route crosses that node unchanged and its outcome is clear of the endpoint nodes only, never of all obstacles

### Requirement: Escape direction fallback and end-order independence
An orthogonal route SHALL use each port's outward normal as its escape direction, snapped to the nearer axis with horizontal winning a tie. A zero or non-finite normal SHALL use the outward direction of the nearest side of the node's body, and failing that the dominant axis toward the other end. The route SHALL NOT depend on port direction or on which endpoint is stored first.

#### Scenario: Diagonal normal
- **WHEN** a port's outward normal points 30 degrees below the positive x axis
- **THEN** the route leaves that port horizontally to the right

#### Scenario: Zero normal
- **WHEN** a port's geometry supplies a zero normal and the anchor lies on the top side of its node's body
- **THEN** the route leaves that port upward and every coordinate is finite

#### Scenario: Swapped ends
- **WHEN** an undirected connection's two endpoints are stored in the opposite order
- **THEN** its route has the same vertices in reverse order

#### Scenario: Coincident anchors
- **WHEN** a connection's two anchors are at the same world point
- **THEN** routing, bounds and picking complete with finite values

### Requirement: Sharp or rounded corners
Orthogonal corners SHALL be sharp by default. A configurable corner radius SHALL round them with circular arcs that fit within the adjacent segments, and painting, picking, bounds and culling SHALL use the same rounded path.

#### Scenario: Sharp by default
- **WHEN** an orthogonal route is registered without a corner radius
- **THEN** every corner of its path is a sharp 90-degree vertex

#### Scenario: Pick on a rounded corner
- **WHEN** a route has a corner radius of 10 and the pointer is on the arc, 3 world units inside the sharp corner point
- **THEN** the pick measures the distance to the arc, not to the sharp corner

#### Scenario: Radius larger than a segment
- **WHEN** the corner radius exceeds half of a segment next to that corner
- **THEN** the arc is reduced so that neighbouring arcs do not overlap and the path stays continuous

### Requirement: Routes in previews
Drag previews that move or resize nodes SHALL route incident connections with the route of each connection's kind. A connection-drag preview SHALL use the default route, because the connection's kind is decided only at commit.

#### Scenario: Move preview keeps the orthogonal shape
- **WHEN** a node with an incident connection of an orthogonal kind is dragged
- **THEN** the preview draws that connection orthogonally to the dragged anchor on every frame

#### Scenario: Connection drag with a Bezier default
- **WHEN** the default route is Bezier, a kind is registered orthogonal, and the user drags a new connection
- **THEN** the provisional path is a Bezier curve, and once committed as that kind the connection is drawn orthogonally

### Requirement: Custom path contract
A custom path SHALL provide finite bounds, renderer-neutral drawing data, endpoint tangents or normals as needed, and hit-testing with nearest-point support. No SVG-only or Canvas-only type SHALL be required in the headless model.

#### Scenario: Custom path is pickable
- **WHEN** a host registers a custom path that supplies bounds and nearest-point support
- **THEN** the path is culled, drawn, and selectable like a built-in path

#### Scenario: Missing picker contract
- **WHEN** a custom path omits bounds or nearest-point support
- **THEN** a diagnostic is reported instead of silently drawing an unselectable path

### Requirement: Persistent route constraints
Users SHALL be able to add manual waypoints and move orthogonal segments. User constraints SHALL be persisted separately from automatic route vertices and SHALL survive save, load, and endpoint movement.

#### Scenario: Waypoint survives reload
- **WHEN** a user locks a waypoint, the document is saved and reloaded
- **THEN** the waypoint is present and the automatic vertices are recomputed around it

#### Scenario: Endpoint moves
- **WHEN** a connected node moves after a segment was manually placed
- **THEN** the manual segment constraint is kept and only free segments adapt

### Requirement: Port escape and clearance
Routes SHALL leave and enter ports along the port's escape direction with configured clearance. The clearance SHALL be configurable per route registration. When two ports face each other closer than twice the clearance, both escape segments SHALL be shortened to half their distance. Endpoint-local exceptions SHALL NOT allow a path through unrelated node interiors.

#### Scenario: Escape direction
- **WHEN** an orthogonal route starts at a port whose normal faces up
- **THEN** its first segment leaves upward for at least the clearance distance

#### Scenario: Clearance per route registration
- **WHEN** one connection kind is registered orthogonal with a clearance of 40 world units and another with the default clearance
- **THEN** routes of the first kind leave and enter their ports for at least 40 world units and routes of the second kind for the default clearance

#### Scenario: Close facing ports
- **WHEN** a right-facing output and a left-facing input face each other 16 world units apart, vertically offset, with a clearance of 20
- **THEN** the route is an S-shape whose middle segment lies 8 world units from each port

### Requirement: Obstacle-aware orthogonal routing
The library SHALL provide obstacle-aware orthogonal routing, built in or as a packaged optional router satisfying the same contract. A route that could not avoid obstacles SHALL be explicitly marked and never advertised as obstacle-free.

#### Scenario: Route around a node
- **WHEN** an unrelated node lies on the straight line between two ports
- **THEN** the orthogonal route goes around it with clearance

#### Scenario: No clear path
- **WHEN** obstacles fully block every clear route
- **THEN** the route is drawn with a marked unresolved status

### Requirement: Route outcomes
Routing SHALL report complete, provisional, or unroutable outcomes, together with the obstacles the route is clear of: nothing, or the connection's own endpoint nodes. A route SHALL NOT be reported clear of obstacles it was not checked against. A routing failure SHALL NOT delete an accepted connection or change application data.

#### Scenario: Unroutable connection
- **WHEN** constraints make a connection unroutable
- **THEN** the connection stays in the model with an unroutable status and a fallback path is shown

#### Scenario: Overlapping endpoint nodes
- **WHEN** the two endpoint nodes of an orthogonal connection overlap so that no orthogonal candidate avoids both bodies
- **THEN** the best candidate is drawn as the fallback path, the outcome is unroutable and clear of nothing, and the model is unchanged

#### Scenario: Outcome scope of built-in routes
- **WHEN** straight, Bezier and orthogonal routes are computed for connections that do not cross their endpoint nodes
- **THEN** the straight and Bezier outcomes are complete and clear of nothing, and the orthogonal outcome is complete and clear of the endpoint nodes

### Requirement: Deterministic and stable routing
The built-in router SHALL produce identical output for identical inputs and options, SHALL preserve unaffected locked constraints, and SHALL favor stability of existing routes while nodes move.

#### Scenario: Repeat routing
- **WHEN** the same graph and options are routed twice
- **THEN** both results are identical

### Requirement: Bounded route invalidation
Moving a node SHALL invalidate its incident routes and only those non-incident routes intersecting the moved obstacle's old or new expanded bounds. Unrelated routes SHALL NOT recompute on every pointer event.

#### Scenario: Move one obstacle
- **WHEN** a node is dragged across a dense graph
- **THEN** only incident routes and routes crossing its old or new expanded bounds are recomputed

### Requirement: Decorations without policy
Path painting SHALL support labels, arrowheads, dashed lines, multiple lanes, and diagnostic decorations without embedding connection policy in the painter. Expanded painted bounds SHALL participate in culling.

#### Scenario: Restyle a connection
- **WHEN** a connection is given a dashed style, an arrowhead, and a label
- **THEN** its bindings and policy outcome are unchanged and its painted bounds include the label and arrowhead

### Requirement: Bounded asynchronous routing
If routing runs asynchronously, pending work SHALL be bounded and superseded or out-of-order results SHALL be discarded by route and scene revision. Routing failure SHALL NOT block pan, pick, or cancel.

#### Scenario: Late result discarded
- **WHEN** a route result for an older scene revision arrives after a newer one was applied
- **THEN** the older result is discarded

#### Scenario: Router failure keeps editor usable
- **WHEN** the router rejects or times out
- **THEN** panning, picking, and cancelling still work and the route shows a failure status

### Requirement: Route-only edits keep topology
Route edits and path recomputation SHALL be presentation changes only. They SHALL NOT change connection identity, endpoints, or application payloads, and SHALL NOT invoke host application-data commands implicitly.

#### Scenario: Move a segment
- **WHEN** a user moves an orthogonal segment and the change commits
- **THEN** the patch contains only route-constraint changes for that connection

### Requirement: Segment snapping, label placement, and crossing styles (SHOULD)
The library SHALL offer snap-to-segment, edge-label positioning, and configurable crossing or bridge styles, independent of junction semantics. This is not an R1 release gate.

#### Scenario: Bridge at crossing
- **WHEN** a bridge crossing style is enabled and two unrelated paths cross
- **THEN** a bridge is drawn and no junction is created
