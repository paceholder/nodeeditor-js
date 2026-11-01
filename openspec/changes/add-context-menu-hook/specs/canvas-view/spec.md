## MODIFIED Requirements

### Requirement: OVL-01 DOM overlay slot
The view SHALL provide a DOM overlay layer, aligned to the viewport transform, for focused editors, host menus, tooltips, and later React node bodies. An overlay element SHALL be anchorable to a world point, to a node, or to a fixed viewport point that stays in place while the view pans and zooms. Overlay content SHALL be created only on explicit mount and SHALL be removed on dispose. Host content in the overlay SHALL handle its own pointer and keyboard input: it SHALL NOT start graph gestures or run graph shortcuts and clipboard commands (INT-06).

#### Scenario: Inline editor on a node
- **WHEN** the host opens a text editor overlay for a node
- **THEN** it appears at the node's screen position and is removed when closed or the view is disposed

#### Scenario: Menu fixed on screen
- **WHEN** a host attaches a menu element at the viewport position reported by a context-menu event and the user then zooms with the wheel
- **THEN** the menu stays at the same viewport position, and a click on one of its items starts no graph gesture

#### Scenario: Menu following the graph
- **WHEN** a host attaches a menu at the world position of a context-menu event and the user pans the view
- **THEN** the menu stays at that world position on screen
