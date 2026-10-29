# editing-operations Specification

## Purpose

Defines compound structural edits on selections: delete, duplicate, copy and paste of graph
fragments, and optional node replacement. Each is one atomic, policy-validated, undoable edit.

## Requirements

### Requirement: EDT-01 Replace node with port mapping (SHOULD)
The library SHALL support replacing a node's type with an explicit old-to-new port and member mapping, previewing retained, remapped, and disconnected connections before confirmation.

#### Scenario: Preview replacement
- **WHEN** the user requests replacement of a node with five connections by a type that lacks one matching port
- **THEN** the preview lists four retained or remapped connections and one connection to be removed before anything changes

### Requirement: EDT-02 Atomic delete
Deleting a selection SHALL remove the selected entities together with their required incident connections and reference effects as one atomic undoable operation. Locked or protected entities SHALL cause a documented rejection or an explicit allowed-subset plan, never hidden partial deletion.

#### Scenario: Delete with incident connections
- **WHEN** two selected nodes that have connections to each other and to an unselected neighbor are deleted
- **THEN** the nodes and all their incident connections are removed in one patch and one undo restores them with original IDs

#### Scenario: Protected entity in selection
- **WHEN** a selection containing a delete-protected node is deleted
- **THEN** the command either rejects with a capability reason or presents a subset plan that excludes the protected node, and nothing is removed until that plan is accepted

### Requirement: EDT-03 Duplicate and paste fragments
Duplicate and paste SHALL copy payloads, dynamic ports, internal connections, route constraints, and selected groups, allocating new IDs and remapping every internal reference consistently. The source fragment SHALL remain unchanged.

#### Scenario: Duplicate connected pair
- **WHEN** two nodes joined by one connection are duplicated
- **THEN** two new nodes and one new connection between the new nodes exist, all with new IDs, and the originals are unchanged

#### Scenario: Paste twice
- **WHEN** a copied fragment is pasted twice
- **THEN** each paste places the fragment at a placement offset and allocates fresh IDs each time

### Requirement: EDT-03a Clipboard fragments use the graph snapshot shape
Copied fragments SHALL be represented in the graph snapshot shape defined by the serialization capability, so the same validation applies to pasted fragments, imported documents, and snapshot-mode input.

#### Scenario: Fragment validated like a document
- **WHEN** a fragment with a connection to a port missing from the fragment is pasted
- **THEN** the paste is rejected by the snapshot validator with a dangling-endpoint error

### Requirement: EDT-04 Explicit external-reference handling on paste
When a pasted fragment contains connections or references to entities outside the fragment, paste SHALL handle each explicitly by excluding it, preserving it with host approval, or requesting resolution. Copying a view of a source SHALL NOT silently duplicate the source.

#### Scenario: External connection excluded by default
- **WHEN** a node connected to an unselected neighbor is copied and pasted with default options
- **THEN** the pasted node has no connection to the neighbor and the paste result reports the excluded connection

### Requirement: EDT-05 Validated paste with fallback
Pasted and replaced fragments SHALL be validated against type availability, permissions, size limits, and connection policy before any change is applied. When system clipboard access is denied, an in-app fragment import and export path SHALL remain available.

#### Scenario: Oversized fragment
- **WHEN** a fragment larger than the configured limit is pasted
- **THEN** the paste is rejected with a size error and the graph is unchanged

#### Scenario: Clipboard denied
- **WHEN** the browser denies clipboard read
- **THEN** the user can still export the fragment as text and import it through the in-app path
