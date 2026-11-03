## MODIFIED Requirements

### Requirement: SIG-01 Stable signature description
Signatures SHALL be described by stable schema/version identifiers and member keys, independent of painter, label, port order, and application payload storage. Equal labels SHALL NOT make two member keys match; any equality or mapping between different keys SHALL be declared by the schema or the policy.

#### Scenario: Relabel member
- **WHEN** a member's display label changes
- **THEN** its key, schema reference, and existing bindings are unchanged

#### Scenario: Same label, different key
- **WHEN** two members of different signatures have the same label and different keys and no mapping is declared
- **THEN** the default policy does not treat them as matching
