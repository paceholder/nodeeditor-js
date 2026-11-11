## ADDED Requirements

### Requirement: One field name for refusals
A refusal is a structured description (code, message, entity IDs) of why an edit, a command or an input was refused, or a list of them for whole-document validation. Every returned or emitted value that reports a refusal SHALL carry it in a field named `rejection`: result objects, edit and plan outcomes, command availability, policy outcomes, host verdicts, model and view events and the React command hook.

#### Scenario: Rejected edit
- **WHEN** a submitted edit is refused
- **THEN** the outcome has `ok: false` and a `rejection` field with the code, message and entity IDs, and no `error` or `reason` field

#### Scenario: Unavailable command
- **WHEN** a command is checked for availability and cannot run
- **THEN** the answer has `available: false` and a `rejection` field

#### Scenario: Policy refusal
- **WHEN** the connection policy refuses a proposal
- **THEN** its outcome has kind `reject` and a `rejection` field

### Requirement: Reason and error are not refusals
A field named `reason` SHALL hold only a plain-text explanation or an enumerated cause of a state that is not a refusal, such as an edit whose outcome is unknown or a connection still waiting for validation. A field named `error` SHALL hold only a value thrown by host code and caught by the library.

#### Scenario: Waiting for validation
- **WHEN** a connect command runs while the host verdict is missing
- **THEN** the result has status `unverified` and a plain-text `reason`

#### Scenario: Throwing handler
- **WHEN** an event handler throws
- **THEN** the failure event carries the thrown value in `error`
