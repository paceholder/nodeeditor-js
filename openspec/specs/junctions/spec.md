# junctions Specification

## Purpose

Defines branching: distinguishing crossings from logical meeting points and creating,
extending, and removing identifiable junctions through the normal type, policy, and
patch machinery, without built-in application meaning.

## Requirements

### Requirement: JNC-01 Crossing versus meeting point
The view SHALL distinguish visual crossings from logical meeting points. A filled meeting indicator SHALL appear only where the model or host policy identifies a shared attachment.

#### Scenario: Two paths cross
- **WHEN** two unrelated connections cross visually
- **THEN** no meeting indicator is drawn and no junction exists

#### Scenario: Junction drawn
- **WHEN** three connections attach to one junction
- **THEN** a meeting indicator is drawn at the junction

### Requirement: JNC-02 Drop on route requests a branch plan
Dropping a connection onto an existing route SHALL request a branch plan from policy. The host MAY reject it, attach to an existing junction, or materialize a new identifiable junction with dynamic ports.

#### Scenario: Branch accepted
- **WHEN** a user drops a new connection onto a branchable route and policy materializes a junction
- **THEN** a preview shows the junction, split paths, and new bindings before commit

#### Scenario: Branch rejected
- **WHEN** policy rejects branching for that connection kind
- **THEN** a reason is shown and the original route and bindings are unchanged

### Requirement: JNC-03 Atomic branching
Junction creation, route split or replacement, port growth, and new bindings SHALL be applied as one patch and one history entry. The first connected node SHALL NOT serve as an invisible junction identity.

#### Scenario: Undo a branch
- **WHEN** a committed branch is undone once
- **THEN** the junction, the split, and the new binding are all removed and the original connection is restored with its ID

### Requirement: JNC-04 Junctions use normal extension points
A junction's appearance, compatibility, labels, port count, and limits SHALL be defined through the normal node type, geometry, painter, and policy extension points. The library SHALL NOT interpret multi-way attachment.

#### Scenario: Custom junction type
- **WHEN** a host registers a junction type with a custom painter and a maximum of four ports
- **THEN** junctions of that type use the painter and a fifth attachment is rejected by policy

### Requirement: JNC-05 Explicit junction removal
Removing or collapsing a junction SHALL require an explicit permitted command. Reducing a junction to two attachments SHALL NOT erase its identity, name, payload, or external references automatically.

#### Scenario: Named junction with two branches left
- **WHEN** one branch of a named three-way junction is removed
- **THEN** the junction remains with its ID and name and two attachments

### Requirement: JNC-06 Per-member branching
For composite connections, branching SHALL be evaluated separately for each member. A member that permits fan-out SHALL NOT make the other members branchable; the plan SHALL be rejected or require an explicit partial-unpack.

#### Scenario: Mixed multiplicity members
- **WHEN** a user drops onto a composite cable where one member allows fan-out and another allows one attachment
- **THEN** the branch is rejected with a member-specific reason or an explicit unpack plan is offered
