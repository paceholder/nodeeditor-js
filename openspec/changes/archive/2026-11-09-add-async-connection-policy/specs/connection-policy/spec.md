## ADDED Requirements

### Requirement: Host validator and verdict cache
A host SHALL be able to supply an asynchronous validator for connection proposals: a function that receives the proposal, an opaque revision token and an abort signal and answers with a verdict. The policy contract SHALL stay synchronous: a wrapper policy SHALL answer `pending` while the verdict for a proposal is unknown and `accept` or `reject` once it is known, from a verdict cache keyed by the connection plan the base policy produced (endpoint ports in the policy's orientation and connection kind). Evaluating a proposal, checking whether a command is available and undoing an edit SHALL only read the cache and SHALL NOT start a validator request; a request SHALL start only from an explicit call by a tool or by the host. Each rejection SHALL be structured (code, message, affected entities). A reply that is not a well-formed verdict SHALL be treated as a validator failure. A verdict SHALL stay current while only changes elsewhere in the graph happen: only a change touching the proposal's ports or their nodes SHALL make it stale, and a verdict that arrives for a stale entry SHALL be discarded; if the tool that asked still wants that candidate it SHALL be requested once more, and a second discard SHALL settle as a rejection that names the staleness. Repeated evaluations of one key SHALL cause at most one validator call while the verdict is current. The library SHALL impose no timeout unless the host configures one. A validator that fails or exceeds the configured timeout SHALL yield a rejection with a distinct reason, not `accept` and not an endless pending state, and that rejection SHALL NOT outlive the gesture that asked: a new request for the same proposal SHALL call the validator again. The graph model SHALL own the cache, every view on the model SHALL share it, disposing a view SHALL abort only the requests no other view still wants, and a model reset SHALL abort every request in flight, clear the cache and ignore answers that arrive later. Evaluation SHALL stay deterministic for equal cache contents.

#### Scenario: One round trip per proposal
- **WHEN** the same two ports are evaluated 50 times during one drag and a tool requested a verdict once
- **THEN** the validator is called once, the outcome is `pending` until it answers, and `accept` or `reject` afterwards

#### Scenario: Evaluation never calls the host
- **WHEN** a proposal with no verdict is evaluated, checked with `can`, or dry-run
- **THEN** the outcome is `pending` or unavailable for now and the validator is not called

#### Scenario: Same plan, same verdict
- **WHEN** a verdict was obtained for a reconnect that names a replaced connection, and the stored connection is later revalidated at commit
- **THEN** the commit finds the same verdict and does not ask the validator again

#### Scenario: Late verdict for a superseded candidate
- **WHEN** a verdict arrives for a key that is no longer the current candidate
- **THEN** it is stored under its own key only and the current candidate stays pending

#### Scenario: Change touching the proposal
- **WHEN** a node that holds one of the proposal's ports is moved or edited while its request is in flight
- **THEN** the late verdict is discarded, the proposal is requested once more, and a second discard settles as a rejection that names the staleness

#### Scenario: Unrelated change keeps the verdict
- **WHEN** a node that is neither endpoint of the proposal moves after its verdict arrived
- **THEN** the verdict is still current and the validator is not called again

#### Scenario: Validator failure
- **WHEN** the validator throws, rejects its promise, exceeds the timeout or answers with something that is not a verdict
- **THEN** the proposal evaluates to a rejection whose code names the failure while the requesting gesture runs

#### Scenario: Retry after a failure
- **WHEN** the user finishes that gesture and starts a new drag over the same ports
- **THEN** the failed entry is gone, the proposal is pending again and the validator is called once more

#### Scenario: Two views, one model
- **WHEN** two views on one model hover the same proposal and one of them is disposed while the request is in flight
- **THEN** the request is not aborted and the other view receives the verdict

#### Scenario: Reset during a request
- **WHEN** the model is reset while a request is in flight and the verdict arrives afterwards
- **THEN** the verdict is ignored and the cache is empty

### Requirement: Rejection delivery to the host
A structured rejection produced by a verdict, by the policy or by commit revalidation, during a pointer gesture or from a view command, SHALL be emitted as a `connection-rejected` event of the view with its code, message, affected entities and whether it came from a gesture or a command, so a host can show it in its own surface. The preview SHALL keep showing the reason at the target. Emitting SHALL NOT change the policy outcome or the model.

#### Scenario: Host shows its own message
- **WHEN** a verdict rejects a dragged connection and the user releases on the target
- **THEN** one `connection-rejected` event carries the validator's code and message with source gesture, and the model is unchanged

### Requirement: Availability and results without a verdict
Checking whether a command that would create a connection is available SHALL report it unavailable for now, with the pending-validation reason, while its plan has no current verdict, and SHALL NOT start a validator request. A command that creates connections without a current verdict for each of them (connect, reconnect, paste, duplicate) SHALL return the unverified result, SHALL create nothing, and SHALL list the proposals that lack a verdict so the host can obtain them before repeating the command.

#### Scenario: Availability without a verdict
- **WHEN** a toolbar asks whether connecting two ports is available and the validator has not answered
- **THEN** the answer is unavailable for now with the pending-validation reason and the validator is not called

#### Scenario: Result lists what is missing
- **WHEN** a fragment with two connections is pasted without verdicts
- **THEN** the result is unverified, lists both proposals, and nothing is pasted

## MODIFIED Requirements

### Requirement: Structured policy outcomes
Policy evaluation SHALL return one of: accept with a connection plan, reject with a reason, choice required (with the alternatives), or pending/unverified. A Boolean alone SHALL NOT be the policy contract. A pending outcome SHALL be resolvable: it becomes accept or reject when the host validator's verdict arrives, and until then the target SHALL NOT be shown or committed as accepted. Each alternative of a choice-required outcome SHALL carry a key that is unique within that outcome and stable across repeated evaluations of the same proposal against the same graph, and MAY carry a display label. A proposal that names one of those keys SHALL be evaluated to that alternative and accepted, or else rejected. A connect command that names a key SHALL be planned through the same policy, so a chosen alternative is validated like any other connection. If the policy still answers choice required for a named key, the command SHALL be rejected with a choice-required reason instead of picking.

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

### Requirement: Commit-time revalidation
A connection SHALL be revalidated at commit against current entity revisions and permissions. A preview accepted earlier SHALL NOT guarantee acceptance at commit. Commit revalidation SHALL be synchronous and use the verdict cache; a proposal whose current verdict is missing or pending at commit SHALL be rejected with the pending-validation reason, except for undo and redo, which restore a state that was accepted before and SHALL NOT be rejected for a missing verdict (a cached rejection still applies).

#### Scenario: Target filled during gesture
- **WHEN** a target input becomes occupied by another edit after the preview showed it compatible
- **THEN** the commit is rejected with an exhausted-capacity reason and no connection is created

#### Scenario: Programmatic connect without a verdict
- **WHEN** a program submits a connect command for a proposal the validator has not answered
- **THEN** the command is not accepted, the result is the unverified outcome, and no connection is created

#### Scenario: Paste without verdicts
- **WHEN** a fragment with two connections is pasted and the validator has answered neither
- **THEN** the result is the unverified outcome listing both proposals and nothing is pasted

#### Scenario: Undo restores a connection
- **WHEN** a deleted connection is restored by undo after its cache entry was evicted
- **THEN** the undo is not rejected for the missing verdict
