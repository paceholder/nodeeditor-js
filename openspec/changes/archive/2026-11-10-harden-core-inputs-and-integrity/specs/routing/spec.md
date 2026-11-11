## ADDED Requirements

### Requirement: Route constraints are bounded
A route constraint is a pinned segment a connection's route must pass along, stored on the connection. A connection SHALL hold at most 256 route constraints; record validation SHALL reject more with `limit-exceeded`, and snapshot validation SHALL accept a lower host limit and check the count before reading the entries.

#### Scenario: A route with a million pins
- **WHEN** a snapshot connection carries a million route constraints
- **THEN** validation fails quickly with `limit-exceeded` at that connection's route

#### Scenario: A patch with too many pins
- **WHEN** a patch sets a connection's route to 257 constraints
- **THEN** the patch is rejected with `limit-exceeded`

### Requirement: Pinned orthogonal routing is linear
Building an orthogonal route through its pinned segments SHALL take time proportional to the number of pins.

#### Scenario: Many pins of one orientation
- **WHEN** a route through the largest allowed number of pins, all of one orientation, is built ten times its size apart
- **THEN** the build time grows about linearly with the pin count
