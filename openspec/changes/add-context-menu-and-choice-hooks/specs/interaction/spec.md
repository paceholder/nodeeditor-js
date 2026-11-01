## ADDED Requirements

### Requirement: INT-11 Context-menu event
The view SHALL raise a context-menu event that hosts subscribe to on the view handle, and SHALL ship no menu. It SHALL fire for the platform context-menu gesture, a touch long-press (INT-11c), and the menu key or Shift+F10 while the editor has focus. It SHALL report the target (node, port, connection or canvas) by stable IDs with the ordered hit list (GEO-04a), the selection, the invocation kind, the modifiers, and client, viewport and world positions.

#### Scenario: Right-click a port
- **WHEN** a listener is registered and the user right-clicks a port of an unselected node
- **THEN** one event reports target port with its node and port IDs, the hit list, and the client, viewport and world positions of the click

#### Scenario: Right-click empty canvas
- **WHEN** a listener is registered, one node is selected, and the user right-clicks empty canvas
- **THEN** the event reports target canvas, the selection is unchanged, and the world position can be used to create or paste there

#### Scenario: Keyboard menu key
- **WHEN** the editor has focus, a connection is the primary selection, and the user presses the menu key or Shift+F10
- **THEN** one event reports target connection with invocation keyboard, positioned at the connection's bounds and not at the pointer, and the selection is unchanged

### Requirement: INT-11a Context-menu selection and browser menu
A pointer or touch invocation on an unselected entity SHALL first make it the selection (a port's node for a port); on a selected entity or empty canvas the selection SHALL stay unchanged. A keyboard invocation SHALL target the primary selected entity (or the canvas), keep the selection, and be placed at that entity or the view centre. The browser's menu SHALL be suppressed only while a listener is registered; without one the view SHALL change nothing.

#### Scenario: Right-click an unselected node
- **WHEN** a listener is registered, node A is selected, and the user right-clicks node B
- **THEN** B becomes the only selected node, the event reports target node B with selection [B], and the browser's own menu does not open

#### Scenario: Right-click inside a multi-selection
- **WHEN** a listener is registered, nodes A and B are selected, and the user right-clicks B
- **THEN** the selection stays [A, B] and the event reports target node B with that selection

#### Scenario: No listener keeps the browser menu
- **WHEN** no listener is registered and the user right-clicks a node
- **THEN** the browser's own context menu opens and the view's selection is unchanged

### Requirement: INT-11b Context-menu scoping and gestures
Text fields, contentEditable, IME composition and host overlay content SHALL NOT raise the event (INT-06). A secondary-button press SHALL NOT start a tool. A press below its drag threshold when the menu is invoked SHALL be cancelled without commit or selection-on-release; during a drag past the threshold no event SHALL be raised. One invocation SHALL raise at most one event, even when the browser also reports it (INT-05, INT-08).

#### Scenario: Right press starts no gesture
- **WHEN** a listener is registered and the user presses the secondary button on a node and moves the pointer by 50 CSS pixels before releasing
- **THEN** no node moves, the view does not pan, and no history entry is added

#### Scenario: Ctrl+click on macOS
- **WHEN** a listener is registered on macOS and the user Ctrl+clicks a node
- **THEN** the press is cancelled, no selection-on-release or move follows, and one event is raised for that node

#### Scenario: Menu key in a text field
- **WHEN** the user presses Shift+F10 inside a text field of an overlay editor
- **THEN** no event is raised and the text field keeps the key (INT-06)

#### Scenario: Context menu on overlay content
- **WHEN** a listener is registered and the user right-clicks host content placed in the overlay
- **THEN** no event is raised and the browser default for that content applies

#### Scenario: No event during a drag
- **WHEN** a node drag has passed its threshold and the user right-clicks before releasing
- **THEN** no event is raised, the drag continues, and its release commits one move (INT-08)

### Requirement: INT-11c Touch long-press
While a context-menu listener is registered, a touch that stays within the touch drag threshold for the long-press duration (default 500 ms, configurable, or turned off) SHALL raise the context-menu event and cancel its press. A touch that passes the threshold first SHALL pan, move or connect as before. A second touch SHALL cancel a pending long-press. No long-press timer SHALL run without a listener.

#### Scenario: Touch long-press
- **WHEN** a listener is registered and a touch rests on a node without moving beyond the touch drag threshold for the long-press duration
- **THEN** exactly one event with invocation touch is raised for that node, lifting the finger neither selects again nor moves anything, and a browser context-menu event for the same touch raises no second event

#### Scenario: Touch drag before the long-press
- **WHEN** a touch on empty canvas moves beyond the touch drag threshold before the long-press duration
- **THEN** the view pans as before and no context-menu event is raised for that touch

#### Scenario: Long-press turned off
- **WHEN** the long-press duration option is turned off and a touch rests on a node for two seconds
- **THEN** no event is raised and releasing selects the node as before

### Requirement: INT-12 Connection-choice request
When a connection drag is released with more than one valid option, the view SHALL ask a host chooser instead of picking, and SHALL ship no picker. An option is a target port, with one policy alternative when the policy offered several (CON-04). Options SHALL cover the ports tied within a small screen distance of the nearest one, in deterministic order (GEO-04a). The request SHALL carry the source, keyed options, the release position, and a cancellation signal.

#### Scenario: Policy offers two connection kinds
- **WHEN** a chooser is installed, the policy returns two alternatives for a port pair, and the user releases a drag on that target port
- **THEN** the chooser receives two options with distinct keys for that port, in policy order, and nothing is committed while it is pending

#### Scenario: Coincident target ports
- **WHEN** a chooser is installed and two compatible ports of overlapping nodes lie under the release point at the same screen distance
- **THEN** the chooser receives one option per port in pick order

#### Scenario: Single valid target does not ask
- **WHEN** a chooser is installed and the release is over exactly one compatible port whose policy accepts directly
- **THEN** one connect command is submitted and the chooser is not called

### Requirement: INT-12a Pending choice resolution
While a choice is pending, the preview SHALL stay at the release point, only Escape among graph shortcuts SHALL run, and nothing SHALL be committed. Choosing an option SHALL submit one connect command, revalidated at commit (CON-05). Declining, a failing chooser, an unknown key, Escape, a new press outside overlay content, disposal, a reset, or removal of the source or an option's port SHALL commit nothing, clear the preview, abort the signal, and ignore later answers (INT-08).

#### Scenario: Host picks an option
- **WHEN** a choice between two connection kinds is pending and the chooser resolves with the second option's key
- **THEN** one connection of the second kind is created as one history entry and the preview is cleared

#### Scenario: Host declines
- **WHEN** the chooser resolves with no option
- **THEN** no command is submitted, the history is unchanged, and the preview is cleared

#### Scenario: Escape while choosing
- **WHEN** a choice is pending and the user presses Escape with focus in the editor or its overlay
- **THEN** the signal is aborted, nothing is committed, the preview is cleared, and a later resolution from the chooser has no effect

#### Scenario: Press elsewhere cancels
- **WHEN** a choice is pending and the user presses on the canvas outside overlay content
- **THEN** the choice is cancelled with nothing committed, and that press does not start a gesture

#### Scenario: Target removed while choosing
- **WHEN** a choice is pending and an external change removes the node of one option's port
- **THEN** the choice is cancelled, the signal is aborted, and nothing is committed

#### Scenario: Dispose while choosing
- **WHEN** the view is disposed while a choice is pending
- **THEN** the signal is aborted, nothing is committed, and no listener or timer remains

#### Scenario: Revalidated at commit
- **WHEN** a choice is pending, another edit fills the chosen target's last free slot, and the host then picks that option
- **THEN** the connect command is rejected with the exhausted-capacity reason and no connection is created (CON-05)

### Requirement: INT-12b Release without a chooser
Without a chooser the view SHALL never pick among policy alternatives. Releasing on a port that requires a choice SHALL commit nothing, and the target SHALL show a choice-required cue that is not color alone (UX-02). Ports that are only tied SHALL keep the deterministic first-in-pick-order target.

#### Scenario: No chooser and a policy choice
- **WHEN** no chooser is installed and the user releases on a port whose policy returns alternatives
- **THEN** nothing is committed, and before release the target showed a choice-required cue that is not color alone

#### Scenario: No chooser and tied ports
- **WHEN** no chooser is installed and two compatible ports are tied under the release point
- **THEN** one connect command is submitted to the first in pick order, as before

## MODIFIED Requirements

### Requirement: INT-04 Connection gestures
The view SHALL support drag-to-connect and click-to-route with finish, backtrack of the last corner, cancel, and optional endpoint reconnection. Tool-specific right-click behavior SHALL NOT disable ordinary context menus outside that tool: outside such a tool a right-click raises the context-menu event (INT-11), or the browser's own menu when the host registered no listener. A release over several valid options SHALL be resolved through the connection-choice hook (INT-12).

#### Scenario: Drag to connect
- **WHEN** the user drags from a port and releases on a compatible port
- **THEN** one connect command is submitted for that port pair

#### Scenario: Click-to-route with backtrack
- **WHEN** the user starts click-to-route, places three corners, backtracks once, and finishes on a compatible port
- **THEN** the submitted connection carries the first two corners as route constraints

#### Scenario: Context menu outside the tool
- **WHEN** no routing gesture is active and the user right-clicks a node
- **THEN** the view raises the context-menu event for that node when a listener is registered, and otherwise the browser's own context menu opens

### Requirement: INT-07 Unified commands
Menus, shortcuts, toolbars, and programmatic callers SHALL invoke the same identifiable commands, each with an availability query that explains unavailability and with structured error results. A host menu SHALL be able to list the registered commands with their label keys, query each one's availability for the current selection, and run one, with the same patch and history behavior as its shortcut.

#### Scenario: Disabled command explains why
- **WHEN** the delete command's availability is queried for a selection containing only locked nodes
- **THEN** it reports unavailable with a reason naming the locked capability

#### Scenario: Same command from shortcut and API
- **WHEN** the same selection is deleted once via shortcut and once via the API on equal models
- **THEN** both produce identical patches

#### Scenario: Menu item runs a command
- **WHEN** a host menu opened from the context-menu event on a node runs the delete command, and the user then presses the undo shortcut
- **THEN** the node is deleted as one history entry exactly as with the Delete shortcut, and the undo restores it

#### Scenario: Paste here from a canvas menu
- **WHEN** a host menu opened on empty canvas runs the paste command with the event's world position
- **THEN** the fragment is pasted centred at that position as one history entry (EDT-03)

### Requirement: UX-01 Keyboard editing shortcuts
The view SHALL provide keyboard commands to focus or reveal entities, change selection, move selected nodes, delete, undo and redo, copy, cut, paste and duplicate, rotate and mirror selected nodes, and open context actions. A keyboard connection chooser is not required. The default keymap SHALL bind copy, cut, paste and duplicate to the platform's primary modifier with C, X, V and D, rotation to R (clockwise) and Shift+R (counter-clockwise), and mirroring to M (horizontal) and Shift+M (vertical), and each shortcut SHALL run the same command as the API. The menu key and Shift+F10 SHALL open context actions by raising the context-menu event for the selection (INT-11, INT-11a).

#### Scenario: Arrow keys move selection
- **WHEN** two nodes are selected and the user presses an arrow key
- **THEN** both nodes move by the configured step as one committed command

#### Scenario: Undo shortcut
- **WHEN** the editor has focus and the user presses the platform undo shortcut
- **THEN** the last local history entry is undone

#### Scenario: Copy and paste shortcuts
- **WHEN** the editor has focus, two connected nodes are selected, and the user presses the platform copy shortcut and then the platform paste shortcut with the pointer over the view
- **THEN** a copy of both nodes and their connection appears centred at the pointer, it becomes the selection, and the history gains one entry

#### Scenario: Duplicate shortcut
- **WHEN** the editor has focus, one node is selected, and the user presses the platform duplicate shortcut
- **THEN** a copy of the node appears at one placement offset from it, the copy becomes the selection, and the browser's own action for that shortcut does not run

#### Scenario: Clipboard shortcut in a text field
- **WHEN** the user presses the platform copy shortcut inside a text field in a node editor overlay
- **THEN** the text field's own copy happens and no graph copy command runs (INT-06)

#### Scenario: Rotate shortcut
- **WHEN** the editor has focus, two nodes are selected, and the user presses R
- **THEN** each node turns a quarter turn clockwise about its own centre in one committed command, and Shift+R turns them back

#### Scenario: Mirror shortcuts
- **WHEN** the editor has focus, one node is selected, and the user presses M and then Shift+M
- **THEN** the node is mirrored horizontally and then vertically, each as one history entry

#### Scenario: Locked node in a rotated selection
- **WHEN** a selection of three nodes, one of which may not rotate, is rotated with R
- **THEN** the two permitted nodes rotate in one committed command and the locked node is unchanged; with only locked nodes the command reports unavailable with the capability reason (INT-07)

#### Scenario: Letter keys in a text field
- **WHEN** the user types R or M inside a text field in a node editor overlay
- **THEN** the letters are typed and no rotate or mirror command runs (INT-06)

#### Scenario: Context actions from the keyboard
- **WHEN** the editor has focus, one node is selected, a context-menu listener is registered, and the user presses Shift+F10
- **THEN** the context-menu event is raised for that node with invocation keyboard, and the browser's own menu does not open

### Requirement: UX-02 Usable shipped controls
DOM controls shipped by the library (overlay editors, dialogs) SHALL have visible focus and no keyboard trap, and reject, pending, choice-required, and error states SHALL NOT be conveyed by color alone. The library SHALL ship no context menu or connection picker. Hosts supply those through the context-menu and connection-choice hooks (INT-11, INT-12), which leave focus with the host while its menu or picker is open. Screen-reader parity for the graph canvas is a non-goal.

#### Scenario: Escape leaves a menu
- **WHEN** a host menu opened from the context-menu event has focus in the overlay and the user presses Escape
- **THEN** no graph shortcut runs, so the selection is unchanged, and the host can close its menu and return focus to the editor root

#### Scenario: Escape leaves a pending choice
- **WHEN** a connection choice is pending, the host's picker has focus inside the overlay, and the user presses Escape
- **THEN** the choice is cancelled with nothing committed, the host is told through the aborted signal, and keyboard focus can return to the editor root

#### Scenario: Rejection not color-only
- **WHEN** a connection target is incompatible during a gesture
- **THEN** the target shows a non-color cue such as a glyph or text reason in addition to color

#### Scenario: Choice required not color-only
- **WHEN** a connection target requires a choice during a gesture
- **THEN** the target shows a glyph distinct from the compatible, incompatible and pending cues
