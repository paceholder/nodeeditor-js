## ADDED Requirements

### Requirement: Moving nodes looks only at their own connections
Planning a move of nodes shifts the route constraints (pinned segments) of connections whose two endpoint nodes both move. That planning SHALL visit only the connections attached to the moved nodes, and SHALL list the resulting updates in the model's connection order.

#### Scenario: Move in a large graph
- **WHEN** two connected nodes are moved in a graph with many other connections
- **THEN** the planner reads only the connections of the two moved nodes and shifts the pins of the one between them

### Requirement: Fragment external entries have exactly one inside end
A clipboard fragment lists, besides its own nodes and connections, `external` connections that had one end outside the copied nodes. Fragment validation SHALL reject an external entry unless exactly one of its two ends names a node of the fragment and that end's port belongs to that node in the fragment.

#### Scenario: Both ends inside
- **WHEN** a fragment's external entry connects two ports of nodes that are both in the fragment
- **THEN** the fragment is rejected with an error at that entry's path and nothing is pasted

#### Scenario: Inside end with a foreign port
- **WHEN** an external entry's inside end names a fragment node and a port of another fragment node
- **THEN** the fragment is rejected with `port-node-mismatch` at that entry's path

#### Scenario: Paste at an extreme position
- **WHEN** a paste would place a node outside the supported world range
- **THEN** planning reports the paste rejected with `out-of-range` and nothing is pasted
