## ADDED Requirements

### Requirement: Overview navigation target
With the whole of F-LARGE on screen (fit-all at a 1440×900 CSS-pixel viewport, every node and connection visible), zoom and pan, measured at device pixel ratios 1 and 2 with gesture bitmap reuse off, SHALL have a frame interval of at most 33.3 ms at p95, and picking SHALL stay within the budget from the query and update budgets rule. This is a labeled target: the baseline reports whether it is met, and a miss does not fail the build.

#### Scenario: Zoom sweep at fit-all
- **WHEN** the view zooms in and out around fit-all in F-LARGE for 10 seconds
- **THEN** the report lists the p95 frame interval and visible counts at both device pixel ratios, marked met when p95 is at most 33.3 ms

#### Scenario: Exact frames are measured
- **WHEN** the overview workload runs
- **THEN** gesture bitmap reuse is off, so every measured frame is a full repaint

## MODIFIED Requirements

### Requirement: Indexed culling and picking
Scene candidates and path segments SHALL be spatially indexed, culling SHALL use full painted bounds, and visible paths whose endpoints are both outside the viewport SHALL still be drawn and pickable. A pick SHALL measure exact distance only to path segments whose indexed bounds lie within the pick tolerance of the pointer, so a long path is not a candidate at points far from its curve. Index updates SHALL be incremental where possible.

#### Scenario: Path crossing the viewport
- **WHEN** a connection's endpoints are both off-screen but its path crosses the viewport
- **THEN** the path is drawn and can be selected

#### Scenario: Incremental index update
- **WHEN** one node moves in F-LARGE
- **THEN** only that node's and its incident paths' index entries are updated

#### Scenario: Long path far from the pointer
- **WHEN** the pointer is inside a long connection's overall bounding box but farther than the pick tolerance from every one of its segments' bounds
- **THEN** that connection's exact distance is not computed and it is not a pick candidate
