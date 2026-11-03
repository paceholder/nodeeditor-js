## MODIFIED Requirements

### Requirement: Revisioned synchronization mode
An external adapter SHALL be able to push a full reset or incremental changes tagged with revisions, and SHALL receive submitted patches with operation ID and base revision. Revision ordering SHALL be declared by the adapter, not inferred from token text. An external adapter SHALL announce every change to the library as a reset or a tagged change; it SHALL NOT mutate records the library has already read without announcing it.

#### Scenario: Incremental change applied
- **WHEN** the adapter pushes a change whose predecessor is the current revision
- **THEN** the change is applied and the read model advances to the new revision

#### Scenario: Unannounced mutation
- **WHEN** an adapter's backing store changes without a reset or tagged change being pushed
- **THEN** the library's read model is unchanged and the documentation names this as adapter misuse
