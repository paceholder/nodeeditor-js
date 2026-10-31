## ADDED Requirements

### Requirement: INT-10 Resize handles
When exactly one node is selected and it may be resized, the view SHALL show eight handles at its corners and edge midpoints, placed in the node's frame so they follow rotation and mirroring. Dragging a handle SHALL resize the node with the opposite corner or edge fixed, and Shift SHALL keep the aspect ratio. Handles SHALL have a fixed screen size and be picked geometrically. A completed resize SHALL be one command and one history entry.

#### Scenario: Corner drag keeps the opposite corner
- **WHEN** the bottom-right handle of a selected 100-by-60 node is dragged by 40 world units right and 20 down and released
- **THEN** the node is 140 by 80, its top-left corner is where it was, and the history gains exactly one entry

#### Scenario: Edge handle changes one dimension
- **WHEN** the left edge handle of a selected node is dragged to the left
- **THEN** only the width grows, the right edge stays in place, and the height is unchanged

#### Scenario: Shift keeps the aspect ratio
- **WHEN** a corner handle of a 100-by-50 node is dragged with Shift held
- **THEN** every preview and the committed size keep a width-to-height ratio of 2

#### Scenario: Handles follow rotation
- **WHEN** a non-square node rotated by one quarter turn is selected
- **THEN** its handles sit on the corners and edge midpoints of the rotated body, and dragging the handle on its screen-right side widens the node on screen to the right

#### Scenario: Clamped while dragging
- **WHEN** a handle is dragged so that the width would fall below the node's minimum
- **THEN** the preview stops at the minimum width, the fixed side stays in place, and the committed size equals the minimum

#### Scenario: No handles for several nodes
- **WHEN** two nodes are selected
- **THEN** no resize handles are shown and a press on a node's corner starts a move

#### Scenario: No handles without the capability
- **WHEN** the only selected node's resize capability is denied
- **THEN** no resize handles are shown

#### Scenario: Cancel a resize
- **WHEN** Escape is pressed or pointer capture is lost while a handle is being dragged
- **THEN** the preview is discarded, no command is submitted, and the node keeps its committed size and position (INT-05)

#### Scenario: Preview is not submitted
- **WHEN** a handle is dragged across 100 pointer move events and released
- **THEN** the adapter receives exactly one resize command (INT-08)

## MODIFIED Requirements

### Requirement: INT-09 Auto-pan (SHOULD)
The view SHALL auto-pan when the pointer nears the viewport edge during moving or routing, with bounded speed, immediate stop on gesture end or cancel, and no movement after the gesture terminates. Auto-pan SHALL apply to node moves, connection drags, marquee selection and resize, SHALL keep the gesture's world point under the pointer so its preview follows, SHALL leave the gesture's single commit unchanged, and SHALL request no animation frame once it has stopped (PERF-02d).

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

#### Scenario: Pan gestures do not auto-pan
- **WHEN** the user pans by dragging empty canvas and the pointer reaches the edge band
- **THEN** no auto-pan happens

### Requirement: UX-01 Keyboard editing shortcuts
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
