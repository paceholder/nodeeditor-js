## ADDED Requirements

### Requirement: Snapshot diff against the read model
The library SHALL compute, from a validated snapshot and the read model, the patch that turns the model into the snapshot, matching entities by ID. Equal entities SHALL produce no operation and a changed one a single update with old and new values. Removing a node SHALL remove its ports and connections in the same patch. The patch SHALL be deterministic and plain data.

#### Scenario: Equal snapshots give an empty patch
- **WHEN** a snapshot exported from a model is diffed against that same model
- **THEN** the patch has no operations

#### Scenario: Moved node gives one update
- **WHEN** a snapshot differs from the read model only in one node's position
- **THEN** the patch holds a single update of that node's position with its old and new value

#### Scenario: Removed node takes its connections
- **WHEN** a snapshot omits a node that has two connections
- **THEN** the patch removes both connections, the node's ports and the node, and applying it succeeds atomically

#### Scenario: Applying the patch reaches the snapshot
- **WHEN** the diff of a snapshot is applied to the read model and the model is exported
- **THEN** the export equals the snapshot in everything the snapshot defines, and the patch's inverse restores the previous export
