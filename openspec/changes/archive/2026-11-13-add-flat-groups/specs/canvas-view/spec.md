## ADDED Requirements

### Requirement: Group frame painter
Painting a group frame SHALL be its own registration, separate from node painters, port glyphs, geometry, routing and path painters, so a host can replace it without touching any of them. The library SHALL ship a default frame painter that draws a filled rounded rectangle, a border, the title, and the padlock icon, with colors from theme tokens. A group's style key SHALL select a named style from the theme, and an unknown key SHALL fall back to the default style without an error. By default frames SHALL paint beneath connections and nodes, and picking SHALL prefer a port, node or connection over a frame at the same point. A selected group, a locked group, and a group about to gain a node SHALL each be distinguishable by more than color. Frames outside the visible area SHALL NOT be painted, and at the overview level of detail a frame SHALL be drawn without its title and icon. A frame painter that throws SHALL be contained and reported like a failing node painter.

#### Scenario: Replace the frame painter
- **WHEN** a host registers its own group frame painter
- **THEN** frames are drawn by it and node, port and connection painting is unchanged

#### Scenario: Frame beneath nodes
- **WHEN** a node lies inside a group's frame and the user presses on the node
- **THEN** the node is picked, not the group

#### Scenario: Unknown style key
- **WHEN** a loaded group carries a style key the theme does not define
- **THEN** the frame is drawn in the default style and no error is raised

#### Scenario: Frame off screen
- **WHEN** a group's frame lies entirely outside the visible area
- **THEN** its painter is not called
