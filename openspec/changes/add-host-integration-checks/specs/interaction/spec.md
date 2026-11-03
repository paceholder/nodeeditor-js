## ADDED Requirements

### Requirement: INT-15 Selection change origin
Selection change events SHALL state whether the change came from user input or from a call on
the selection API, so a host that mirrors selection in another panel can ignore its own echo
(INT-02).

#### Scenario: Programmatic selection
- **WHEN** the host selects a node by ID through the selection API
- **THEN** the event carries origin `api`, no event loop is needed, and a user click carries `user`

### Requirement: INT-16 Shortcut unbinding and focus scope
A host SHALL be able to remove or replace the default binding of any chord or command, and
shortcuts SHALL act only while the editor root has focus (INT-06, UX-01).

#### Scenario: Host takes a key
- **WHEN** the host mounts with a keymap that omits the default rotate binding and handles that key itself
- **THEN** the key does not run the graph command, and other defaults still work

#### Scenario: Focus elsewhere
- **WHEN** focus is in another panel and Delete is pressed
- **THEN** the graph is unchanged
