# provided-values Specification

## Purpose

Defines provided values: host-owned, typed, read-only values offered at a node or port, and
explicit reference bindings that let consumers read them without creating ordinary graph
connections or duplicating storage. The library never computes these values.

## Requirements

### Requirement: REF-01 Provided value identity and ownership
A provided value SHALL have a stable source identity, a type/schema key, and declared ownership at node or port level. The host SHALL choose ownership; the library SHALL NOT infer it from labels or dependency counts.

#### Scenario: Node-owned and port-owned values
- **WHEN** a host declares `rowCount` owned by a node and `width` owned by one of its ports
- **THEN** the model reports each value with its declared owner and type key

### Requirement: REF-02 Reference bindings distinct from connections
The library SHALL support an explicit read-only reference binding that is distinct from ordinary connections. Styling or implicit conversion SHALL NOT turn one role into the other.

#### Scenario: Reference is not a connection
- **WHEN** a consumer references a provided value
- **THEN** adjacency and connection queries do not report it as a connection, and reference queries do

### Requirement: REF-03 Many readers, one source per binding
Many consumers MAY reference one offered value, subject to host limits. Each required consumer binding SHALL have exactly one selected source. Documentation SHALL note that readers can incur application processing cost.

#### Scenario: Second reader
- **WHEN** a second consumer references the same provided value
- **THEN** both bindings exist and point to the same source identity

#### Scenario: Second source for one consumer
- **WHEN** a consumer binding that already has a source is bound to another source without replacing the first
- **THEN** the edit is rejected

### Requirement: REF-04 Targets without visible ports
A consumer binding SHALL be able to target an application field that has no visible input port. The target SHALL have a stable identity and SHALL participate in validation, persistence, deletion, and undo.

#### Scenario: Bind to display field
- **WHEN** a reference binding targets a node's display field that has no port
- **THEN** the binding is created, saved in snapshots, and removed when the node is deleted

### Requirement: REF-05 Host-supplied source references
The library SHALL reuse the host's source-reference scheme and SHALL NOT require a second value registry or copy values into the scene to create references. Source unavailable, pending, and stale SHALL be explicit states.

#### Scenario: Stale source
- **WHEN** the host marks a referenced source as stale
- **THEN** every binding to it shows the stale state without the library reading or caching the value

### Requirement: REF-06 Ownership preserved across presentation changes
Declared ownership and source identity SHALL be preserved across collapse, expansion, and port reordering. A node-owned value SHALL NOT be silently relabeled as port-owned.

#### Scenario: Reorder ports
- **WHEN** the ports of a node with a port-owned value are reordered
- **THEN** the value stays owned by the same port ID and its bindings are unchanged
