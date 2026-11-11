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

### Requirement: Every port keeps an owning node
A port record names its owning node, and the node lists its ports. A patch (add, remove and update operations applied together or not at all) SHALL be rejected with `dangling-reference`, changing nothing, when its result leaves a port its named node does not list, including a port dropped from the node's `ports` field without its own remove. The store's consistency check after a commit SHALL detect the same.

#### Scenario: Dropping a port from the list without removing it
- **WHEN** node `a` lists ports `p1` and `p2`, and a patch updates `a.ports` from `[p1, p2]` to `[p1]` without removing `p2`
- **THEN** the patch is rejected with `dangling-reference` naming `a` and `p2`, and `p2` is unchanged

#### Scenario: Dropping and removing the port together
- **WHEN** a patch updates `a.ports` to `[p1]` and also removes port `p2`
- **THEN** the patch is accepted and no port names `a` without being listed by it

### Requirement: Capabilities are judged before the patch
A capability is a permission for an action on a node (move, resize, rotate, mirror, edit, connect, disconnect, delete), resolved from read-only mode, the host policy, the node's own override, its type's default and the library default. Every operation of a locally submitted patch SHALL be judged against the node as it was before the patch, whatever other operations or fields of the same patch change. A node added by the same patch SHALL be judged as it is staged.

#### Scenario: Changing to an unlocked type does not unlock the move
- **WHEN** a node's type declares `edit: false` and `move: false`, and one operation changes the node to a type without locks and moves it
- **THEN** the patch is rejected with `capability-denied`

#### Scenario: Clearing an override in another operation does not unlock the move
- **WHEN** a node has the override `move: false`, and one patch holds one operation that clears the override and another that moves the node
- **THEN** the patch is rejected with `capability-denied`, as it is when both changes are in one operation

### Requirement: Update fields are the record's own fields
An update operation names fields to change with their old and new values. Only the record kind's own mutable field names SHALL be accepted; a name inherited from the object prototype (such as `__proto__`, `constructor` or `toString`) SHALL be rejected with `malformed-record`, and no caller-supplied key SHALL replace the prototype of a stored object.

#### Scenario: A prototype key in update fields
- **WHEN** an update's fields are parsed from the JSON text `{"__proto__":{"old":{},"new":{"title":"x"}}}`
- **THEN** the patch is rejected with `malformed-record` and the stored node keeps a plain prototype and no title

#### Scenario: A prototype key in a patch ID cursor
- **WHEN** a patch carries an ID cursor parsed from `{"__proto__":{"n":5}}`
- **THEN** the patch is rejected with `malformed-record` and the model's cursor is unchanged

### Requirement: Explicit insertion sequences are bounded and unique
Every entity has an insertion sequence, a positive integer that fixes collection order. An add MAY carry an explicit sequence (undo uses this to restore an entity in its old place). An explicit sequence SHALL be an integer from 1 to 2^40 and SHALL NOT equal the sequence of another live entity of the same kind or of another add of the same kind in the same patch; otherwise the patch is rejected with `conflict` and nothing changes.

#### Scenario: A sequence already in use
- **WHEN** node `a` has sequence 1 and a patch adds node `b` with explicit sequence 1
- **THEN** the patch is rejected with `conflict`

#### Scenario: A sequence near the largest safe integer
- **WHEN** a patch adds a node with explicit sequence 2^53 - 1
- **THEN** the patch is rejected, and later adds without a sequence still get distinct increasing sequences

### Requirement: Stored records are the model's own copies
Validation of a node, port or connection record SHALL return a new record holding only the fields the record kind defines, with copies of its positions, sizes, lists, endpoints, placements, overrides and route constraints. Unknown keys SHALL NOT be stored. Changing the caller's object after a submit SHALL NOT change the model. The payload (application data) is kept as given and becomes owned by the model.

#### Scenario: Caller mutates its record after submit
- **WHEN** a model created with record freezing turned off accepts an added node, and the caller then sets a title and changes the position on the object it passed
- **THEN** the stored node has no title and its original position, and no change event is published

#### Scenario: Unknown keys are not stored
- **WHEN** an added node record carries an extra key `extra`
- **THEN** the stored record has no `extra` key

### Requirement: Records stay inside the supported world range
World coordinates are supported within plus or minus 10,000,000 (1e7) units. Record validation, and so snapshot load, paste, duplicate and every patch, SHALL reject with `out-of-range` a node whose position coordinate lies outside that range, a node whose width or height exceeds 20,000,000, and a route constraint whose coordinate lies outside that range.

#### Scenario: A node with an extreme coordinate
- **WHEN** a snapshot holds a node at x = -1.7e308 with width 1.7e308
- **THEN** loading fails with `out-of-range` at that node's path and the model is unchanged

#### Scenario: A patch moving a node out of range
- **WHEN** a patch moves a node to x = 2e7
- **THEN** the patch is rejected with `out-of-range`

### Requirement: ID counters never wrap or reset
The default ID generator mints IDs from one counter per entity kind (`n1`, `p1`, ...) kept in the saved ID cursor. It SHALL NOT treat a counter that is not a safe integer as zero, SHALL raise a misuse error instead of minting past the largest safe integer, and SHALL ignore an observed outside ID whose counter exceeds 2^50. Numeric ID cursor values in snapshots and patches SHALL be safe integers.

#### Scenario: Loading an ID at the largest safe integer
- **WHEN** a snapshot holding a node whose ID counter is the largest safe integer is loaded, and two nodes are created
- **THEN** both creates succeed with distinct IDs that were never used

#### Scenario: A cursor value that is not a safe integer
- **WHEN** a snapshot carries the ID cursor `{"n": 1e300}`
- **THEN** loading fails with an error at `idCursor.n`

### Requirement: ID cursors merge forward for numbers and text
When a patch commits, its ID cursor is merged into the model's cursor. A host ID generator MAY provide a `merge` function, which then decides. Without one, a number SHALL replace a smaller number, and a text value (or a value of another type) SHALL replace the current one.

#### Scenario: A text counter with no observe function
- **WHEN** a host generator keeps text values in its cursor, has no `observe` or `merge`, and four nodes are created one after another
- **THEN** all four creates are accepted with four different IDs

### Requirement: One revision type
A revision is a non-negative integer that counts the changes shown by a model's read model, starting at 0. The model, its reader, the graph state, accepted edit outcomes, change and reset events, the snapshot load report and the host validator request SHALL all express a revision as that same integer, so two of them compare with plain equality. A host's own revision token, such as a server revision attached to a pushed snapshot, is a separate value and SHALL NOT be required to fit this type.

#### Scenario: Reader and model agree
- **WHEN** an edit is accepted
- **THEN** the outcome's revision, the change event's revision, the model's revision and the reader's revision are the same integer

### Requirement: Operation ID constructor
The core entry point SHALL export a constructor that turns a text into an operation ID, so a caller can tag a submitted edit with its own operation ID without a type cast. The constructor SHALL accept the same IDs as the entity ID constructors (non-empty, no whitespace) and SHALL throw a misuse error for any other value.

#### Scenario: Own operation ID
- **WHEN** a caller submits a patch with an operation ID built by the constructor from "save-1"
- **THEN** the accepted outcome and the change event carry the operation ID "save-1"

#### Scenario: Malformed operation ID
- **WHEN** the constructor is called with an empty text or one containing a space
- **THEN** it throws a misuse error
