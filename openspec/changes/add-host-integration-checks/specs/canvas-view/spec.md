## ADDED Requirements

### Requirement: Per-connection style at runtime
A host SHALL be able to give each connection a stroke colour, width and dash pattern, from the
connection's payload or a host function, so the colour can depend on the connection kind, and
change them at runtime without rebuilding the model. Switching between solid and dashed lines
and between dark and light themes SHALL need no remount. Selected and hovered node styling SHALL be available to a host node painter through the
paint input state.

#### Scenario: Colour by kind
- **WHEN** two connections of different kinds are painted with a host style function
- **THEN** each is stroked with its own colour, width and dash

#### Scenario: Dash setting changed at runtime
- **WHEN** the host switches all connections from solid to dashed
- **THEN** the scene layer repaints dashed with no model change and no history entry

#### Scenario: Theme switch
- **WHEN** the host calls `setTheme` with a dark token set
- **THEN** the view repaints with it, keeping selection and viewport

### Requirement: Host-supplied symbol images
An image-symbol node SHALL accept pictures that the host supplies as SVG data URIs of different sizes. When the host tints a picture before handing it over, each tinted variant SHALL have its own asset key and be cached separately, so two tints of one picture never share a bitmap. Port placement fractions SHALL be computed in the picture's own coordinates, so pictures of different sizes place their ports correctly.

#### Scenario: Two sizes, two tints
- **WHEN** one picture is requested in two sizes and two tints, each tint under its own asset key
- **THEN** the resolver is asked once per key, four bitmaps are cached separately, and each paints with its own tint

#### Scenario: Placement in picture coordinates
- **WHEN** a port is placed at fraction (1, 0.5) of two pictures of different sizes
- **THEN** each anchor is at the right edge mid-height of its own picture

### Requirement: Fit on first content
The initial fit option SHALL accept a value that fits the view once, when the first non-empty content appears after mount, for a host whose model is empty at mount and filled later by a pushed snapshot or a load. The fit SHALL happen exactly once, for the first moment the model holds at least one node, even when the content arrives in several pushes. If the user or the host has already moved the viewport (pan, zoom, fit or an explicit viewport) before that moment, the view SHALL NOT move it, and the once-only fit is spent. Unmounting before content arrives SHALL remove every listener and pending frame the option created, so nothing fits or throws later. This requirement is provisional until the check in the tasks confirms the gap.

#### Scenario: Content arrives after mount
- **WHEN** a view with this option is mounted on an empty model and a snapshot with nodes spread beyond the container is then pushed
- **THEN** after that push all nodes are visible with the padding, and the fit happened exactly once

#### Scenario: Content arrives in several pushes
- **WHEN** the first push holds one node and a second push adds more nodes
- **THEN** the fit happens for the first push only and the second push leaves the viewport as it is

#### Scenario: User moved the view first
- **WHEN** the user pans or zooms the empty view and content then arrives
- **THEN** the viewport does not change and no later push fits it

#### Scenario: Unmount before content
- **WHEN** the view is unmounted while the model is still empty and a snapshot is pushed afterwards
- **THEN** nothing is fitted, no error is raised, and no listener of the view remains
