## ADDED Requirements

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
- **WHEN** a view is mounted with the label "Circuit diagram"
- **THEN** its root's accessible name is "Circuit diagram"

### Requirement: Tool contract on the advanced entry
The names needed only to write an interaction tool (the tool, transition, context, input and effect types, the slot factory and the built-in tool factories) SHALL be exported from the advanced view entry and not from the main view entry, and SHALL be documented as subject to change before version 1.0. The main view entry SHALL keep what mounting and configuring tools needs.

#### Scenario: Importing the tool contract
- **WHEN** a host imports the tool type from the main view entry
- **THEN** type checking fails, and importing it from the advanced entry succeeds
