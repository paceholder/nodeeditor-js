## ADDED Requirements

### Requirement: Picking benchmark with routed connections
The benchmark suite SHALL include picking workloads on a seeded fixture in which every connection is routed orthogonally with rounded corners, with picks at points on connection paths and at dense crossings, at zoom 1 and at the fit-all zoom, headless and in the browser. Each workload SHALL report p50, p95 and p99 pick time and allocations per pick, and the recorded result SHALL name the machine, browser, device pixel ratio and date.

#### Scenario: Routed pick report
- **WHEN** the suite runs the routed picking workload
- **THEN** the report lists p50, p95 and p99 pick time and allocations per pick at both zoom levels

#### Scenario: Same seed, same picks
- **WHEN** the workload runs twice with the same seed
- **THEN** both runs pick the same entities at the same points

### Requirement: Prepared polyline parts for picking
This requirement is provisional: it stays only if the routed picking benchmark shows that rebuilding polyline parts costs enough to matter, and is removed from this change otherwise. Picking SHALL NOT rebuild the straight segments and corner arcs of a polyline piece that has not changed since it was last measured. The prepared parts SHALL belong to the scene instance that built the piece, SHALL be discarded when the piece's connection or one of its nodes changes, and SHALL NOT be shared through any module-level state. Pick results SHALL be identical with and without prepared parts.

#### Scenario: Repeated picks on one piece
- **WHEN** the pointer is picked 100 times near the same rounded orthogonal connection
- **THEN** the parts of each measured piece are built once and every pick returns the same hit as without prepared parts

#### Scenario: Node moved
- **WHEN** a node at one end of that connection moves and the connection is picked again
- **THEN** the distance is measured on the moved path, not on parts prepared before the move

#### Scenario: Two scenes
- **WHEN** two scenes show the same document
- **THEN** each prepares its own parts and neither reads the other's
