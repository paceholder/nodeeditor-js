## ADDED Requirements

### Requirement: CON-09 Host validator and verdict cache
A host SHALL be able to supply an asynchronous validator for connection proposals. The policy contract SHALL stay synchronous: a wrapper policy SHALL answer `pending` while the verdict for a proposal is unknown and `accept` or `reject` once it is known, from a verdict cache keyed by a stable proposal signature (endpoint ports, connection kind, named choice, replaced connection). Each validator request SHALL carry the proposal, its signature, the graph revision and an abort signal; each verdict SHALL carry the signature and revision it applies to, and a verdict for a different signature or an older revision SHALL be discarded. Repeated evaluations of one signature SHALL cause at most one validator call while the verdict is current. A validator that fails or exceeds the configured timeout SHALL yield a rejection with a distinct reason, not `accept` and not an endless pending state. Evaluation SHALL stay deterministic for equal cache contents (TXN-05).

#### Scenario: One round trip per proposal
- **WHEN** the same two ports are evaluated 50 times during one drag
- **THEN** the validator is called once, the outcome is `pending` until it answers, and `accept` or `reject` afterwards

#### Scenario: Late verdict for a superseded candidate
- **WHEN** a verdict arrives for a signature that is no longer the current candidate
- **THEN** it is stored under its own signature only and the current candidate stays pending

#### Scenario: Verdict for an older revision
- **WHEN** a verdict arrives tagged with a graph revision older than the one the request was made for
- **THEN** it is discarded and the proposal evaluates as `pending` again

#### Scenario: Validator failure
- **WHEN** the validator throws, rejects its promise or exceeds the timeout
- **THEN** the proposal evaluates to a rejection whose code names the failure, and the validator is not called again for that signature until the cache entry is cleared

### Requirement: CON-10 Rejection delivery to the host
A structured rejection produced by a verdict, by the policy or by commit revalidation during a pointer gesture SHALL be delivered to a host callback of the view with its code, message and affected entities, so a host can show it in its own surface. The preview SHALL keep showing the reason at the target (PRT-06). Delivery SHALL NOT change the policy outcome or the model.

#### Scenario: Host shows its own message
- **WHEN** a verdict rejects a dragged connection and the user releases on the target
- **THEN** the host callback receives one rejection with the validator's code and message and the model is unchanged

## MODIFIED Requirements

### Requirement: CON-04 Structured policy outcomes
Policy evaluation SHALL return one of: accept with a connection plan, reject with a reason, choice required (with the alternatives), or pending/unverified. A Boolean alone SHALL NOT be the policy contract. A pending outcome SHALL be resolvable: it becomes accept or reject when the host validator's verdict arrives (CON-09), and until then the target SHALL NOT be shown or committed as accepted. Each alternative of a choice-required outcome SHALL carry a key that is unique within that outcome and stable across repeated evaluations of the same proposal against the same graph, and MAY carry a display label. A proposal that names one of those keys SHALL be evaluated to that alternative and accepted, or else rejected. A connect command that names a key SHALL be planned through the same policy, so a chosen alternative is validated like any other connection (CON-03, CON-05). If the policy still answers choice required for a named key, the command SHALL be rejected with a choice-required reason instead of picking.

#### Scenario: Validator unavailable
- **WHEN** a policy depends on a host validator that has not answered yet
- **THEN** the outcome is pending/unverified and the target is not shown as accepted

#### Scenario: Pending becomes accepted
- **WHEN** the validator then answers that the proposal is valid
- **THEN** the same proposal evaluates to accept with the policy's plan

#### Scenario: Ambiguous mapping
- **WHEN** a policy finds two valid member mappings for a proposed connection
- **THEN** it returns choice-required listing both mappings instead of picking one

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
A connection SHALL be revalidated at commit against current entity revisions and permissions. A preview accepted earlier SHALL NOT guarantee acceptance at commit. Commit revalidation SHALL be synchronous and use the verdict cache; a proposal whose current verdict is missing or pending at commit SHALL be rejected with the pending-validation reason.

#### Scenario: Target filled during gesture
- **WHEN** a target input becomes occupied by another edit after the preview showed it compatible
- **THEN** the commit is rejected with an exhausted-capacity reason and no connection is created

#### Scenario: Programmatic connect without a verdict
- **WHEN** a program submits a connect command for a proposal the validator has not answered
- **THEN** the command is not accepted, the result is the unverified outcome, and no connection is created
