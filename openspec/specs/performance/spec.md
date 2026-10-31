# performance Specification

## Purpose

Defines measurable responsiveness: a repeatable seeded benchmark suite, target budgets for
its fixtures, bundle-size budgets, idle and lifecycle behavior, and the presentation-work
rules that make the budgets achievable.

## Requirements

### Requirement: Repeatable benchmark suite
The project SHALL maintain a benchmark suite with seeded fixture generation, scripts, and production-build configuration that reports p50, p95, and p99 values and visible entity counts for each workload. Fixtures: F-SMALL (100 nodes, 200 connections), F-TYPICAL (1k nodes, 2k connections), F-LARGE (10k nodes, 20k connections), F-LIVE (F-TYPICAL plus 1k decorations updating at 30 Hz).

#### Scenario: Same seed, same fixture
- **WHEN** a fixture is generated twice with the same seed
- **THEN** the two graph snapshots are identical

#### Scenario: Report contents
- **WHEN** the benchmark suite runs
- **THEN** each workload reports p50, p95, and p99 values, visible counts, browser, and device pixel ratio

### Requirement: Interaction budgets
For pan, zoom, and single-node drag in F-TYPICAL and culled F-LARGE at a 1440×900 CSS-pixel viewport, measured at device pixel ratios 1 and 2, the frame interval SHALL be at most 16.7 ms at p95 and 33.3 ms at p99, and pointer-to-visible-preview latency at most 33 ms at p95. Until measured, these are labeled targets.

#### Scenario: Drag budget in F-LARGE
- **WHEN** a single node is dragged for 30 seconds in F-LARGE with up to 1k nodes visible
- **THEN** the reported p95 frame interval is at most 16.7 ms at both device pixel ratios

### Requirement: Query and update budgets
Candidate and picking queries SHALL take at most 2 ms at p95 in the interaction fixtures. A small local patch (one moved node, up to four incident routes, no asset decoding) SHALL apply at most 4 ms at p95 excluding deferred route refinement. F-LARGE projection and index construction SHALL finish within 1 s after parse.

#### Scenario: Picking budget
- **WHEN** the pointer moves over F-LARGE during navigation
- **THEN** the reported p95 picking query time is at most 2 ms

### Requirement: Live update budget
In F-LIVE, navigation SHALL meet the F-TYPICAL interaction budgets while 1k decorations update at 30 Hz through the adapter, and coalesced or dropped presentation updates SHALL be reported.

#### Scenario: Status updates do not replace the graph
- **WHEN** F-LIVE runs for 30 seconds
- **THEN** no update replaces the whole graph and the report lists the number of coalesced updates

### Requirement: Bundle-size budgets
The core entry point SHALL be at most 75 KiB gzip, and core plus the default symbol renderer and tools at most 150 KiB gzip. React and optional router assets SHALL be measured separately.

#### Scenario: Bundle check
- **WHEN** the production build is measured
- **THEN** the report lists gzip sizes per entry point and fails if a budget is exceeded

### Requirement: Idle and lifecycle
Once dirty work and intentional animations finish, the view SHALL run no self-sustaining render loop or polling. Repeated mount and dispose SHALL NOT retain disposed views, listeners, or workers.

#### Scenario: Idle editor
- **WHEN** no input, model change, or animation occurs for 5 seconds
- **THEN** no animation frames are requested

#### Scenario: Thirty mount cycles
- **WHEN** a view is mounted and disposed 30 times after warm-up
- **THEN** no disposed view instance remains reachable

### Requirement: Overview navigation target
With the whole of F-LARGE on screen (fit-all at a 1440×900 CSS-pixel viewport, every node and connection visible), zoom and pan, measured at device pixel ratios 1 and 2 with gesture bitmap reuse off, SHALL have a frame interval of at most 33.3 ms at p95, and picking SHALL stay within the budget from the query and update budgets rule. This is a labeled target: the baseline reports whether it is met, and a miss does not fail the build.

#### Scenario: Zoom sweep at fit-all
- **WHEN** the view zooms in and out around fit-all in F-LARGE for 10 seconds
- **THEN** the report lists the p95 frame interval and visible counts at both device pixel ratios, marked met when p95 is at most 33.3 ms

#### Scenario: Exact frames are measured
- **WHEN** the overview workload runs
- **THEN** gesture bitmap reuse is off, so every measured frame is a full repaint

### Requirement: Bounded dirty-driven work
Presentation work SHALL be dirty-driven and bounded. Ordinary pointer motion SHALL NOT copy the full graph, scan every connection per visible connection, or re-evaluate host application values.

#### Scenario: Pointer hover
- **WHEN** the pointer moves over the canvas without changing state
- **THEN** no snapshot copy is made and only the interaction layer may repaint

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

### Requirement: Bounded caches
Geometry, route, text, and decoded-asset caches SHALL be keyed by revision or lifetime and bounded in size. High-degree and dense cases SHALL be reported as such rather than claimed constant-time.

#### Scenario: Asset cache bound
- **WHEN** zooming through many zoom buckets with 500 distinct image assets
- **THEN** the decoded bitmap cache stays within its configured limit by evicting least-recently-used entries

### Requirement: Low-detail rendering
Low-detail rendering MAY suppress nonessential text and decorations but SHALL preserve attachment and junction distinctions, selected targets, and discoverable errors.

#### Scenario: Zoomed out with an error
- **WHEN** the view is zoomed out into low-detail mode and one node has an error
- **THEN** the node's error indicator remains visible and selected nodes remain distinguishable

### Requirement: Comparison with React Flow
The benchmark suite SHALL compare the library against React Flow on equivalent fixtures and visual detail, reporting workload-dependent benefits and regressions rather than a global speed claim.

#### Scenario: Comparison report
- **WHEN** the comparison runs on F-TYPICAL and F-LARGE
- **THEN** the report shows both libraries' results per workload under the same browser and device pixel ratio
