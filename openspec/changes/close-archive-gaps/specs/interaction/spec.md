## MODIFIED Requirements

### Requirement: Usable shipped controls
DOM controls shipped by the library (overlay editors, dialogs) SHALL have visible focus and no keyboard trap, and reject, pending, and error states SHALL NOT be conveyed by color alone. The library SHALL ship no context menu. Hosts supply one through the context-menu hook, which leaves focus with the host while its menu is open, and keys pressed in a host menu in the overlay SHALL run no graph shortcut. Screen-reader parity for the graph canvas is a non-goal. The known limit is the keyboard shortcuts of the keyboard editing shortcuts rule plus these DOM controls, and the project SHALL document the accessibility coverage and the remaining barriers with the support matrix.

#### Scenario: Escape leaves a menu
- **WHEN** a host menu opened from the context-menu event has focus in the overlay and the user presses Escape
- **THEN** no graph shortcut runs, so the selection is unchanged, and the host can close its menu and return focus to the editor root

#### Scenario: Rejection not color-only
- **WHEN** a connection target is incompatible during a gesture
- **THEN** the target shows a non-color cue such as a glyph or text reason in addition to color

## ADDED Requirements

### Requirement: Touch and pen safety
Mouse, touch, and pen input SHALL go through the same pointer-event path and gesture rules. While a gesture is active the canvas SHALL keep the browser from scrolling or zooming the page under it, and a second simultaneous pointer SHALL be ignored without cancelling or changing the gesture. Pinch and other multi-touch gestures are not supported in R1.

#### Scenario: Second finger during a drag
- **WHEN** a node is being dragged by one touch and a second touch begins
- **THEN** the drag continues unchanged and the second touch triggers nothing

#### Scenario: Page does not scroll under a drag
- **WHEN** a touch or pen drag moves a node near the edge of the editor
- **THEN** the page does not scroll and the node follows the pointer
