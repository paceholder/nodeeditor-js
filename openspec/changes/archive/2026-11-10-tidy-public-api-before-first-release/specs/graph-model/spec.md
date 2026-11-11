## ADDED Requirements

### Requirement: One revision type
A revision is a non-negative integer that counts the changes shown by a model's read model, starting at 0. The model, its reader, the graph state, accepted edit outcomes, change and reset events, the snapshot load report and the host validator request SHALL all express a revision as that same integer, so two of them compare with plain equality. A host's own revision token, such as a server revision attached to a pushed snapshot, is a separate value and SHALL NOT be required to fit this type.

#### Scenario: Reader and model agree
- **WHEN** an edit is accepted
- **THEN** the outcome's revision, the change event's revision, the model's revision and the reader's revision are the same integer

### Requirement: Operation ID constructor
The core entry point SHALL export a constructor that turns a text into an operation ID, so a caller can tag a submitted edit with its own operation ID without a type cast. The constructor SHALL accept the same IDs as the entity ID constructors (non-empty, no whitespace) and SHALL throw a misuse error for any other value.

#### Scenario: Own operation ID
- **WHEN** a caller submits a patch with an operation ID built by the constructor from "save-1"
- **THEN** the accepted outcome and the change event carry the operation ID "save-1"

#### Scenario: Malformed operation ID
- **WHEN** the constructor is called with an empty text or one containing a space
- **THEN** it throws a misuse error
