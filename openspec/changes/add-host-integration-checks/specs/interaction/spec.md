## ADDED Requirements

### Requirement: Selection change origin
Selection change events SHALL state whether the change came from user input or from a call on the selection API, so a host that mirrors selection in another panel can ignore its own echo. The origin SHALL be `"user"` (the user's pointer or keys), `"api"` (a call on the selection API) or `"model"` (selected entities left the model, for example through a delete, a pushed snapshot or a reset). Every selection call SHALL accept an optional origin that defaults to `"api"`, and the view's own tools SHALL pass `"user"` for changes caused by pointer or keyboard input. The origin SHALL be a field of the view's `selection` event and of the snapshot that the selection hook for React returns, so a host never needs a second subscription. A programmatic selection that names an ID the model does not contain SHALL ignore that ID without an error and report that nothing changed, because a host tree can hold IDs of entities that are not nodes.

#### Scenario: Programmatic selection
- **WHEN** the host selects a node by ID through the selection API without naming an origin
- **THEN** the event carries origin `api`, no pointer event is needed, and a user click on a node carries `user`

#### Scenario: Unknown ID
- **WHEN** the host selects an ID that is not in the model
- **THEN** the call throws nothing, the selection is unchanged, and the result reports no change

#### Scenario: Entity deleted
- **WHEN** a selected node is deleted, by the user's Delete key or by a command
- **THEN** the selection event that drops it carries origin `model`, so a host that ignores `api` echoes still learns the node is gone

#### Scenario: Unknown ID is dropped at once
- **WHEN** the host selects an ID that is not in the model and the selection was empty
- **THEN** the selection stays empty immediately, and no later model change produces a surprising event for that ID

### Requirement: Shortcut unbinding and focus scope
A host SHALL be able to remove or replace the default binding of any chord or command, and to
add bare-key bindings such as `R` for rotate and `F` for mirror. Shortcuts SHALL act only while
the editor root has focus, or while a host-supplied predicate returns true. A key typed in a
text field SHALL never run a graph command.

#### Scenario: Host takes a key
- **WHEN** the host mounts with a keymap that omits the default rotate binding and handles that key itself
- **THEN** the key does not run the graph command, and other defaults still work

#### Scenario: Host adds bare keys
- **WHEN** the host binds `R` to rotate and `F` to mirror and the editor has focus with a node selected
- **THEN** each key runs its command once, and the same keys do nothing when focus is in another panel

#### Scenario: Host predicate
- **WHEN** the host supplies a predicate that returns true while its own canvas panel is active
- **THEN** shortcuts run while it returns true even if the editor root is not focused, and stop when it returns false

#### Scenario: Text field
- **WHEN** a text field has focus and the user types a letter bound to a command or presses Delete
- **THEN** the text field receives the key and the graph is unchanged

#### Scenario: Focus elsewhere
- **WHEN** focus is in another panel and Delete is pressed
- **THEN** the graph is unchanged

## MODIFIED Requirements

### Requirement: Selection
The view SHALL support single, additive, and toggle selection, clear selection, and marquee selection with documented containment or intersection behavior. The marquee behavior SHALL be a host option with three values: by drag direction (the default: dragging left to right selects fully covered nodes and dragging right to left also selects partly covered ones), always fully covered nodes, and always every node the rectangle touches. Nodes and connections SHALL be selectable together.

#### Scenario: Additive selection
- **WHEN** the user clicks a node, then clicks a connection with the additive modifier
- **THEN** both the node and the connection are selected

#### Scenario: Marquee containment
- **WHEN** the user drags a marquee in containment mode that fully covers one node and partially covers another
- **THEN** only the fully covered node is selected

#### Scenario: Marquee intersection in both directions
- **WHEN** the option is set to select every node the rectangle touches and the user drags a marquee that fully covers one node and partially covers another, once left to right and once right to left
- **THEN** both nodes are selected in both drags

#### Scenario: Marquee by direction
- **WHEN** the option is left at its default and the same rectangle is dragged left to right and then right to left
- **THEN** the first drag selects only the fully covered node and the second selects both

#### Scenario: Clear selection
- **WHEN** the user clicks empty canvas without modifiers
- **THEN** the selection becomes empty
