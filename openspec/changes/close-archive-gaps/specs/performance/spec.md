## MODIFIED Requirements

### Requirement: PERF-01 Repeatable benchmark suite
The project SHALL maintain a benchmark suite with seeded fixture generation, scripts, and production-build configuration that reports p50, p95, and p99 values and visible entity counts for each workload. Fixtures: F-SMALL (100 nodes, 200 connections), F-TYPICAL (1k nodes, 2k connections), F-LARGE (10k nodes, 20k connections), F-LIVE (F-TYPICAL plus 1k decorations updating at 30 Hz), F-ALL (F-LARGE with every node and connection visible at low detail, PERF-02e), F-DENSE (a seeded stress fixture of high-degree nodes, parallel connections, and many crossings, used for correctness and reported worst cases with no budget and no ordinary-drag claim), and F-REACT (F-TYPICAL with interactive React node bodies on a bounded visible subset, a reported profile until React content ships).

Each workload SHALL be measured for at least 30 seconds after warm-up and repeated three times. The report SHALL keep the raw samples, record the machine (browser, operating system, hardware class, display refresh rate, device pixel ratio), include allocation and long-task traces and route-work counts, and SHALL NOT pool percentiles across machines, browsers, or device pixel ratios.

#### Scenario: Same seed, same fixture
- **WHEN** a fixture is generated twice with the same seed
- **THEN** the two graph snapshots are identical

#### Scenario: Report contents
- **WHEN** the benchmark suite runs
- **THEN** each workload reports p50, p95, and p99 values, visible counts, browser, and device pixel ratio

#### Scenario: Method recorded
- **WHEN** the suite finishes a workload
- **THEN** the report holds three repeats with raw samples, the machine record, and long-task and route-work counts, and no figure combines runs from different browsers or pixel ratios

### Requirement: PERF-02 Interaction budgets
For pan, zoom, and single-node drag in F-TYPICAL and culled F-LARGE at a 1440×900 CSS-pixel viewport, measured at device pixel ratios 1 and 2, the frame interval SHALL be at most 16.7 ms at p95 and 33.3 ms at p99, and pointer-to-visible-preview latency at most 33 ms at p95. A budget gates a release only when measured on the approved reference machine, one named configuration recorded in the baseline; on other machines results are reported, not gated. Until measured on it, these are labeled targets.

#### Scenario: Drag budget in F-LARGE
- **WHEN** a single node is dragged for 30 seconds in F-LARGE with up to 1k nodes visible
- **THEN** the reported p95 frame interval is at most 16.7 ms at both device pixel ratios

#### Scenario: Run on another machine
- **WHEN** the suite runs on a machine that is not the approved reference machine
- **THEN** the results are reported with that machine's record and are not used to pass or fail a release budget

### Requirement: PERF-02a Query and update budgets
Candidate and picking queries SHALL take at most 2 ms at p95 in the interaction fixtures. A small local patch (one moved node, up to four incident routes, no asset decoding) SHALL apply at most 4 ms at p95 excluding deferred route refinement. Obstacle-aware refinement of 20 routes SHALL finish within 100 ms at p95 while input stays responsive. F-LARGE projection and index construction SHALL finish within 1 s after parse, and asset loading and the first usable frame SHALL be reported separately from that figure.

#### Scenario: Picking budget
- **WHEN** the pointer moves over F-LARGE during navigation
- **THEN** the reported p95 picking query time is at most 2 ms

#### Scenario: Refinement keeps input responsive
- **WHEN** 20 routes are refined after a node moves in F-TYPICAL
- **THEN** refinement completes within 100 ms at p95 and picking and panning stay within their budgets meanwhile

#### Scenario: First frame reported apart
- **WHEN** F-LARGE is opened
- **THEN** the report lists projection and index time, asset load time, and time to the first usable frame as separate figures

### Requirement: PERF-02d Idle and lifecycle
Once dirty work and intentional animations finish, the view SHALL run no self-sustaining render loop or polling. Repeated mount and dispose SHALL NOT retain disposed views, listeners, or workers, and SHALL NOT grow the heap across cycles. A memory ceiling for F-TYPICAL and F-LARGE SHALL be recorded after the first run on the reference machine and reported as a labeled target; idle and memory figures are recorded separately from frame figures.

#### Scenario: Idle editor
- **WHEN** no input, model change, or animation occurs for 5 seconds
- **THEN** no animation frames are requested

#### Scenario: Thirty mount cycles
- **WHEN** a view is mounted and disposed 30 times after warm-up
- **THEN** no disposed view instance remains reachable and the heap after a forced collection is not larger than after the first cycle beyond a recorded tolerance

### Requirement: PERF-04 Indexed culling and picking
Scene candidates and path segments SHALL be spatially indexed, culling SHALL use full painted bounds, and visible paths whose endpoints are both outside the viewport SHALL still be drawn and pickable. A pick SHALL measure exact distance only to path segments whose indexed bounds lie within the pick tolerance of the pointer, so a long path is not a candidate at points far from its curve. Index updates SHALL be incremental where possible. Offsets that separate parallel or sibling connections between the same endpoints SHALL come from an incrementally maintained index keyed by the endpoint pair, not from counting siblings of each connection on every render.

#### Scenario: Path crossing the viewport
- **WHEN** a connection's endpoints are both off-screen but its path crosses the viewport
- **THEN** the path is drawn and can be selected

#### Scenario: Incremental index update
- **WHEN** one node moves in F-LARGE
- **THEN** only that node's and its incident paths' index entries are updated

#### Scenario: Long path far from the pointer
- **WHEN** the pointer is inside a long connection's overall bounding box but farther than the pick tolerance from every one of its segments' bounds
- **THEN** that connection's exact distance is not computed and it is not a pick candidate

#### Scenario: Parallel connection added
- **WHEN** a third connection is added between two nodes that already have two
- **THEN** only the offsets of the connections sharing that endpoint pair are recomputed and no other connection is visited
