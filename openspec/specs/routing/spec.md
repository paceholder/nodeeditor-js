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

### Requirement: Route constraint data
A connection SHALL be able to carry an ordered list of route constraints in world coordinates, stored separately from the automatic route vertices and listed from the connection's `from` end to its `to` end. The first constraint kind SHALL be a pinned segment: a horizontal or vertical segment at a fixed coordinate. Constraints SHALL be part of the durable view data: validated on load, kept in snapshots and saved documents, restored by undo and redo, and copied with the connection. A router SHALL receive the constraints of the connection it routes; a router that does not use a constraint SHALL ignore it and the constraint SHALL stay stored.

#### Scenario: Pinned segment survives reload
- **WHEN** a connection with a pinned vertical segment at x = 120 is saved and the document is loaded again
- **THEN** the loaded connection has the same pinned segment and its route passes along x = 120

#### Scenario: Invalid constraint rejected on load
- **WHEN** a snapshot holds a connection whose route constraint has a non-finite coordinate or an unknown constraint kind
- **THEN** loading fails with a validation error naming that connection

#### Scenario: Route kind ignores constraints
- **WHEN** a connection with a pinned segment is routed by a Bezier route
- **THEN** it is drawn as the Bezier curve and its pinned segment is still in the model

### Requirement: Pluggable route editors
Pointer mechanics for editing a route SHALL be a registration per connection kind, independent of the router, the path painter and other tools. A route editor SHALL define the handles it offers on a connection, how a press finds a handle, the constraints a drag produces, and what a double-click on a handle does. A connection whose kind has no editor SHALL behave as before: a press selects it and a drag does nothing. The library SHALL supply an orthogonal segment editor.

#### Scenario: Kind without an editor
- **WHEN** a selected connection's kind has no route editor and the user drags from it
- **THEN** no route edit starts and the model is unchanged

#### Scenario: Editor replaced
- **WHEN** a host registers its own route editor for an orthogonal kind
- **THEN** presses on that kind's connections use the host editor, and its router and painter are unchanged

### Requirement: Orthogonal segment drag
With the orthogonal segment editor, each segment of a selected orthogonal connection SHALL be draggable perpendicular to its direction, with a square grip drawn on it and a resize cursor while hovered. Dragging the first or last segment SHALL keep the port stub (the escape segment of the port escape and clearance rule) fixed and add a step after it. Dragging SHALL preview the re-routed connection and on release commit one route edit: the dragged segment becomes a pinned segment at its new coordinate, and earlier pins of the connection are kept. The orthogonal router SHALL route through the pins in order and adapt only free segments, adding bends when a pin cannot be reached otherwise, and SHALL report which path segment realizes each pin. Routing with pins SHALL be deterministic and independent of end order. A drag cancelled with Escape SHALL leave the model unchanged.

#### Scenario: Move a middle segment
- **WHEN** the user drags the vertical middle segment of a selected S-shaped orthogonal connection 40 units to the right and releases
- **THEN** one history entry is added, the patch updates only that connection's route constraints, and the segment is drawn 40 units to the right

#### Scenario: Endpoint moves after a pin
- **WHEN** a connected node moves after a segment was pinned
- **THEN** the pinned segment keeps its coordinate and only the free segments adapt

#### Scenario: Pin behind the target
- **WHEN** a node moves so that a pinned vertical segment lies beyond the target port
- **THEN** the route still passes along the pinned segment, with extra bends to reach the target from its escape direction

#### Scenario: End segment drag keeps the stub
- **WHEN** the user drags the first segment of a selected orthogonal connection sideways
- **THEN** the route still leaves the port along its escape direction for at least the clearance, then steps to the dragged segment

#### Scenario: Straight wire becomes editable
- **WHEN** the user drags the only segment of a straight orthogonal connection sideways
- **THEN** the route steps out from both port stubs to the dragged segment

#### Scenario: Undo a segment move
- **WHEN** the user moves a segment and then undoes
- **THEN** the connection's constraints and route are as before the drag

### Requirement: Freeing and resetting a route
Double-clicking a pinned segment with the orthogonal segment editor SHALL remove that pin in one history entry. A reset-route command SHALL remove all constraints of the selected connections in one history entry and SHALL be unavailable when none of them has constraints.

#### Scenario: Double-click frees a segment
- **WHEN** the user double-clicks a pinned segment
- **THEN** its pin is removed, other pins of the connection stay, and the free part takes the automatic shape

#### Scenario: Reset route
- **WHEN** two selected connections have pins and the reset-route command runs
- **THEN** both connections lose all constraints in one history entry

### Requirement: Constraints follow copies and whole moves
Paste and duplicate SHALL shift copied pinned segments by the placement offset along their coordinate axis. A move command that moves both endpoint nodes of a connection SHALL shift that connection's pins by the same offset in the same patch; a move of only one endpoint SHALL keep them.

#### Scenario: Duplicate keeps the shape
- **WHEN** two connected nodes and their connection with a pinned segment are duplicated
- **THEN** the copy's pinned segment is shifted by the duplicate offset and the copy has the same shape as the original

#### Scenario: Moving both ends
- **WHEN** both endpoint nodes of a connection with a pinned vertical segment are moved 50 units right in one gesture
- **THEN** the pin moves 50 units right in the same history entry

### Requirement: Adding bends to an orthogonal route
With the orthogonal segment editor, each segment long enough on screen SHALL show a diamond handle next to its square grip. Dragging the diamond SHALL break the segment at the handle into a step: the part before the handle stays, a new perpendicular segment appears at the handle, and the part after it follows the pointer, adding two bends in one history entry. Repeated breaks SHALL be able to produce any orthogonal path between the two port stubs.

#### Scenario: Break a segment
- **WHEN** the user drags the diamond of a horizontal segment 30 units down and releases
- **THEN** the route has two more bends, the part of the segment after the handle lies 30 units lower, and one history entry is added

#### Scenario: Short segment has no diamond
- **WHEN** a segment is too short on screen for both handles
- **THEN** only its square grip is shown

### Requirement: Redundant pins removed
When a route edit commits, the editor SHALL drop every pin whose removal leaves the routed path unchanged, such as a segment dragged into line with its neighbours or back to the automatic shape. A commit whose remaining constraints equal the previous ones SHALL add no history entry.

#### Scenario: Drag into line removes the bends
- **WHEN** the user drags the middle segment of a step until the step's two outer segments are in line, and releases
- **THEN** the pins of that step are removed and the route has two fewer bends

#### Scenario: Drag back to the start
- **WHEN** the user drags a free segment and returns it to its starting position before release
- **THEN** no pin is stored and no history entry is added
