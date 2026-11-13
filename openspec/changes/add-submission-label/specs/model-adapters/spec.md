## ADDED Requirements

### Requirement: Describing decoded intents as data
The library SHALL provide a pure function from the intents of a submission to one data entry per intent, in the same order, for a host that names its own history steps. Each entry SHALL carry the intent's kind and a count of what it touches: nodes for a move, resize, rotate, mirror or delete (a delete also counts the connections removed with them), one for a create node, connect, disconnect or reconnect, and operations for the catch-all. The entries SHALL hold no display text and no entity IDs, so the host chooses the wording and language. The function SHALL NOT change its input.

#### Scenario: Multi-select delete
- **WHEN** a submission removes seven nodes and the three connections attached to them
- **THEN** the description is one entry of kind delete with count 7 and three connections

#### Scenario: Multi-select move
- **WHEN** a submission moves three nodes by the same delta
- **THEN** the description is one entry of kind move with count 3

#### Scenario: Several intents keep their order
- **WHEN** a submission holds a disconnect followed by an unrelated connect
- **THEN** the description has two entries, disconnect then connect, each with count 1

#### Scenario: Catch-all counts operations
- **WHEN** a submission holds two operations that no intent names
- **THEN** the description is one entry of kind other with count 2

#### Scenario: Data only
- **WHEN** any intents are described
- **THEN** no entry contains text meant for display or an entity ID, and the intents passed in are unchanged

#### Scenario: Empty input
- **WHEN** an empty list of intents is described
- **THEN** the description is an empty list
