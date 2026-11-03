## ADDED Requirements

### Requirement: Verification layers
The project SHALL state which verification layer gives evidence for which kind of claim. Snapshots alone SHALL NOT prove model correctness, a DOM emulator SHALL NOT count as rendering-speed evidence, and finishing a use case SHALL NOT waive a requirement clause that no test exercises.

#### Scenario: Statement published
- **WHEN** the repository documentation is checked
- **THEN** it maps headless tests (model, commands, patches, policy), geometry property tests (transform round trips, undirected endpoint-order invariance), real-browser tests (rendering, input), failure injection through adapter and asset stubs, visual snapshots (supplementary only), and performance runs to the claims they support, and names the command for each

### Requirement: Extension acceptance checklist
The documentation SHALL list the demonstrations that show the extension contracts work, each linked to an example or test.

#### Scenario: Checklist items
- **WHEN** the checklist is reviewed
- **THEN** it covers custom geometry with a reused painter, a new port glyph only, a replaced connection policy, a custom path painter and picker, a junction type that grows ports on an instance, an external adapter with no mirrored store, a React form node and a non-React symbol view over one graph, and a custom tool added without changing existing tools

#### Scenario: Item not yet demonstrable
- **WHEN** an item has no example or test yet
- **THEN** it is marked pending and names the change that will provide it
