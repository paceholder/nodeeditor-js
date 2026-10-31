## ADDED Requirements

### Requirement: Resize handle
When exactly one node is selected and it may be resized, the view SHALL show one resize handle at the node's bottom-right corner as seen on screen, whatever its rotation and mirroring. Dragging it SHALL resize the node with the diagonally opposite screen corner fixed; Shift SHALL keep the aspect ratio. The handle SHALL have a fixed screen size and be picked geometrically, and a press on it SHALL resize, never connect. A completed resize SHALL be one command and one history entry.

#### Scenario: Corner drag keeps the opposite corner
- **WHEN** the handle of a selected, resizable 100-by-60 node is dragged by 40 world units right and 20 down and released
- **THEN** the node is 140 by 80, its top-left corner is where it was, and the history gains exactly one entry

#### Scenario: Shift keeps the aspect ratio
- **WHEN** the handle of a 100-by-50 node is dragged with Shift held
- **THEN** every preview and the committed size keep a width-to-height ratio of 2

#### Scenario: Handle on a rotated and mirrored node
- **WHEN** a non-square resizable node rotated by one quarter turn and mirrored is selected
- **THEN** the handle sits on the body corner that is lowest and rightmost on screen, dragging it right and down grows the node on screen to the right and down, and the screen top-left corner stays in place

#### Scenario: Clamped while dragging
- **WHEN** the handle is dragged so that the width would fall below the node's minimum
- **THEN** the preview stops at the minimum width, the opposite corner stays in place, and the committed size equals the minimum

#### Scenario: Grid snapping only when enabled
- **WHEN** the handle is dragged with no grid step configured
- **THEN** the size follows the pointer exactly; with a grid step configured the moving corner snaps to the grid unless the snap-suppression modifier is held

#### Scenario: Resize and connect are exclusive
- **WHEN** a port anchor lies on the corner under the handle of the selected node and the user presses there
- **THEN** a resize starts and no connection gesture starts; a press on any other part of that port's capture area starts a connection

#### Scenario: No handle for several nodes
- **WHEN** two resizable nodes are selected
- **THEN** no resize handle is shown and a press on a node's corner starts a move

#### Scenario: No handle without the capability
- **WHEN** the only selected node belongs to a type that did not opt in to resizing, or its resize capability is denied
- **THEN** no resize handle is shown

#### Scenario: Cancel a resize
- **WHEN** Escape is pressed or pointer capture is lost while the handle is being dragged
- **THEN** the preview is discarded, no command is submitted, and the node keeps its committed size and position

#### Scenario: Preview is not submitted
- **WHEN** the handle is dragged across 100 pointer move events and released
- **THEN** the adapter receives exactly one resize command

## MODIFIED Requirements

### Requirement: Auto-pan (SHOULD)
The view SHALL auto-pan when the pointer nears the viewport edge during moving or routing, with bounded speed, immediate stop on gesture end or cancel, and no movement after the gesture terminates. Auto-pan SHALL apply to node moves, connection drags, marquee selection and resize, SHALL keep the gesture's world point under the pointer so its preview follows, SHALL leave the gesture's single commit unchanged, and SHALL request no animation frame once it has stopped.

#### Scenario: Stop on release
- **WHEN** the user releases the pointer while auto-pan is active
- **THEN** the viewport stops moving in the same frame

#### Scenario: Node drag near the edge
- **WHEN** a node is dragged and the pointer is held still inside the right edge band
- **THEN** the viewport keeps panning so content beyond the right edge comes into view, and the dragged node's preview stays under the pointer

#### Scenario: Bounded speed
- **WHEN** a gesture's pointer is held far outside the view while pointer capture keeps the gesture alive
- **THEN** the viewport pans no faster than the configured maximum speed

#### Scenario: Auto-panned move is one history entry
- **WHEN** a node drag auto-pans for two seconds and is then released
- **THEN** one move command is committed with the final position and the history gains exactly one entry

#### Scenario: Cancel during auto-pan
- **WHEN** Escape is pressed while a marquee is auto-panning
- **THEN** panning stops at once, the marquee preview is discarded, and the viewport keeps the position it had reached

#### Scenario: No frames after stopping
- **WHEN** an auto-panned gesture ends and no other input or model change follows for 5 seconds
- **THEN** no animation frames are requested

#### Scenario: Auto-pan turned off
- **WHEN** the host sets the auto-pan option to off and a node is dragged into the edge band
- **THEN** the viewport does not move; with the default options auto-pan is on

#### Scenario: Pan gestures do not auto-pan
- **WHEN** the user pans by dragging empty canvas and the pointer reaches the edge band
- **THEN** no auto-pan happens

### Requirement: Keyboard editing shortcuts
The view SHALL provide keyboard commands to focus or reveal entities, change selection, move selected nodes, delete, undo and redo, copy, cut, paste and duplicate, rotate and mirror selected nodes, and open context actions. A keyboard connection chooser is not required. The default keymap SHALL bind copy, cut, paste and duplicate to the platform's primary modifier with C, X, V and D, rotation to R (clockwise) and Shift+R (counter-clockwise), and mirroring to M (horizontal) and Shift+M (vertical), and each shortcut SHALL run the same command as the API.

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
