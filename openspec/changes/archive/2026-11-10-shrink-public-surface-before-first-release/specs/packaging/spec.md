## ADDED Requirements

### Requirement: Entries export only names a host needs
Each public entry point SHALL export only names a host needs to mount, configure or extend the editor, including the names for writing a custom geometry, router, painter, connection policy, tool or model adapter. A name only the library's own modules use, such as a low-level math helper, a finiteness predicate or an internal gesture step, SHALL NOT be exported. The number of exported names and of runtime values per entry SHALL NOT exceed a ceiling the repository states and checks.

#### Scenario: Removed internal name stays out
- **WHEN** the entries are built
- **THEN** none of the names recorded as removed internal helpers is exported by any entry

#### Scenario: Growth needs a decision
- **WHEN** a change adds an export so that an entry has more exported names than its stated ceiling
- **THEN** the repository tests fail until the ceiling is raised in the same change
