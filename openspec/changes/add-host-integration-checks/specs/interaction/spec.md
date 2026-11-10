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
add bare-key bindings such as `R` for rotate and `F` for mirror. A host binding SHALL be able to state whether an auto-repeated key press runs its command, as the default bindings do. Shortcuts SHALL act only while
the editor root has focus, or while a host-supplied predicate returns true. A key typed in a
text field SHALL never run a graph command.

#### Scenario: Host takes a key
- **WHEN** the host mounts with a keymap that omits the default rotate binding and handles that key itself
- **THEN** the key does not run the graph command, and other defaults still work

#### Scenario: Host adds bare keys
- **WHEN** the host binds `R` to rotate and `F` to mirror and the editor has focus with a node selected
- **THEN** each key runs its command once, and the same keys do nothing when focus is in another panel

#### Scenario: Rebound nudge key held down
- **WHEN** the host binds nudging to other keys with auto-repeat turned off and the user holds one of them
- **THEN** the selection moves by one step and the history gains one entry

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

### Requirement: Group movement with snapping
Moving selected nodes SHALL be one gesture preserving their relative positions. Grid snapping SHALL be controlled by one library-wide grid step setting that applies to node moves and to resizes: it SHALL be off by default (no grid step), and the host SHALL be able to turn it on, change it and turn it off at run time through the tool options, taking effect from the next input event. No modifier key SHALL turn snapping off for a gesture; a host that wants free placement turns the grid step off. Locked nodes SHALL follow their capability policy, and mixed selections SHALL show which nodes will not move.

#### Scenario: Multi-node drag keeps layout
- **WHEN** three selected nodes are dragged by 40 world units
- **THEN** all three move by the same offset in one committed command

#### Scenario: Snapping off by default
- **WHEN** a view is mounted without a grid step and a node is dragged by an offset that is not a multiple of any grid
- **THEN** the node lands exactly at the dragged position

#### Scenario: Grid step set at run time
- **WHEN** the host sets a grid step of 20 through the tool options while the view is mounted and then drags a node
- **THEN** the node position snaps to multiples of 20, and setting the step to nothing makes later drags exact again

#### Scenario: Snap suppression
- **WHEN** a grid step is set and the user holds Alt, Shift or Ctrl while dragging a node
- **THEN** the position is still snapped, because snapping has no per-gesture override

#### Scenario: Mixed locked selection
- **WHEN** a selection contains one locked and two unlocked nodes and is dragged
- **THEN** the preview marks the locked node as not moving and the commit moves only the permitted nodes

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
- **THEN** the size follows the pointer exactly; with a grid step configured the moving corner snaps to the grid, and no modifier key turns the snapping off for a gesture

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
