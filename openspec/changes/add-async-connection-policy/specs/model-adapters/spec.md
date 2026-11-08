## MODIFIED Requirements

### Requirement: Validation identity
Cached per-frame validation SHALL be separate from authoritative commit validation. Asynchronous validation results SHALL carry the candidate, signature, and revision they apply to and SHALL NOT approve a different or superseded candidate. A result for a candidate that is no longer current SHALL NOT change the outcome for the current candidate; it MAY be kept under its own key for reuse.

#### Scenario: Late validation result
- **WHEN** an async validation result arrives for a candidate the user has already moved away from
- **THEN** the result is kept under its own key only and the current candidate stays pending
