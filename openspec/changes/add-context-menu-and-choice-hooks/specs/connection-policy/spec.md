## MODIFIED Requirements

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
