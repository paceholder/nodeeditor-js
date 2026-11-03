## ADDED Requirements

### Requirement: VIS-05 Per-connection style at runtime
A host SHALL be able to give each connection a stroke colour, width and dash pattern, from the
connection's payload or a host function, and change them at runtime without rebuilding the
model. Selected and hovered node styling SHALL be available to a host node painter through the
paint input state. A theme switch between light and dark SHALL not remount the view (VIS-01,
REN-04).

#### Scenario: Colour by kind
- **WHEN** two connections of different kinds are painted with a host style function
- **THEN** each is stroked with its own colour, width and dash

#### Scenario: Dash setting changed at runtime
- **WHEN** the host switches all connections from solid to dashed
- **THEN** the scene layer repaints dashed with no model change and no history entry

#### Scenario: Theme switch
- **WHEN** the host calls `setTheme` with a dark token set
- **THEN** the view repaints with it, keeping selection and viewport
