# connection-policy Specification

## Purpose

Defines how proposed connections are validated: the host-replaceable connection policy, the
default preset for directed and undirected ports, structured outcomes, commit-time
revalidation, and the guarantee that every input route uses the same policy.

## Requirements

### Requirement: CON-01 Replaceable connection policy
The library SHALL ship a documented default connection policy and SHALL let hosts replace or extend type compatibility, direction rules, cardinality, detach permission, and connection kind. The policy, not the model structure, decides whether a connection is valid.

#### Scenario: Host policy replaces default
- **WHEN** a host installs a policy that allows a signal output to connect to a hydraulic input
- **THEN** that connection is accepted even though the default policy would reject it

### Requirement: CON-01a Default directed preset
For directed ports the default policy SHALL accept output-to-input connections with equal type keys, allow one attachment per input and many per output, reject self-loops and duplicate endpoint pairs, and allow cycles through different nodes.

#### Scenario: Valid directed connection
- **WHEN** an output of type `signal` is connected to an empty input of type `signal` on another node
- **THEN** the default policy accepts it

#### Scenario: Wrong direction
- **WHEN** an output is connected to another output
- **THEN** the default policy rejects it with a direction reason

#### Scenario: Input already occupied
- **WHEN** a second connection targets an input that already has one
- **THEN** the default policy rejects it with an exhausted-capacity reason

#### Scenario: Cycle allowed
- **WHEN** a connection closes a cycle through three different nodes
- **THEN** the default policy accepts it

### Requirement: CON-01b Default undirected preset
For ports declared `undirected`, the default policy SHALL accept connections between undirected ports with equal type keys. The order in which the user draws an undirected connection SHALL NOT change its meaning or identity. Directed and undirected connections MAY coexist in one graph.

#### Scenario: Same physical domain
- **WHEN** an undirected `mechanical` port is connected to another undirected `mechanical` port
- **THEN** the default policy accepts it

#### Scenario: Different domains
- **WHEN** an undirected `hydraulic` port is connected to an undirected `thermal` port
- **THEN** the default policy rejects it with a type-mismatch reason

#### Scenario: Drawing order irrelevant
- **WHEN** the same undirected connection is drawn from A to B in one model and from B to A in another
- **THEN** both models consider the connections equivalent for duplicate detection and policy checks

### Requirement: CON-02 Policy-controlled topology features
Self-loops, parallel connections, directed cycles, and undirected connections SHALL be permitted or forbidden by policy, not by model structure. Parallel connections SHALL have distinct IDs and be individually selectable and reconnectable.

#### Scenario: Parallel connections enabled
- **WHEN** a policy allows parallel connections and two connections join the same port pair
- **THEN** each connection has its own ID and can be selected and reconnected independently

### Requirement: CON-03 One policy for all input routes
Pointer gestures, keyboard commands, programmatic edits, paste, and replacement SHALL all be validated by the same active policy. No input route SHALL bypass required validation.

#### Scenario: API cannot bypass policy
- **WHEN** a program submits a connect command that the active policy rejects for pointer gestures
- **THEN** the command is rejected with the same reason

### Requirement: CON-04 Structured policy outcomes
Policy evaluation SHALL return one of: accept with a connection plan, reject with a reason, choice required (with the alternatives), or pending/unverified. A Boolean alone SHALL NOT be the policy contract. Each alternative of a choice-required outcome SHALL carry a key that is unique within that outcome and stable across repeated evaluations of the same proposal against the same graph, and MAY carry a display label. A proposal that names one of those keys SHALL be evaluated to that alternative and accepted, or else rejected. A connect command that names a key SHALL be planned through the same policy, so a chosen alternative is validated like any other connection (CON-03, CON-05). If the policy still answers choice required for a named key, the command SHALL be rejected with a choice-required reason instead of picking.

#### Scenario: Ambiguous mapping
- **WHEN** a policy finds two valid member mappings for a proposed connection
- **THEN** it returns choice-required listing both mappings instead of picking one

#### Scenario: Validator unavailable
- **WHEN** a policy depends on a host validator that has not answered yet
- **THEN** the outcome is pending/unverified and the target is not shown as accepted

#### Scenario: Alternatives carry keys
- **WHEN** a policy offers two connection kinds for one port pair and the same proposal is evaluated twice on an unchanged graph
- **THEN** both evaluations list two alternatives with the same two distinct keys in the same order

#### Scenario: Connect with a chosen alternative
- **WHEN** a connect command names the key of the second alternative
- **THEN** one connection of that alternative's kind is created as one history entry, and the commit-time validation accepts it

#### Scenario: Unknown or unresolved key
- **WHEN** a connect command names a key the policy does not recognize, or the policy answers choice-required again
- **THEN** the command is rejected with a reason and no connection is created

### Requirement: CON-05 Commit-time revalidation
A connection SHALL be revalidated at commit against current entity revisions and permissions. A preview accepted earlier SHALL NOT guarantee acceptance at commit.

#### Scenario: Target filled during gesture
- **WHEN** a target input becomes occupied by another edit after the preview showed it compatible
- **THEN** the commit is rejected with an exhausted-capacity reason and no connection is created

### Requirement: CON-06 No implicit conversions
Type conversions or insertion of auxiliary nodes SHALL appear explicitly in the connection plan. The library SHALL NOT invent casts, default values, adapters, or extra nodes solely to make a connection valid.

#### Scenario: Host-proposed converter
- **WHEN** a policy proposes inserting a converter node between incompatible ports
- **THEN** the plan lists the converter node and both resulting connections before confirmation

### Requirement: CON-07 Existing binding survives failed reconnection
An existing connection SHALL remain unchanged until a reconnection is accepted. A failed, cancelled, or prohibited detach or reconnect SHALL leave the old connection intact.

#### Scenario: Cancelled reconnect
- **WHEN** the user drags a connection endpoint toward a new port and presses Escape
- **THEN** the connection keeps its original endpoints and ID

### Requirement: CON-08 Connection identity independent of presentation
A connection's identity SHALL be independent of its path, paint style, labels, and, for undirected connections, endpoint order. Restyling or rerouting SHALL NOT recreate the connection.

#### Scenario: Restyle keeps identity
- **WHEN** a connection's style is changed from solid to dashed and its route is edited
- **THEN** it keeps the same ID and endpoints and no remove/add pair appears in the patch
