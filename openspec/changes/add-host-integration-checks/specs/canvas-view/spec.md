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
