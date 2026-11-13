# interaction Specification

## Purpose

Defines viewport navigation, selection, movement, connection gestures, gesture lifecycle,
input scoping, commands, and the keyboard shortcuts the view ships. Interaction tools are
explicit state machines that turn completed gestures into single commands.

## Requirements

### Requirement: Viewport navigation
The view SHALL provide pan, cursor-anchored zoom within configured limits, fit-all, fit-selection, reset view, and programmatic focus/reveal of an entity by ID. Fit commands on an empty graph or empty selection SHALL be safe no-ops.

#### Scenario: Cursor-anchored zoom
- **WHEN** the user zooms with the wheel while the pointer is over a node corner
- **THEN** that world point stays under the pointer after the zoom

#### Scenario: Zoom limits
- **WHEN** the user keeps zooming in past the configured maximum
- **THEN** the zoom stays at the maximum and the transform remains finite and invertible

#### Scenario: Fit on empty graph
- **WHEN** fit-all is invoked on a graph with no nodes
- **THEN** the viewport is unchanged and no error is raised

#### Scenario: Reveal entity
- **WHEN** a program requests reveal of a node outside the viewport
- **THEN** the viewport moves so the node is fully visible

### Requirement: Selection
The view SHALL support single, additive, and toggle selection, clear selection, and marquee selection with documented containment or intersection behavior. Nodes and connections SHALL be selectable together.

#### Scenario: Additive selection
- **WHEN** the user clicks a node, then clicks a connection with the additive modifier
- **THEN** both the node and the connection are selected

#### Scenario: Marquee containment
- **WHEN** the user drags a marquee in containment mode that fully covers one node and partially covers another
- **THEN** only the fully covered node is selected

#### Scenario: Clear selection
- **WHEN** the user clicks empty canvas without modifiers
- **THEN** the selection becomes empty

### Requirement: Group movement with snapping
Moving selected nodes SHALL be one gesture preserving their relative positions, with optional grid snapping and a temporary snap-suppression modifier. Locked nodes SHALL follow their capability policy, and mixed selections SHALL show which nodes will not move.

#### Scenario: Multi-node drag keeps layout
- **WHEN** three selected nodes are dragged by 40 world units
- **THEN** all three move by the same offset in one committed command

#### Scenario: Snap suppression
- **WHEN** grid snapping is on and the user holds the suppression modifier while dragging
- **THEN** the node position is not snapped for that gesture

#### Scenario: Mixed locked selection
- **WHEN** a selection contains one locked and two unlocked nodes and is dragged
- **THEN** the preview marks the locked node as not moving and the commit moves only the permitted nodes

### Requirement: Connection gestures
The view SHALL support drag-to-connect and click-to-route with finish, backtrack of the last corner, cancel, and optional endpoint reconnection. Tool-specific right-click behavior SHALL NOT disable ordinary context menus outside that tool: outside such a tool a right-click raises the context-menu event, or the browser's own menu when the host registered no listener.

#### Scenario: Drag to connect
- **WHEN** the user drags from a port and releases on a compatible port
- **THEN** one connect command is submitted for that port pair

#### Scenario: Click-to-route with backtrack
- **WHEN** the user starts click-to-route, places three corners, backtracks once, and finishes on a compatible port
- **THEN** the submitted connection carries the first two corners as route constraints

#### Scenario: Context menu outside the tool
- **WHEN** no routing gesture is active and the user right-clicks a node
- **THEN** the view raises the context-menu event for that node when a listener is registered, and otherwise the browser's own context menu opens

### Requirement: Gesture lifecycle and cancellation
Each gesture SHALL use a documented drag threshold, pointer capture, and event ownership. Pointercancel, lost capture, Escape, window blur, hidden or unmounted view, and removal of a gesture endpoint SHALL cancel the gesture and discard its unsubmitted preview.

#### Scenario: Below threshold is a click
- **WHEN** the pointer moves less than the drag threshold between down and up on a node
- **THEN** the node is selected and no move command is submitted

#### Scenario: Lost capture
- **WHEN** pointer capture is lost during a node drag
- **THEN** the drag preview is discarded and the node remains at its committed position

#### Scenario: Endpoint removed during connect
- **WHEN** the source port of an in-progress connection gesture is removed by an external change
- **THEN** the gesture cancels and no connect command is submitted

### Requirement: Tools as explicit state machines
Every interaction tool SHALL be an explicit state machine with enumerated states and a pure transition function, so its behavior can be tested headlessly by feeding input events. A tool SHALL be in exactly one state at a time and SHALL return to idle after commit or cancel.

#### Scenario: Headless tool test
- **WHEN** a test feeds pointer down, moves beyond the threshold, and pointer up events to the move tool without a browser
- **THEN** the tool transitions idle → pressed → dragging → idle and emits exactly one move command

### Requirement: Input scoping
Shortcuts and wheel handling SHALL be scoped to the active editor. Text fields, contentEditable elements, and IME composition SHALL receive their keys without triggering graph commands, platform modifiers SHALL be honored, and wheel events SHALL allow permitted page scrolling.

#### Scenario: Typing in an editor
- **WHEN** the user presses Delete inside a text field in a node editor overlay
- **THEN** the text is edited and no graph delete command runs

#### Scenario: IME composition
- **WHEN** an IME composition is in progress and the user presses Enter
- **THEN** the composition commits and no graph shortcut fires

#### Scenario: Two editors on a page
- **WHEN** two editors are mounted and the second has focus
- **THEN** shortcuts act only on the second editor

### Requirement: Unified commands
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
- **THEN** the fragment is pasted centred at that position as one history entry

### Requirement: One committed edit per gesture
A completed gesture SHALL produce one committed command and one history entry, not one per pointer move. Previews SHALL be rendered locally and SHALL NOT be submitted to the adapter.

#### Scenario: Long drag
- **WHEN** a node is dragged across 200 pointer move events and released
- **THEN** the adapter receives one move command and the history gains one entry

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

### Requirement: Context-menu event
The view SHALL raise a context-menu event that hosts subscribe to on the view handle, and SHALL ship no menu. It SHALL fire for the platform context-menu gesture, a touch long-press, and the menu key or Shift+F10 while the editor has focus. It SHALL report the target (node, port, connection or canvas) by stable IDs with the ordered hit list, the selection, the invocation kind, the modifiers, and client, viewport and world positions.

#### Scenario: Right-click a port
- **WHEN** a listener is registered and the user right-clicks a port of an unselected node
- **THEN** one event reports target port with its node and port IDs, the hit list, and the client, viewport and world positions of the click

#### Scenario: Right-click empty canvas
- **WHEN** a listener is registered, one node is selected, and the user right-clicks empty canvas
- **THEN** the event reports target canvas, the selection is unchanged, and the world position can be used to create or paste there

#### Scenario: Keyboard menu key
- **WHEN** the editor has focus, a connection is the primary selection, and the user presses the menu key or Shift+F10
- **THEN** one event reports target connection with invocation keyboard, positioned at the connection's bounds and not at the pointer, and the selection is unchanged

### Requirement: Context-menu selection and browser menu
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

### Requirement: Context-menu scoping and gestures
Text fields, contentEditable, IME composition and host overlay content SHALL NOT raise the event. A secondary-button press SHALL NOT start a tool. A press below its drag threshold when the menu is invoked SHALL be cancelled without commit or selection-on-release; during a drag past the threshold no event SHALL be raised. One invocation SHALL raise at most one event, even when the browser also reports it.

#### Scenario: Right press starts no gesture
- **WHEN** a listener is registered and the user presses the secondary button on a node and moves the pointer by 50 CSS pixels before releasing
- **THEN** no node moves, the view does not pan, and no history entry is added

#### Scenario: Ctrl+click on macOS
- **WHEN** a listener is registered on macOS and the user Ctrl+clicks a node
- **THEN** the press is cancelled, no selection-on-release or move follows, and one event is raised for that node

#### Scenario: Menu key in a text field
- **WHEN** the user presses Shift+F10 inside a text field of an overlay editor
- **THEN** no event is raised and the text field keeps the key

#### Scenario: Context menu on overlay content
- **WHEN** a listener is registered and the user right-clicks host content placed in the overlay
- **THEN** no event is raised and the browser default for that content applies

#### Scenario: No event during a drag
- **WHEN** a node drag has passed its threshold and the user right-clicks before releasing
- **THEN** no event is raised, the drag continues, and its release commits one move

### Requirement: Touch long-press
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

### Requirement: Connection-choice request
The release target SHALL be the first port in the existing deterministic candidate order that is compatible or requires a choice; the host SHALL never be asked which port. Only when the policy returns a choice with several alternatives for that target SHALL the view ask a host chooser, and it SHALL ship no picker. The request SHALL carry the source, the target, its alternatives as keyed options in policy order, the release position, and a cancellation signal.

#### Scenario: Policy offers two connection kinds
- **WHEN** a chooser is installed, the policy returns two alternatives for a port pair, and the user releases a drag on that target port
- **THEN** the chooser receives two options with distinct keys for that port, in policy order, and nothing is committed while it is pending

#### Scenario: Overlapping ports are not a choice
- **WHEN** a chooser is installed and two compatible ports of overlapping nodes lie under the release point
- **THEN** the chooser is not called and one connect command is submitted to the first port in the existing candidate order

#### Scenario: Single valid target does not ask
- **WHEN** a chooser is installed and the release target is a compatible port whose policy accepts directly
- **THEN** one connect command is submitted and the chooser is not called

### Requirement: Pending choice resolution
While a choice is pending, the preview SHALL stay at the release point, only Escape among graph shortcuts SHALL run, and nothing SHALL be committed. Choosing an option SHALL submit one connect command, revalidated at commit. Declining, a failing chooser, an unknown key, Escape, a new press outside overlay content, disposal, a reset, or removal of the source or target port SHALL commit nothing, clear the preview, abort the signal, and ignore later answers.

#### Scenario: Host picks an option
- **WHEN** a choice between two connection kinds is pending and the chooser resolves with the second option's key
- **THEN** one connection of the second kind is created as one history entry and the preview is cleared

#### Scenario: Host declines
- **WHEN** the chooser resolves with no option
- **THEN** no command is submitted, the history is unchanged, and the preview is cleared

#### Scenario: Escape while choosing
- **WHEN** a choice is pending and the user presses Escape with focus in the editor or its overlay
- **THEN** the signal is aborted, nothing is committed, the preview is cleared, a later resolution from the chooser has no effect, and keyboard focus can return to the editor root

#### Scenario: Press elsewhere cancels
- **WHEN** a choice is pending and the user presses on the canvas outside overlay content
- **THEN** the choice is cancelled with nothing committed, and that press does not start a gesture

#### Scenario: Target removed while choosing
- **WHEN** a choice is pending and an external change removes the target port's node
- **THEN** the choice is cancelled, the signal is aborted, and nothing is committed

#### Scenario: Dispose while choosing
- **WHEN** the view is disposed while a choice is pending
- **THEN** the signal is aborted, nothing is committed, and no listener or timer remains

#### Scenario: Revalidated at commit
- **WHEN** a choice is pending, another edit fills the chosen target's last free slot, and the host then picks that option
- **THEN** the connect command is rejected with the exhausted-capacity reason and no connection is created

### Requirement: Release without a chooser
Without a chooser the view SHALL never pick among policy alternatives. Releasing on a target that requires a choice SHALL commit nothing, and the target SHALL show a choice-required cue that is not color alone. A target the policy accepts directly SHALL be connected as before.

#### Scenario: No chooser and a policy choice
- **WHEN** no chooser is installed and the user releases on a port whose policy returns alternatives
- **THEN** nothing is committed, and before release the target showed a choice-required cue that is not color alone

#### Scenario: No chooser and a direct accept
- **WHEN** no chooser is installed and the user releases on a port the policy accepts directly
- **THEN** one connect command is submitted for that port pair, as before

#### Scenario: Choice required not color-only
- **WHEN** a connection target requires a choice during a gesture
- **THEN** the target shows a glyph distinct from the compatible, incompatible and pending cues

### Requirement: Keyboard editing shortcuts
The view SHALL provide keyboard commands to focus or reveal entities, change selection, move selected nodes, delete, undo and redo, copy, cut, paste and duplicate, rotate and mirror selected nodes, and open context actions. A keyboard connection chooser is not required. The default keymap SHALL bind copy, cut, paste and duplicate to the platform's primary modifier with C, X, V and D, rotation to R (clockwise) and Shift+R (counter-clockwise), and mirroring to M (horizontal) and Shift+M (vertical), and each shortcut SHALL run the same command as the API. The menu key and Shift+F10 SHALL open context actions by raising the context-menu event for the selection.

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

### Requirement: Usable shipped controls
DOM controls shipped by the library (overlay editors, dialogs) SHALL have visible focus and no keyboard trap, and reject, pending, and error states SHALL NOT be conveyed by color alone. The library SHALL ship no context menu. Hosts supply one through the context-menu hook, which leaves focus with the host while its menu is open, and keys pressed in a host menu in the overlay SHALL run no graph shortcut. Screen-reader parity for the graph canvas is a non-goal.

#### Scenario: Escape leaves a menu
- **WHEN** a host menu opened from the context-menu event has focus in the overlay and the user presses Escape
- **THEN** no graph shortcut runs, so the selection is unchanged, and the host can close its menu and return focus to the editor root

#### Scenario: Rejection not color-only
- **WHEN** a connection target is incompatible during a gesture
- **THEN** the target shows a non-color cue such as a glyph or text reason in addition to color

### Requirement: Hover event
The view SHALL raise a `"hover"` event through `view.on` when the entity under the pointer changes. The payload SHALL be plain data by stable IDs: the entity kind (node, port, connection), its IDs, and for a node its screen rectangle in client coordinates, or a leave form when no entity is under the pointer. Detection SHALL reuse geometric picking and the spatial index, never pixel lookups. The event SHALL fire at most once per animation frame and only when the hovered entity changes. It SHALL NOT fire during a gesture (drag, marquee, pan, connection drag) and SHALL respect the level-of-detail rule that hides ports when zoomed out. A connection's hit member MAY be included when the picker already returns it. Delays (for example a one-second tooltip delay) and popover content stay in the host. The pointer moving over host content in the overlay layer SHALL NOT change the hover: it neither picks the entity beneath the content nor ends the current hover.

#### Scenario: Enter, move within, leave
- **WHEN** the pointer moves onto a node, moves within it, and then leaves it
- **THEN** exactly one enter event and one leave event are raised, none while moving within

#### Scenario: Node rectangle in the payload
- **WHEN** the pointer enters a node
- **THEN** the event carries the node's ID and its screen rectangle, so a host can place a popover without a second query

#### Scenario: Overlay content does not change the hover
- **WHEN** a node is hovered and the pointer moves onto host content in the overlay layer that sits over another node
- **THEN** the first node stays hovered, the other is not hovered, and no event is raised

#### Scenario: Drag raises none
- **WHEN** the user drags a node across other nodes
- **THEN** no hover event is raised until the gesture ends, then one for the entity under the pointer

#### Scenario: Ports hidden when zoomed out
- **WHEN** the zoom is below the port-hiding threshold and the pointer is over a port anchor
- **THEN** the hover target is the node, not the port

#### Scenario: Burst of moves
- **WHEN** many pointer moves cross several nodes within one frame
- **THEN** at most one event is raised for that frame, for the final entity

### Requirement: Hover state
The view SHALL expose the current hover target as state (`view.hover`) and SHALL feed the default `isHovered` painting state from it, so painters can show hover styling without host wiring. Hover state SHALL NOT enter the model, patches, snapshots, or history.

#### Scenario: Default hovered styling input
- **WHEN** the pointer is over a node and a painter reads the hovered flag
- **THEN** the flag is true for that node only, and false after the pointer leaves

#### Scenario: Removed hovered entity
- **WHEN** the hovered node is deleted
- **THEN** the hover state clears and a leave event is raised

### Requirement: Pending target resolution
While the connect tool's candidate target is pending, the target SHALL show the pending state, distinct from compatible, incompatible and choice-required and not color alone, and the gesture SHALL stay responsive: the preview follows the pointer and cancellation works. A release on a pending target SHALL keep the preview at the release point and commit nothing until the verdict arrives; an accepted verdict SHALL then submit one connect command, revalidated at commit, and a rejected, failed or timed-out verdict SHALL commit nothing, clear the preview and deliver the rejection as a `connection-rejected` event. Escape, a new press outside overlay content, disposal, locking the view, and the cancellations of the rule that gestures react to changes of the entities they involve (a reset, or removal of the source or target port) SHALL cancel the wait, abort the validator request, ignore a later verdict for it, and commit nothing. A cancelled wait SHALL NOT delay the next gesture: a new press cancels the waiting gesture and then starts normally. Validation SHALL NOT make a submitted edit cancellable because nothing is submitted while waiting.

A connection alternative picked through the host chooser SHALL be judged the same way: when it lacks a verdict, the target SHALL show pending and the choice SHALL wait, committing one connect when the verdict is accepted and delivering a `connection-rejected` event otherwise. The wait SHALL end with nothing committed, and its validator request SHALL be aborted, on every cancellation above, and, as for a gesture, when a node or port of the picked connection is removed or is changed by a change with origin `external`; the view SHALL then emit a `gesture-cancelled` event carrying the reason and the entity IDs. A change committed by the choice itself SHALL NOT cancel it.

#### Scenario: Picked alternative judged by the validator
- **WHEN** the host chooser picks an alternative and the validator then accepts it
- **THEN** exactly one connect command of the picked kind is submitted; if the validator rejects it, nothing is committed and a `connection-rejected` event carries the reason; Escape during the wait commits nothing and aborts the request

#### Scenario: Picked alternative waiting while an involved entity changes
- **WHEN** the picked alternative waits for its verdict and an external change updates one of its nodes, or any change removes one of its ports
- **THEN** the wait is cancelled, the request is aborted, nothing is committed, a `gesture-cancelled` event names the reason and the entities, and a verdict that arrives later has no effect; a change of an unrelated node leaves the wait running

#### Scenario: Pending shown during drag
- **WHEN** the drag hovers a target whose verdict is unknown
- **THEN** the target shows the pending cue, a later accepted verdict changes it to compatible without the pointer moving, and pan and zoom stay usable

#### Scenario: Release on a pending target, then accepted
- **WHEN** the user releases on a pending target and the validator then accepts
- **THEN** exactly one connect command is submitted and the history gains one entry

#### Scenario: Release on a pending target, then rejected
- **WHEN** the user releases on a pending target and the validator then rejects
- **THEN** nothing is committed, the preview is cleared and a `connection-rejected` event carries the reason

#### Scenario: Escape while waiting
- **WHEN** a release is waiting for a verdict and the user presses Escape
- **THEN** the request is aborted, nothing is committed, and a later verdict has no effect

#### Scenario: New press while waiting
- **WHEN** a release is waiting and the user presses on another port
- **THEN** the waiting gesture is cancelled and a new connect gesture starts from the pressed port

#### Scenario: Target removed while waiting
- **WHEN** an external change removes the target port's node during the wait
- **THEN** the wait is cancelled, the request is aborted and nothing is committed

#### Scenario: Locked while waiting
- **WHEN** a release is waiting for a verdict and the view is locked
- **THEN** the wait is cancelled, the request is aborted, a `gesture-cancelled` event states the lock, and a verdict that arrives later has no effect

### Requirement: Gestures react to changes of the entities they involve
A tool SHALL be able to declare, for the state of a running gesture, the nodes, ports and connections the gesture reads or will write. When an entity so declared is removed, from any origin, the view SHALL cancel the gesture. When one is changed by a change with origin `external`, the view SHALL cancel it too. A change that does not touch the declared entities SHALL leave the gesture running, its preview unaffected. A change committed by the gesture itself SHALL NOT cancel it. A cancelled gesture SHALL submit nothing, and the view SHALL emit a `gesture-cancelled` event carrying the reason and the entity IDs, so a host can tell the user. A reset SHALL cancel every gesture.

#### Scenario: Unrelated change during a drag
- **WHEN** node A is being dragged and an external change renames node B
- **THEN** the drag continues and releasing it submits one move of A

#### Scenario: Dragged node removed
- **WHEN** node A is being dragged and a change from any origin removes A
- **THEN** the drag is cancelled, nothing is submitted, and a `gesture-cancelled` event names A and the removal

#### Scenario: Involved entity changed externally
- **WHEN** a resize of node A is in progress and an external change updates A's size
- **THEN** the resize is cancelled with a reason that names the external change

#### Scenario: Pan and marquee involve nothing
- **WHEN** a pan or a marquee is in progress and an external change removes a node
- **THEN** the gesture continues

### Requirement: Lost pointer release
Pointer input given to tools SHALL carry the set of buttons held. When a move of the mouse pointer that drives a gesture arrives without the button that started the gesture, the view SHALL cancel the gesture and commit nothing. A `contextmenu` event on the view SHALL cancel a gesture whose press has not yet moved past the drag threshold, whether or not a context-menu listener is registered.

#### Scenario: Control-click on macOS without a menu listener
- **WHEN** a Control-click on a node opens the browser's menu, the mouse-up is lost, and the mouse then moves with no button held
- **THEN** the press is cancelled, the node does not move, and the next click starts a new gesture

#### Scenario: Release lost during a drag
- **WHEN** a node is being dragged and a mouse move arrives that reports no button held
- **THEN** the drag is cancelled, the node stays at its committed position, and nothing is submitted

### Requirement: Gestures yield to any change of their entities
A gesture involves the nodes, ports and connections its tool declares for its state. When a committed change from any origin (local edit, undo, redo or external) removes or changes an involved entity, the view SHALL cancel the gesture, submit nothing for it, and emit `gesture-cancelled` with reason `entity-removed` for a removal, `external-change` for an external change, and `entity-changed` otherwise. The gesture's own commit SHALL NOT cancel it.

#### Scenario: Undo during a drag
- **WHEN** node A is being dragged and an undo moves A back to an earlier position
- **THEN** the drag is cancelled with reason `entity-changed`, nothing is submitted on release, and A keeps the position the undo gave it

#### Scenario: Host edit during a resize
- **WHEN** node A is being resized and the host changes A's size with a local edit
- **THEN** the resize is cancelled and the host's size stays

### Requirement: Control-wheel zoom over the canvas
A wheel event with the Control key held, which is also how browsers report a trackpad pinch, SHALL zoom the view about the pointer in every wheel mode and SHALL always be consumed over the canvas, including at a zoom limit, so the browser never zooms the page instead.

#### Scenario: Pinch at the zoom limit
- **WHEN** the view is at its maximum zoom and the user pinches outward on a trackpad
- **THEN** the zoom stays at the maximum and the page is not zoomed

#### Scenario: Pinch in scroll-page mode on macOS
- **WHEN** the wheel mode lets plain wheels scroll the page and the user pinches on a macOS trackpad
- **THEN** the view zooms

### Requirement: Trackpad pan mode
The view SHALL offer a wheel mode in which a plain wheel or two-finger scroll pans the view by its horizontal and vertical deltas, and a pinch or a wheel with the platform's primary modifier zooms. The default wheel mode SHALL stay zoom on a plain wheel.

#### Scenario: Two-finger scroll
- **WHEN** the pan mode is chosen and the user scrolls diagonally with two fingers
- **THEN** the view pans in both directions and the zoom is unchanged

### Requirement: Touch pinch zoom
When a second touch goes down while one touch is down on the view, the view SHALL cancel the gesture in progress and zoom about the midpoint of the two touches by the ratio of their distances, and pan by the midpoint's movement, within the zoom limits, until either touch lifts.

#### Scenario: Spreading two fingers
- **WHEN** two touches on empty canvas move apart to twice their distance
- **THEN** the zoom doubles about their midpoint and no node moves

#### Scenario: Second finger during a node drag
- **WHEN** one touch is dragging a node and a second touch goes down
- **THEN** the drag is cancelled with nothing submitted and the two touches pinch-zoom

### Requirement: Shortcuts on non-Latin layouts
When the character a key produces is not an ASCII letter or digit, a shortcut SHALL match the physical key the event reports, so shortcuts work on non-Latin keyboard layouts. A key that produces an ASCII letter or digit SHALL match by that character.

#### Scenario: Undo on a Cyrillic layout
- **WHEN** the active layout is Cyrillic and the user presses the platform primary modifier with the physical Z key
- **THEN** the undo command runs

### Requirement: One step per held key
A key binding SHALL be able to declare that auto-repeated key presses do not run its command. The default bindings for nudge, rotate, mirror and duplicate SHALL so declare, so holding one of their keys runs the command once and adds one history entry.

#### Scenario: Holding an arrow key
- **WHEN** a node is selected and the user holds an arrow key until it repeats ten times
- **THEN** the node moves by one step and the history gains one entry

### Requirement: Accessible root
The view's root element SHALL have the role `application`, a role description, and an accessible name that the host can replace and that defaults to "Node editor". The canvases SHALL be hidden from assistive technology.

#### Scenario: Default name
- **WHEN** a view is mounted without a label
- **THEN** its root has the role `application` and the accessible name "Node editor"

#### Scenario: Host label
- **WHEN** the host sets the root's accessible name to "Circuit diagram"
- **THEN** its root's accessible name is "Circuit diagram"

### Requirement: Tool contract on the advanced entry
The names needed only to write an interaction tool (the tool, transition, context, input and effect types, the slot factory and the built-in tool factories) SHALL be exported from the advanced view entry and not from the main view entry, and SHALL be documented as subject to change before version 1.0. The main view entry SHALL keep what mounting and configuring tools needs.

#### Scenario: Importing the tool contract
- **WHEN** a host imports the tool type from the main view entry
- **THEN** type checking fails, and importing it from the advanced entry succeeds

### Requirement: Group and ungroup shortcuts
The default keymap SHALL bind grouping to the platform's primary modifier with G and ungrouping to the primary modifier with Shift+G, and each SHALL run the same command as the API. Grouping SHALL put every selected node into one new group, select that group, and, when the built-in title editor is on, open it on the new group. Ungrouping SHALL remove every selected group and every group that has a selected node as a member, as one committed edit. With no node selected grouping SHALL report unavailable, and with no group affected ungrouping SHALL report unavailable. The browser's own action for these keys SHALL NOT run while the editor has focus, and neither shortcut SHALL run while a text field has focus. An auto-repeated key-down of a held key SHALL NOT run either command again.

#### Scenario: Group the selection
- **WHEN** the editor has focus, three nodes are selected, and the user presses the primary modifier with G
- **THEN** one group containing those three nodes exists and is selected, the history gains one entry, and the browser's own action for that shortcut does not run

#### Scenario: Ungroup from a member
- **WHEN** one member node of a group is selected and the user presses the primary modifier with Shift+G
- **THEN** the group is removed, its nodes remain, and one undo restores the group

#### Scenario: Nothing to group
- **WHEN** only a connection is selected and the user presses the primary modifier with G
- **THEN** no group is created and the command reports unavailable

#### Scenario: Shortcut in a text field
- **WHEN** the user presses the primary modifier with G inside a text field in an overlay
- **THEN** no group is created
