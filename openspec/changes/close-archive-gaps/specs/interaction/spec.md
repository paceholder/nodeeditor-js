## MODIFIED Requirements

### Requirement: Usable shipped controls
DOM controls shipped by the library (overlay editors, dialogs) SHALL have visible focus and no keyboard trap, and reject, pending, and error states SHALL NOT be conveyed by color alone. The library SHALL ship no context menu. Hosts supply one through the context-menu hook, which leaves focus with the host while its menu is open, and keys pressed in a host menu in the overlay SHALL run no graph shortcut. Screen-reader parity for the graph canvas is a non-goal. The known limit is the keyboard shortcuts of the keyboard editing shortcuts rule, the accessible root (its role, role description and host-replaceable accessible name) plus these DOM controls, and the project SHALL document the accessibility coverage and the remaining barriers with the support matrix.

#### Scenario: Escape leaves a menu
- **WHEN** a host menu opened from the context-menu event has focus in the overlay and the user presses Escape
- **THEN** no graph shortcut runs, so the selection is unchanged, and the host can close its menu and return focus to the editor root

#### Scenario: Rejection not color-only
- **WHEN** a connection target is incompatible during a gesture
- **THEN** the target shows a non-color cue such as a glyph or text reason in addition to color

## ADDED Requirements

### Requirement: Touch and pen safety
Mouse, touch, and pen input SHALL go through the same pointer-event path and gesture rules. While a gesture is active the canvas SHALL keep the browser from scrolling or zooming the page under it. A second touch while one touch is down SHALL be handled by the touch pinch zoom rule: the running gesture is cancelled and the two touches pinch-zoom. Any other second simultaneous pointer (a mouse or pen while another pointer drives a gesture, or a third touch during a pinch) SHALL be ignored without cancelling or changing the gesture. Multi-touch gestures other than the two-touch pinch are not supported in R1.

#### Scenario: Pen during a mouse drag
- **WHEN** a node is being dragged with the mouse and a pen touches the canvas
- **THEN** the drag continues unchanged and the pen triggers nothing

#### Scenario: Third touch during a pinch
- **WHEN** two touches are pinch-zooming and a third touch begins
- **THEN** the pinch continues unchanged and the third touch triggers nothing

#### Scenario: Page does not scroll under a drag
- **WHEN** a touch or pen drag moves a node near the edge of the editor
- **THEN** the page does not scroll and the node follows the pointer
