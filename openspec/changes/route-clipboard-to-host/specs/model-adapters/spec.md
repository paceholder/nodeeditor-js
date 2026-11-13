## MODIFIED Requirements

### Requirement: Paste, duplicate and unavailable creation
Under an adapter whose nodes are named by the host, paste SHALL first validate the fragment as untrusted input, exactly as local paste does, and reject an invalid or oversized one before any intent is built; it SHALL then hand the host one create-fragment intent instead of creating anything: it SHALL carry the fragment's nodes (type, position, title, payload), the placement offset, and the fragment's internal connections expressed with keys local to the fragment, since the ports they join do not exist yet. Duplicate under such an adapter SHALL NOT build a fragment and SHALL follow the requirement "Duplicate of a host-named document is one host operation". The library SHALL create none of the nodes and SHALL NOT apply the connection policy to the fragment's connections, which the host owns; the host creates the nodes and then the connections, or answers that the operation is not supported with a rejection of code `unsupported-command` and a message of its own, in which case the command settles as rejected carrying that rejection unchanged and nothing is created. The capability policy SHALL be able to report creation as unavailable with a reason, in which case every creation command, duplicate included, reports that reason before any delegation and no ID is minted.

#### Scenario: Paste under a delegating adapter
- **WHEN** a fragment of two connected nodes is pasted through an adapter whose nodes are named by the host
- **THEN** the host receives one create-fragment intent holding two nodes and their connection by fragment-local keys, and the read model is unchanged until it answers

#### Scenario: Duplicate under a delegating adapter
- **WHEN** two connected nodes are duplicated through an adapter whose nodes are named by the host
- **THEN** the host receives one duplicate intent holding the two node IDs, their connection ID and the offset, no fragment is built, and the read model is unchanged until it answers

#### Scenario: Invalid fragment is not delegated
- **WHEN** a pasted fragment references a port that does not exist, or exceeds the fragment size limits
- **THEN** the command is rejected with a structured rejection and the host is not called

#### Scenario: Host cannot paste
- **WHEN** the host answers that a fragment cannot be created
- **THEN** the command settles as rejected with the host's rejection, its message unchanged, and nothing is created

#### Scenario: Creation forbidden
- **WHEN** the capability policy forbids creation with a reason and a paste or a duplicate is attempted
- **THEN** the command reports that rejection, nothing is submitted, the host is not called, and no ID is minted

## ADDED Requirements

### Requirement: Duplicate of a host-named document is one host operation
Under an adapter whose nodes are named by the host, duplicate SHALL hand the host one duplicate intent and SHALL NOT build a fragment. The library SHALL create nothing, mint no ID and show no placeholder. The host copies the nodes in its store as one operation and pushes a snapshot with the copies; it answers accepted without a node ID, rejected (settled with that rejection unchanged) or unknown. Duplicate on a local adapter and paste on any adapter SHALL be unaffected.

#### Scenario: Accepted duplicate settles without placeholders
- **WHEN** a duplicate intent is pending and the host answers accepted without a node ID
- **THEN** the result settles as accepted, the adapter listed no placeholder at any time, and the copies appear only when the host pushes a snapshot that holds them

#### Scenario: The host refuses a duplicate
- **WHEN** the host answers a duplicate intent as rejected with a rejection of its own
- **THEN** the result settles as rejected with that rejection unchanged and nothing is created

#### Scenario: Local duplicate unchanged
- **WHEN** two connected nodes are duplicated through a local adapter
- **THEN** the copies and their connection are created at once as one history entry

### Requirement: Contents of a duplicate intent
A duplicate intent SHALL carry an operation ID, the copied node IDs once each in paint order, the IDs of the connections the copy re-creates in creation order, and the offset a local duplicate would add to every copied position. The re-created connections SHALL be those with both ends on copied nodes, plus, only when the command asks to preserve external connections, those with one end on a copied node; otherwise those SHALL be reported as excluded with the reason `external`.

#### Scenario: Duplicate hands the host the IDs
- **WHEN** two connected nodes are duplicated with an offset through an adapter whose nodes are named by the host
- **THEN** the host receives one duplicate intent holding the two node IDs in paint order, the ID of the connection between them and that offset, the read model is unchanged, no ID is minted, and the result is pending

#### Scenario: Outside connections are excluded by default
- **WHEN** a node with connections to two nodes outside the selection is duplicated through such an adapter with the default external handling
- **THEN** the intent lists no connection and the plan reports both connections as excluded with the reason `external`

#### Scenario: Preserved outside connections are listed
- **WHEN** the same node is duplicated asking to preserve external connections
- **THEN** the intent lists both connections and the plan reports none as excluded

#### Scenario: Centred duplicate carries the local offset
- **WHEN** nodes are duplicated through such an adapter with a placement that centres the copy on a point
- **THEN** the intent's offset is the one that moves the centre of the nodes' bounding box to that point, the same offset a local duplicate would add

### Requirement: Groups in a duplicate intent
A duplicate intent SHALL carry the IDs of the copied groups once each in creation order, and SHALL omit them when no group is copied. As in a local duplicate, a listed group SHALL be copied with all its members, which the intent SHALL list among the copied nodes, and a copied node SHALL join the copy of its group only when that group is copied; otherwise its copy belongs to no group.

#### Scenario: A selected group is copied with its members
- **WHEN** a group of two connected nodes is duplicated through such an adapter with only the group listed
- **THEN** the intent lists the group's ID, both member node IDs and the connection between them

#### Scenario: A member without its group is copied free
- **WHEN** one member of a group is duplicated through such an adapter without its group
- **THEN** the intent lists that node and no group, so its copy belongs to no group

### Requirement: A duplicate is checked before it is handed over
Before handing a duplicate to the host, the command SHALL refuse with a structured rejection, and SHALL NOT call the host, when no node is listed and no listed group has members, a listed node or group does not exist, a node's type is not registered or cannot be created, or the capability policy forbids creation.

#### Scenario: Invalid duplicate is not handed over
- **WHEN** a duplicate lists a node or a group that does not exist, or a node whose type cannot be created
- **THEN** the command is rejected with a structured rejection and the host is not called
