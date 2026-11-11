## ADDED Requirements

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
