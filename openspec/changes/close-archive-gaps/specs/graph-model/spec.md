## MODIFIED Requirements

### Requirement: Immutable read snapshots
Values returned by reads and subscriptions SHALL be typed as deep-readonly and SHALL NOT expose writable references to committed state. Snapshots, descriptors, and subscription values SHALL each have a documented ownership and lifetime. In development and test builds they SHALL be frozen so accidental writes fail; production builds MAY skip freezing.

#### Scenario: Write attempt in development build
- **WHEN** code in a development build assigns to a property of a node returned by a read
- **THEN** the assignment throws and the model is unchanged

#### Scenario: Snapshot lifetime
- **WHEN** a caller keeps a snapshot and the model later changes
- **THEN** the kept snapshot still shows the old state and the model shows the new state

#### Scenario: Subscription value lifetime
- **WHEN** a subscriber keeps the value delivered by a notification and a later change occurs
- **THEN** the kept value is unchanged
