# groups Specification

## Purpose

Defines flat visual groups: durable view data that organizes nodes without creating a nested
or executable graph. Optional collapse and hierarchical extensions are described but not
required for R1.

## Requirements

### Requirement: Flat visual groups
The library SHALL support flat visual groups with stable ID, title, explicit membership, bounds, style, selection, movement, and undoable group and ungroup operations.

#### Scenario: Create a named group
- **WHEN** the user groups three selected nodes and names the group
- **THEN** a group with a new stable ID, the title, and exactly those three members exists, and one undo removes it

#### Scenario: Ungroup keeps nodes
- **WHEN** a group is ungrouped
- **THEN** the group is removed and all member nodes remain with their positions and connections

### Requirement: Membership independent of overlap
Group membership SHALL change only through explicit commands, never because a node visually overlaps a group. Moving a group SHALL move each member node exactly once and update incident routes without duplicating connection edits.

#### Scenario: Dragging a node over a group
- **WHEN** a non-member node is dragged and dropped inside a group's bounds
- **THEN** the group's membership is unchanged

#### Scenario: Move group
- **WHEN** a group with four members is moved
- **THEN** one command moves each member once and connections keep their IDs

#### Scenario: Explicit membership change
- **WHEN** the add-to-group command is applied to a node
- **THEN** the node becomes a member and the change is undoable

### Requirement: Group collapse (SHOULD)
The library SHALL support collapsing and expanding a group with stable proxy endpoints for external connections. Collapse SHALL NOT alter logical endpoints, lose selection references, or claim to create a nested executable graph.

#### Scenario: Collapse and expand
- **WHEN** a group with two external connections is collapsed and then expanded
- **THEN** both connections reference their original port IDs throughout

### Requirement: Hierarchical groups (MAY)
Hierarchical groups or nested graph navigation MAY be provided through a separately specified extension. Imported documents with cyclic group ownership SHALL be rejected.

#### Scenario: Cyclic group metadata
- **WHEN** an imported snapshot declares group A inside group B and group B inside group A
- **THEN** the import is rejected with a structural error naming both groups
