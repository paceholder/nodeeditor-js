## ADDED Requirements

### Requirement: Accessible name prop
The React mounting component SHALL accept a label prop that names the view's root for assistive technology, defaulting to "Node editor". A change of the prop SHALL update the mounted view's accessible name without mounting a new view, and removing the prop SHALL restore the default name.

#### Scenario: Label changes
- **WHEN** the component is rendered with the label "Circuit diagram" and then with "Pump schematic"
- **THEN** the same view stays mounted and its root's accessible name is "Pump schematic"

#### Scenario: Label removed
- **WHEN** the label prop is removed
- **THEN** the root's accessible name is "Node editor"
