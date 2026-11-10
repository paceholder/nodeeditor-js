## ADDED Requirements

### Requirement: Keyboard focus between nodes
The view SHALL keep at most one focused entity, a node or a port of a node, separate from the browser's focus, which stays on the view's root. Keyboard commands SHALL move the focused entity to the nearest node in an arrow's direction and walk all nodes in a deterministic reading order (top edge, then left edge, then ID), and SHALL let the user add the focused node to the selection, remove it, or make it the only selected node. Tab and Shift+Tab SHALL still move the browser's focus out of the view, so the view is one tab stop and never a keyboard trap. The focused entity SHALL NOT be part of the model, history or snapshots, and SHALL be cleared when its entity leaves the model; a focused port whose node remains SHALL give the focus back to that node.

#### Scenario: Move focus to a neighbour
- **WHEN** node A is focused, node B lies to its right and node C further right, and the user presses the command for moving focus right
- **THEN** node B is focused and the selection is unchanged

#### Scenario: Walk every node
- **WHEN** the user repeats the command for the next node as many times as there are nodes
- **THEN** every node is focused once, in reading order, and focus returns to the first

#### Scenario: Select the focused node
- **WHEN** node B is focused and the user presses the command that makes it the only selected node
- **THEN** the selection is exactly B and the history is unchanged

#### Scenario: Leaving the editor
- **WHEN** a node is focused and the user presses Tab
- **THEN** the browser's focus moves to the next element after the view

#### Scenario: Focused node deleted
- **WHEN** the focused node is deleted
- **THEN** no entity is focused and no error is raised

### Requirement: Focus ring and reveal
The focused entity SHALL be drawn with a focus ring on the interaction layer that does not rely on color alone, following the node's outline or the port's anchor at every zoom, and SHALL be shown only while the view's root has the browser's focus and the last input was a key. Moving the focus SHALL pan the focused entity into view. Drawing or moving the ring SHALL NOT repaint the scene layer.

#### Scenario: Off-screen node
- **WHEN** focus moves to a node outside the viewport
- **THEN** the view pans so the node is visible and its ring is drawn

#### Scenario: Pointer input hides the ring
- **WHEN** a node is focused and the user clicks the canvas
- **THEN** the ring is no longer drawn until the next key press

### Requirement: Keyboard connection
From a focused port the user SHALL be able to start a connection, move through the candidate ports in the existing deterministic candidate order, and commit to one. Each candidate SHALL show the same target state the pointer gesture shows (compatible, incompatible with the rejection's message, occupied, pending, choice required). Committing to a compatible candidate SHALL submit one connect command and add one history entry; committing to an incompatible or occupied one SHALL commit nothing; a choice SHALL be sent to the host's connection chooser as for a pointer release; a pending candidate SHALL wait for the verdict as the pointer gesture does after a release on a pending target. Escape, blur, hiding or locking the view, a reset, and any committed change from any origin that removes or changes the source port, its node or, while a verdict is awaited, the target port or its node SHALL cancel the keyboard connection, submit nothing and emit `gesture-cancelled` with the reason. A candidate that is only focused SHALL NOT be an involved entity.

#### Scenario: Connect from the keyboard
- **WHEN** the user focuses an output port, starts a connection, moves to a compatible input port of another node and commits
- **THEN** one connection joins the two ports, the history gains one entry, and one undo removes it

#### Scenario: Incompatible candidate
- **WHEN** the user commits to a port of another type
- **THEN** nothing is committed and the refusal's message is shown and announced

#### Scenario: Choice from the keyboard
- **WHEN** a chooser is installed and the policy offers two connection kinds for the candidate the user commits to
- **THEN** the chooser receives one request with both options and nothing is committed until it resolves

#### Scenario: Source node changed during the keyboard connection
- **WHEN** a keyboard connection is in progress and an undo changes the source node
- **THEN** the keyboard connection is cancelled with reason `entity-changed` and nothing is committed

### Requirement: Spoken announcements
The view SHALL announce, through one visually hidden polite live region in its overlay, the focused entity, selection changes made from the keyboard, the target state of the candidate during a keyboard connection, the commit or refusal of a keyboard action, a cancelled gesture, and undo and redo with their history labels. Announcements SHALL be coalesced so that only the last one in a frame is spoken and an identical announcement within half a second is not repeated. Every announced text SHALL be replaceable by the host (an entity describer and the view's messages), and the host SHALL be able to turn the live region off and receive the same texts as a view event instead. The live region SHALL be removed when the view is disposed. This is not screen-reader parity: no accessibility node exists per entity.

#### Scenario: Focus is announced
- **WHEN** focus moves to a node titled "Pump"
- **THEN** the live region's text names the node "Pump" and whether it is selected

#### Scenario: Fast key repeat
- **WHEN** the user moves focus across five nodes within one frame
- **THEN** only the last node is announced

#### Scenario: Host replaces the texts
- **WHEN** the host supplies its own describer and messages
- **THEN** every announcement uses the host's texts

#### Scenario: Host has its own live region
- **WHEN** the host turns the live region off
- **THEN** no live region is added to the overlay and the view event carries each announcement's text

## MODIFIED Requirements

### Requirement: Keyboard editing shortcuts
The view SHALL provide keyboard commands to focus or reveal entities, change selection, move selected nodes, delete, undo and redo, copy, cut, paste and duplicate, rotate and mirror selected nodes, and open context actions. Moving focus between nodes and ports, and making a connection from the keyboard, follow the keyboard focus between nodes rule and the keyboard connection rule. The default keymap SHALL bind copy, cut, paste and duplicate to the platform's primary modifier with C, X, V and D, rotation to R (clockwise) and Shift+R (counter-clockwise), and mirroring to M (horizontal) and Shift+M (vertical), and each shortcut SHALL run the same command as the API. The menu key and Shift+F10 SHALL open context actions by raising the context-menu event for the selection.

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
- **THEN** the text field's own copy happens and no graph copy command runs

#### Scenario: Rotate shortcut
- **WHEN** the editor has focus, two nodes are selected, and the user presses R
- **THEN** each node turns a quarter turn clockwise about its own centre in one committed command, and Shift+R turns them back

#### Scenario: Mirror shortcuts
- **WHEN** the editor has focus, one node is selected, and the user presses M and then Shift+M
- **THEN** the node is mirrored horizontally and then vertically, each as one history entry

#### Scenario: Locked node in a rotated selection
- **WHEN** a selection of three nodes, one of which may not rotate, is rotated with R
- **THEN** the two permitted nodes rotate in one committed command and the locked node is unchanged; with only locked nodes the command reports unavailable with the capability reason

#### Scenario: Letter keys in a text field
- **WHEN** the user types R or M inside a text field in a node editor overlay
- **THEN** the letters are typed and no rotate or mirror command runs

#### Scenario: Context actions from the keyboard
- **WHEN** the editor has focus, one node is selected, a context-menu listener is registered, and the user presses Shift+F10
- **THEN** the context-menu event is raised for that node with invocation keyboard, and the browser's own menu does not open
