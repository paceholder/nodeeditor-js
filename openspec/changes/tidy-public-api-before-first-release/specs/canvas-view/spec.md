## ADDED Requirements

### Requirement: Accessible name option
The view's mount options SHALL include a label that becomes the accessible name of the view's root element, the name assistive technology announces for the editor. Without the option the name SHALL be "Node editor".

#### Scenario: Label given at mount
- **WHEN** a view is mounted with the label "Circuit diagram"
- **THEN** its root's accessible name is "Circuit diagram"

#### Scenario: No label
- **WHEN** a view is mounted without a label
- **THEN** its root's accessible name is "Node editor"
