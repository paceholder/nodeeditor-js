## ADDED Requirements

### Requirement: Base revision is checked by the local adapter
A submission's base revision is the revision of the read model its patch was planned against. The local in-memory adapter SHALL reject a submission whose base revision differs from the current revision with the code `stale-revision`, changing nothing and reporting it like any other rejected edit. Undo and redo SHALL never be refused for a stale base revision. Without a base revision from the caller, the model SHALL use the current one.

#### Scenario: Stale base revision
- **WHEN** a caller reads the revision, another edit is accepted, and the caller submits a patch with the revision it read
- **THEN** the outcome is rejected with code `stale-revision` and the document is unchanged

#### Scenario: Current base revision
- **WHEN** a caller submits a patch with the model's current revision
- **THEN** the edit is accepted

### Requirement: Queued submissions are checked when submitted
A submission made from inside an event handler is queued and applied after the current dispatch. Its base revision SHALL be checked when it is submitted, not when it is applied, so several edits queued from one handler are not refused because the earlier ones advanced the revision.

#### Scenario: Two edits queued from one handler
- **WHEN** a change handler submits two edits, each with the revision current when it was submitted
- **THEN** both are applied after the dispatch
