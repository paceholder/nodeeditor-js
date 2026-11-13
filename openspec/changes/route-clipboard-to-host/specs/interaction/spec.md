## ADDED Requirements

### Requirement: Clipboard events follow the keymap
The browser's native copy, cut and paste events, from a key press or the browser's Edit menu, SHALL run the view's copy, cut or paste command only when the view's keymap binds at least one chord to that command. When no chord is bound to it, the event SHALL run no command, change nothing in the graph or the clipboard, and keep the browser's default action. With the default keymap every route SHALL behave as before.

#### Scenario: Unbound cut keeps the selection
- **WHEN** a view is mounted with a keymap that has no binding for the cut command, a node is selected, the root has focus, and the browser fires a native cut event
- **THEN** the node is still in the graph, the history gains no entry, the event's default action is not prevented, and the event's clipboard data is not written

#### Scenario: Unbound copy and paste run nothing
- **WHEN** a view is mounted with a keymap that has no bindings for the copy and paste commands, a node is selected, the root has focus, and the browser fires a native copy event and then a native paste event that carries fragment text
- **THEN** no fragment is written to the event's clipboard data, nothing is pasted, the history gains no entry, and neither event's default action is prevented

#### Scenario: The other clipboard commands stay
- **WHEN** a view is mounted with the default keymap minus only the cut binding, two nodes are selected, and the browser fires a native copy event and then a native paste event with the copied text
- **THEN** the copy writes the fragment and the paste adds a copy of both nodes as one history entry

#### Scenario: Default keymap unchanged
- **WHEN** a view is mounted with the default keymap, a node is selected, and the browser fires a native cut event
- **THEN** the node is removed as one history entry and its fragment is written to the event's clipboard data

#### Scenario: Command still runs from the API
- **WHEN** a view is mounted with a keymap that has no binding for the copy command and the host runs the copy command through the view's command API with a node selected
- **THEN** the command copies the node, because the keymap governs only keyboard and browser-menu input

### Requirement: Native clipboard bindings are only for copy, cut and paste
A keymap binding can be marked native, which means the key press is left to the browser so that it fires its copy, cut or paste event and the event runs the command. The mark SHALL take effect only on a binding for the copy, cut or paste command. On a binding for any other command it SHALL be ignored: the key press SHALL run that command directly, like any other binding.

#### Scenario: The native flag on another command is ignored
- **WHEN** a view is mounted with a keymap that binds a chord to the undo command and marks that binding as native, and the user presses that chord on the focused root
- **THEN** the key-down runs undo once and is default-prevented, and no clipboard command runs

### Requirement: Host handled clipboard commands
A command that a host registers under the ID of the built-in copy, cut, paste or duplicate command SHALL replace the built-in one for every route that runs that ID: its shortcut, the matching native clipboard event (with that event's arguments) and a host menu. When it runs, the library SHALL NOT encode a fragment, fill its clipboard buffer, write the system clipboard, report a paste, or change the model. Removing the replacement SHALL leave no command under that ID for the life of the view.

#### Scenario: Paste handed to the host
- **WHEN** the host replaces the paste command with one that only records its call, and the user presses the platform paste shortcut on the focused view, so the browser fires a native paste event with some text
- **THEN** the host's command runs once with that text, the graph and the history are unchanged, and the view reports no paste

#### Scenario: Duplicate handed to the host
- **WHEN** the host replaces the duplicate command with one that only records its call, a node is selected, and the user presses the platform duplicate shortcut
- **THEN** the host's command runs once, it can read the selected node from the view's selection, and no node is added

#### Scenario: Cut handed to the host deletes nothing
- **WHEN** the host replaces the cut command with one that only records its call, a node is selected, and the browser fires a native cut event
- **THEN** the host's command runs once with the event's text sink, the node is still in the graph, and the history gains no entry

#### Scenario: Menu runs the host's command
- **WHEN** the host replaces the paste command and a host menu runs the paste command with a world position
- **THEN** the host's command runs with that position and the library pastes nothing

#### Scenario: Removing a replacement does not restore the built-in
- **WHEN** the host replaces the paste command and later removes its replacement, and the browser fires a native paste event with fragment text on the focused root
- **THEN** no command runs under that ID, nothing is pasted, and the command API reports the paste command as unknown

#### Scenario: Replacement respects the view lock
- **WHEN** the host replaces the paste command without allowing it while locked, the view is locked, and the browser fires a native paste event on the focused root
- **THEN** the host's command does not run and the paste is refused with the view-locked reason

### Requirement: Pointer position in the command context
The context a view passes to a running command SHALL include the world position of the pointer while the pointer is over the view, the same point the built-in paste centres a fragment on, and SHALL leave it absent while the pointer is outside the view or the view has no pointer input. The field SHALL be optional, so a context built without it stays valid.

#### Scenario: Paste shortcut with the pointer over the view
- **WHEN** the host replaces the paste command, the pointer rests over the view at a known world position, and the user presses the platform paste shortcut
- **THEN** the host's command receives a context whose pointer position equals that world position

#### Scenario: Pointer outside the view
- **WHEN** the host replaces the duplicate command, the pointer has left the view, and the user presses the platform duplicate shortcut
- **THEN** the host's command receives a context without a pointer position
