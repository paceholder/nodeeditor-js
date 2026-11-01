## MODIFIED Requirements

### Requirement: Duplicate and paste fragments
Duplicate and paste SHALL copy payloads, dynamic ports, internal connections, route constraints, and selected groups, allocating new IDs and remapping every internal reference consistently. The source fragment SHALL remain unchanged. A connection is internal when both of its endpoints belong to copied nodes, whether or not the connection itself was selected. Each paste or duplicate SHALL be one atomic edit with one history entry. A paste given an explicit world position, for example from a context menu, SHALL place the fragment's bounding-box centre at that position. Otherwise a paste SHALL place that centre at the pointer when the pointer is over the view. In the remaining cases, and for duplicate, the fragment SHALL be offset from its original position by a placement offset that grows with each repeated paste of the same fragment.

#### Scenario: Duplicate connected pair
- **WHEN** two nodes joined by one connection are duplicated
- **THEN** two new nodes and one new connection between the new nodes exist, all with new IDs, and the originals are unchanged

#### Scenario: Paste twice
- **WHEN** a copied fragment is pasted twice
- **THEN** each paste places the fragment at a placement offset and allocates fresh IDs each time

#### Scenario: Internal connection copied without being selected
- **WHEN** two connected nodes are selected without their connection and copied, then pasted
- **THEN** the pasted fragment contains the connection between the two new nodes

#### Scenario: Dynamic ports and payload copied
- **WHEN** a node whose ports were edited after creation is duplicated
- **THEN** the copy has the same ports in the same order with new port IDs, an equal payload, and its connections attach to the new port IDs

#### Scenario: Paste at the pointer
- **WHEN** a fragment is pasted while the pointer is over the view
- **THEN** the centre of the pasted fragment's bounding box is at the pointer's world position

#### Scenario: Paste without a pointer
- **WHEN** a fragment is pasted three times while the pointer is outside the view
- **THEN** the pastes are placed at the original position plus one, two and three placement offsets

#### Scenario: Paste at a given position
- **WHEN** a fragment is pasted with an explicit world position while the pointer is elsewhere over the view, for example from a touch long-press menu
- **THEN** the centre of the pasted fragment's bounding box is at the given position, not at the pointer

#### Scenario: Paste is one history entry
- **WHEN** a fragment of three nodes and two connections is pasted and then undone once
- **THEN** the paste added exactly one history entry and the undo removes all five entities
