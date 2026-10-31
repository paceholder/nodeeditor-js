## ADDED Requirements

### Requirement: Cut as copy plus atomic delete
Cut SHALL copy the selection as a fragment and then delete it through the atomic delete. A cut SHALL add exactly one history entry, and one undo SHALL restore the removed entities with their original IDs. When the delete would be rejected, for example because a selected node is delete-protected, the cut SHALL be rejected as a whole and the clipboard SHALL stay unchanged.

#### Scenario: Cut is one history entry
- **WHEN** two connected nodes are selected and cut
- **THEN** both nodes and their incident connections are removed, the history gains exactly one entry, and the clipboard holds a fragment with both nodes and their internal connection

#### Scenario: Undo after cut
- **WHEN** a cut is followed by one undo
- **THEN** the removed nodes and connections are back with their original IDs, and the clipboard still holds the cut fragment

#### Scenario: Cut of a protected node
- **WHEN** the selection contains a delete-protected node and the user cuts
- **THEN** the cut is rejected with the capability reason, nothing is removed, and the clipboard keeps its previous content

## MODIFIED Requirements

### Requirement: Duplicate and paste fragments
Duplicate and paste SHALL copy payloads, dynamic ports, internal connections, route constraints, and selected groups, allocating new IDs and remapping every internal reference consistently. The source fragment SHALL remain unchanged. A connection is internal when both of its endpoints belong to copied nodes, whether or not the connection itself was selected. Each paste or duplicate SHALL be one atomic edit with one history entry. A paste SHALL place the fragment's bounding-box centre at the pointer when the pointer is over the view; otherwise, and for duplicate, the fragment SHALL be offset from its original position by a placement offset that grows with each repeated paste of the same fragment.

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

#### Scenario: Paste is one history entry
- **WHEN** a fragment of three nodes and two connections is pasted and then undone once
- **THEN** the paste added exactly one history entry and the undo removes all five entities

### Requirement: Explicit external-reference handling on paste
When a pasted fragment contains connections or references to entities outside the fragment, paste SHALL handle each explicitly by excluding it, preserving it with host approval, or requesting resolution. Copying a view of a source SHALL NOT silently duplicate the source. Exclusion SHALL be the default. When the host approves preserving external connections, each one SHALL be re-created to the same outside endpoint when that endpoint still exists and the connection policy accepts it, and is otherwise excluded and reported with its reason.

#### Scenario: External connection excluded by default
- **WHEN** a node connected to an unselected neighbor is copied and pasted with default options
- **THEN** the pasted node has no connection to the neighbor and the paste result reports the excluded connection

#### Scenario: External connection preserved with host approval
- **WHEN** a node whose input is connected to an unselected neighbor's output is duplicated with external connections approved for preservation, and the policy allows another connection on that output
- **THEN** the copy's input is connected to the same neighbor output by a new connection, in the same history entry as the duplicate

#### Scenario: Preserved connection unavailable
- **WHEN** external connections are approved for preservation but the outside endpoint no longer exists in the target graph
- **THEN** the paste succeeds without that connection and reports it as excluded with a reason

### Requirement: Validated paste with fallback
Pasted and replaced fragments SHALL be validated against type availability, permissions, size limits, and connection policy before any change is applied. When system clipboard access is denied, an in-app fragment import and export path SHALL remain available. Clipboard text SHALL be treated as untrusted input: text without the library's fragment marker SHALL be ignored with a reason rather than parsed as a graph.

#### Scenario: Oversized fragment
- **WHEN** a fragment larger than the configured limit is pasted
- **THEN** the paste is rejected with a size error and the graph is unchanged

#### Scenario: Clipboard denied
- **WHEN** the browser denies clipboard read
- **THEN** the user can still export the fragment as text and import it through the in-app path

#### Scenario: Unregistered node type
- **WHEN** a fragment containing a node whose type is not registered in the target model is pasted
- **THEN** the paste is rejected with an unknown-type error naming the type, and the graph is unchanged

#### Scenario: Internal connection refused by policy
- **WHEN** a host policy forbids a connection that the fragment contains between two of its nodes
- **THEN** the paste is rejected with the policy's reason and the graph is unchanged

#### Scenario: Read-only model
- **WHEN** paste is requested on a read-only model
- **THEN** the paste command reports unavailable with the read-only reason and nothing changes

#### Scenario: Foreign clipboard text
- **WHEN** the system clipboard holds ordinary text and the user pastes into the editor
- **THEN** nothing is pasted, no error is thrown, and the command result explains that the clipboard holds no graph fragment
