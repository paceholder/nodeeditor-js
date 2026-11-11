## ADDED Requirements

### Requirement: Whole-document replacement is checked before it changes anything
The local adapter's whole-document replacement (used by snapshot load) SHALL check the replacement before changing the store: valid records, IDs unique across kinds, port ownership in both directions, and present connection endpoints. Invalid input SHALL raise a misuse error with document, revision, history and events unchanged. A replacement requested while events are being delivered SHALL raise a misuse error, as its revision cannot be returned synchronously.

#### Scenario: A replacement naming a missing port
- **WHEN** a replacement lists a node whose ports list names a port that is not in the replacement
- **THEN** a misuse error is raised, and the revision, the nodes and the undo history are unchanged and no event is published

#### Scenario: Replacement from inside a handler
- **WHEN** a change handler requests a whole-document replacement
- **THEN** a misuse error is raised and the document is unchanged

### Requirement: Host verdicts are cleared right after commit
A host connection validator's answers (verdicts) are cached per proposed connection. The cache entries that a committed edit makes stale SHALL be cleared synchronously right after that commit, before any event is delivered and before any queued edit is applied.

#### Scenario: Verdicts invalidated before the next queued edit
- **WHEN** two edits are queued from one handler and the first one removes a port that a cached verdict concerns
- **THEN** the verdict is gone when the second edit is validated
