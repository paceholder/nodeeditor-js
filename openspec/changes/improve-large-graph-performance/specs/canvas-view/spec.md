## ADDED Requirements

### Requirement: LAY-05 Gesture bitmap reuse (SHOULD)
The view SHOULD offer an option, off by default, that during a pan or zoom gesture with a large visible set redraws the last painted scene frame translated and scaled to the current viewport instead of repainting every entity, and repaints exactly once the viewport has not changed for a short settle time. While the option is on, picking, selection and committed model changes SHALL behave exactly as without it, and any model change or selection change SHALL trigger an exact repaint. Reuse SHALL stay within a bounded zoom ratio and uncovered area; beyond either, the frame is exact.

#### Scenario: Option off by default
- **WHEN** a view is mounted without the option
- **THEN** every scene frame during pan and zoom is an exact repaint

#### Scenario: Settle repaint
- **WHEN** the option is on and a zoom gesture over F-LARGE at fit-all stops
- **THEN** the scene is repainted exactly within the settle time, and no further frames are requested afterwards (PERF-02d)

#### Scenario: Long continuous gesture
- **WHEN** the option is on and a zoom or pan continues without pause
- **THEN** exact frames are painted whenever the bounds are exceeded, so the view is never more than the bounded zoom ratio away from an exact frame

#### Scenario: Change during a gesture
- **WHEN** the option is on and a model change arrives during a pan
- **THEN** the next frame is an exact repaint that shows the change

## MODIFIED Requirements

### Requirement: LAY-04 Level of detail
The view SHALL support detail levels selected by zoom. Low detail MAY suppress nonessential text and decorations but SHALL preserve attachment and junction distinctions, selection, and discoverable errors (PERF-06). Ports keep a constant on-screen size, so below a configurable port-hiding zoom threshold the view SHALL neither draw ports nor offer them as pick or connection-capture targets, so that a press there pans, selects or moves instead of starting a connection; the threshold MAY be set to zero to always show ports. The lowest level, overview, MAY additionally draw nodes as plain outlines and connections as simplified strokes. At every level connection endpoints SHALL still meet their nodes at the port positions, and selected nodes and connections, error and status indicators, and junction markers SHALL remain visible.

#### Scenario: Zoomed far out
- **WHEN** the zoom drops below the low-detail threshold
- **THEN** labels are hidden while selected nodes, junction markers, and error indicators remain visible

#### Scenario: Ports hidden when zoomed out
- **WHEN** the zoom is below the port-hiding threshold and the user presses where a port anchor lies on an unselected node
- **THEN** no port glyph is drawn there, the pick result contains no port, and the press does not start a connection

#### Scenario: Overview keeps what matters
- **WHEN** the zoom drops below the overview threshold in F-LARGE with one selected node, one selected connection, and one node in error
- **THEN** port glyphs are not drawn, while the selected node and connection are distinguishable and the error indicator is visible
