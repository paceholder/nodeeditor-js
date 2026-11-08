## ADDED Requirements

### Requirement: Typical host sizes
The harness from the React Flow comparison rule SHALL be reused with fixtures of 50, 200 and 500 nodes, the sizes typical
for a host document, and a 2000-node stress fixture, all with orthogonal connections. The
recorded result SHALL name the browser, device pixel ratio and date.

#### Scenario: Typical-size report
- **WHEN** the harness runs on the four fixtures
- **THEN** the report lists per-workload results for each fixture size
