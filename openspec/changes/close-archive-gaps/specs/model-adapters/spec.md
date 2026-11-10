## MODIFIED Requirements

### Requirement: Revisioned synchronization mode
An external adapter SHALL be able to push a full reset or incremental changes tagged with the host's own revision tokens, and SHALL receive submitted patches with operation ID and base revision. The base revision is the library's revision: the non-negative integer counting the changes of the read model the patch was planned against. A host's revision token is a separate value of the host's choosing; its ordering SHALL be declared by the adapter, not inferred from token text, and it SHALL NOT be stored as the library's revision. An external adapter SHALL announce every change to the library as a reset or a tagged change; it SHALL NOT mutate records the library has already read without announcing it.

#### Scenario: Incremental change applied
- **WHEN** the adapter pushes a change whose predecessor token is the last applied host token
- **THEN** the change is applied, the adapter records the new host token, and the library's integer revision increases by one

#### Scenario: Unannounced mutation
- **WHEN** an adapter's backing store changes without a reset or tagged change being pushed
- **THEN** the library's read model is unchanged and the documentation names this as adapter misuse
