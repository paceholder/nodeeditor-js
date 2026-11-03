## ADDED Requirements

### Requirement: OVL-03 Overlay placement and node rectangle
A node overlay anchor SHALL accept a placement relative to the node's body bounds (top-left default, above, below, left, right, centred) with a pixel offset, and the view SHALL report a node's on-screen rectangle as a plain value so host popover libraries can use it as a reference. Overlay content SHALL stay aligned during pan, zoom, and node moves (OVL-01). The wheel over overlay content SHALL NOT zoom the canvas, and the wheel over empty overlay area SHALL still zoom it; pointer presses on overlay content SHALL start no canvas gesture (INT-06).

#### Scenario: Placement above a node
- **WHEN** an element is attached to a node with the "above" placement and the view is zoomed
- **THEN** the element stays centred above the body bounds at the offset distance

#### Scenario: Node rectangle as a value
- **WHEN** a host asks for the rectangle of a node
- **THEN** it receives the client-space rectangle of the body bounds, and nothing for an absent node

#### Scenario: Wheel over overlay content
- **WHEN** the pointer is over an attached element and the wheel turns
- **THEN** the canvas does not zoom; over the empty part of the overlay layer the same wheel zooms

### Requirement: VPT-01 Initial fit and zoom limits
The view SHALL accept an initial fit option (with padding and maximum fit zoom) that fits the content once, after the container is first measurable, unless an initial viewport is given. The view SHALL accept per-view minimum and maximum zoom, honoured by wheel and pinch zoom, programmatic zoom, and fit commands, within the absolute bounds of the core viewport (GEO-06).

#### Scenario: Fit on first load
- **WHEN** a view is mounted with a model of nodes spread beyond the container and an initial fit
- **THEN** after the first layout all nodes are visible with the padding and the fit happened exactly once

#### Scenario: Zoom limits
- **WHEN** the limits are 0.1 and 2 and the user wheel-zooms far in and far out
- **THEN** the zoom never leaves that range, and fit never zooms in past the maximum

### Requirement: VIS-06 View lock
A view SHALL have a view-local lock state, settable at mount and at runtime, observable by the host. While locked, editing gestures and editing commands SHALL be unavailable with a stated reason; pan, zoom, fit, selection, inspection and hover SHALL keep working. The lock SHALL NOT relax adapter permissions, SHALL NOT produce history entries, and SHALL NOT be serialized (MOD-11).

#### Scenario: Locked view ignores editing gestures
- **WHEN** the view is locked and the user drags a node or a port
- **THEN** nothing is submitted, and the view can still pan, zoom and select

#### Scenario: Unlock restores editing
- **WHEN** the view is unlocked again
- **THEN** editing gestures and commands behave as before
