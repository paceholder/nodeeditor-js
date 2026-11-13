## ADDED Requirements

### Requirement: Groups in the snapshot
The graph snapshot SHALL list groups in document order, each with its ID, title, lock state and optional style key, and each node SHALL name the group it belongs to, if any. The shared validator SHALL reject, with a structural error giving the path, a node that names a missing group, a group that no node names, a duplicate group ID, and a group ID that collides with another entity's ID. Export followed by load SHALL reproduce groups, membership and group order exactly. The addition SHALL NOT change the format version: a document without groups SHALL be written exactly as before groups existed and SHALL stay readable by a library version that predates them, and a document saved before groups existed SHALL load unchanged. A clipboard fragment SHALL contain a group when the group is selected, together with all its members; on paste or duplicate the group SHALL get a new ID and its copied members SHALL belong to the copy. A copied node whose group is not part of the fragment SHALL be pasted as a free node. Comparing two snapshots SHALL report added, removed and changed groups and membership changes, so a host that pushes snapshots can change groups.

#### Scenario: Round trip with groups
- **WHEN** a model with two groups, one of them locked, is exported and the result is loaded into a new model
- **THEN** the new model has the same group IDs, titles, lock states, members and group order

#### Scenario: Node names a missing group
- **WHEN** an imported snapshot has a node whose group is an ID not present in the groups section
- **THEN** the import is rejected with a structural error whose path points at that node's group

#### Scenario: Document saved before groups existed
- **WHEN** a document saved before groups existed is loaded
- **THEN** it loads without error and has no groups

#### Scenario: Document without groups
- **WHEN** a model without groups is exported
- **THEN** the snapshot has no groups section, no node has a group field, and the format version is unchanged

#### Scenario: Copy a selected group
- **WHEN** a group with two members is selected, copied and pasted
- **THEN** a new group with a new ID holds two new nodes, the original group is unchanged, and the paste is one history entry

#### Scenario: Copy a member without its group
- **WHEN** one member node is selected without its group, copied and pasted
- **THEN** the pasted node belongs to no group

#### Scenario: Host pushes a snapshot with a new group
- **WHEN** a host in snapshot mode pushes a snapshot in which two existing nodes now name a new group
- **THEN** the model gains that group with those members and no local undo entry is added
