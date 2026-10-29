# graph-model Specification

## Purpose

Defines the headless graph/view model: entities, identity, structural integrity, indexed
queries, deterministic ordering, and read snapshots. It is usable in Node without a renderer
and is the read model every view projects from.

## Requirements

### Requirement: Headless in-memory model
The library SHALL provide an in-memory graph/view model usable headlessly in JavaScript, with create, inspect, update, and delete operations on nodes, ports, and connections. Attaching a renderer SHALL be optional.

#### Scenario: Edit a graph in Node without a view
- **WHEN** a script running in Node creates a model, adds two nodes, connects them, and deletes one node
- **THEN** every operation succeeds without DOM or browser globals and the model reports one node and no connections

#### Scenario: Attach a view later
- **WHEN** a view is mounted on a model that was populated headlessly
- **THEN** the view renders the existing entities without rebuilding the graph in another model

### Requirement: Stable identities
Nodes, ports, connections, groups, members, and provided values SHALL have opaque string identities that are never derived from labels, array positions, or screen positions. Relabeling or reordering SHALL NOT retarget references.

#### Scenario: Reorder ports keeps attachments
- **WHEN** a node's ports are reordered and renamed while connections are attached
- **THEN** every connection still references the same port IDs as before

### Requirement: Identifier generation
The local document SHALL mint IDs through a pluggable generator. The default generator SHALL produce per-document counters with a type prefix (for example `n1`, `p1`, `c1`) and SHALL persist its high-water mark so a deleted ID is never reused for a different entity. Undo MAY restore an entity with its original ID.

#### Scenario: Deleted IDs are not reused
- **WHEN** node `n3` is deleted and a new node is created
- **THEN** the new node receives an ID other than `n3`

#### Scenario: High-water mark survives save and load
- **WHEN** a document whose highest node ID is `n9` (with `n9` deleted) is saved, loaded, and a node is created
- **THEN** the new node's ID is not `n9` or any earlier node ID

#### Scenario: Host-supplied generator
- **WHEN** a host configures a generator that returns UUID strings
- **THEN** new entities receive IDs from that generator and the library never parses or orders them numerically

#### Scenario: Undo restores identity
- **WHEN** a node is deleted and the deletion is undone
- **THEN** the restored node has its original ID and its connections reference it again

### Requirement: Separated state categories
The model SHALL distinguish application payloads, durable view data (placement, size, rotation, mirroring, groups, route constraints), ephemeral interaction state, and derived caches. Ephemeral previews and caches SHALL NOT appear in snapshots or saved documents.

#### Scenario: Preview excluded from snapshot
- **WHEN** a drag preview is active and a snapshot is taken
- **THEN** the snapshot contains the committed positions only

### Requirement: Consistent change notification
The model SHALL apply each accepted change atomically and SHALL notify observers only after the whole change is internally consistent. Subscribers SHALL NOT observe a connection referencing a missing endpoint during a successful batch.

#### Scenario: Delete node with connections
- **WHEN** a node with three incident connections is deleted in one change
- **THEN** subscribers receive one notification after the node and all three connections are gone

### Requirement: Indexed queries
The model SHALL answer lookups by entity ID, connections incident to a node, connections attached to a port, and neighbor nodes without scanning all connections.

#### Scenario: Attachment query cost is independent of graph size
- **WHEN** the connections attached to one port are queried in a graph with 20k connections
- **THEN** the query visits only the index entries for that port

### Requirement: Deterministic ordering
The model SHALL define explicit, deterministic ordering for node paint order, port presentation order, selection tie-breaks, and snapshot serialization. Ordering SHALL NOT depend on incidental Map or object iteration order.

#### Scenario: Same edits, same order
- **WHEN** the same sequence of edits is applied to two fresh models
- **THEN** their snapshots serialize to identical JSON

#### Scenario: Explicit reorder
- **WHEN** a node is brought to front
- **THEN** paint order changes through an explicit change visible in the patch, not as a side effect of re-insertion

### Requirement: Structured structural errors
The model SHALL report malformed IDs, duplicate IDs, non-finite geometry, dangling endpoints, and invalid changes as structured errors with a code, message, and affected entity IDs. An invalid local mutation SHALL be rejected before the document changes.

#### Scenario: Dangling endpoint rejected
- **WHEN** a change adds a connection to a port that does not exist
- **THEN** the result is a rejection with code for a dangling endpoint naming the missing port, and the model is unchanged

#### Scenario: Non-finite position rejected
- **WHEN** a change sets a node position to NaN or Infinity
- **THEN** the change is rejected and the node keeps its previous position

### Requirement: Structural integrity versus application validity
Structurally safe state that violates application rules (for example an unresolved required value) SHALL remain loadable and inspectable with diagnostics. Structural errors (duplicate IDs, dangling endpoints) SHALL be rejected rather than silently retargeted or dropped.

#### Scenario: Application-invalid graph stays inspectable
- **WHEN** a snapshot contains a connection that the current policy would not allow for a new edit
- **THEN** the snapshot loads, the connection is kept, and a diagnostic names it

### Requirement: Independent views of one model
Several views SHALL be able to display the same model with independent viewport, hover, local selection, detail level, and theme. History SHALL belong to the model adapter, not to individual views.

#### Scenario: Pan in one view only
- **WHEN** two views share a model and the user pans the first
- **THEN** the second view's viewport is unchanged

#### Scenario: Edit visible in both views
- **WHEN** a node is moved through either view
- **THEN** both views show the new position and one history entry exists

### Requirement: Capabilities and read-only mode
The model SHALL support read-only viewing and per-entity, per-action capabilities. Capabilities SHALL be enforced by model commands as well as by UI gestures. Read-only mode SHALL NOT disable pan, zoom, inspection, or permitted selection. View-local restrictions MAY narrow but SHALL NOT relax adapter permissions.

#### Scenario: Locked node via API
- **WHEN** a program submits a move command for a node whose move capability is denied
- **THEN** the command is rejected with a capability reason and the node does not move

#### Scenario: Read-only still navigable
- **WHEN** a view is read-only
- **THEN** pan, zoom, selection, and inspection keep working while every edit command reports unavailable

### Requirement: Immutable read snapshots
Values returned by reads and subscriptions SHALL be typed as deep-readonly and SHALL NOT expose writable references to committed state. In development and test builds they SHALL be frozen so accidental writes fail; production builds MAY skip freezing.

#### Scenario: Write attempt in development build
- **WHEN** code in a development build assigns to a property of a node returned by a read
- **THEN** the assignment throws and the model is unchanged

#### Scenario: Snapshot lifetime
- **WHEN** a caller keeps a snapshot and the model later changes
- **THEN** the kept snapshot still shows the old state and the model shows the new state
