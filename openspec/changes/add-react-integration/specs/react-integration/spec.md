## MODIFIED Requirements

### Requirement: REA-01 Provider, mount component, and hooks
The react entry point SHALL provide a mounting component, a provider, and hooks for instance access, selection, viewport, command availability, history state, hover, and entity-level subscriptions by node or connection ID, so inspectors and palettes can be built as ordinary React components. The mounting component SHALL create exactly one view on mount and dispose it on unmount; options with a runtime setter SHALL update without remounting, and other option changes SHALL remount cleanly. Hook snapshots SHALL be referentially stable while their value is unchanged.

#### Scenario: Inspector follows selection
- **WHEN** an inspector component uses the selection hook and the user selects a node
- **THEN** the inspector re-renders with that node's ID

#### Scenario: Command availability hook
- **WHEN** a toolbar button uses the command availability hook for delete and the selection becomes empty
- **THEN** the hook reports delete as unavailable with its reason

#### Scenario: History hook
- **WHEN** a toolbar uses the history hook and an edit is committed, then undone
- **THEN** it reports the undo label with undo enabled after the edit, and redo enabled with the redo label after the undo

#### Scenario: Theme update without remount
- **WHEN** the theme prop changes while the editor is mounted
- **THEN** the view is repainted with the new theme and the same view instance stays mounted

#### Scenario: Remount on a non-settable option
- **WHEN** the geometry registry prop changes identity
- **THEN** the old view is disposed and a new one is mounted, and the old view leaves no listener behind

## ADDED Requirements

### Requirement: REA-08 Anchored node overlay
The react entry point SHALL provide a component or hook that portals React children into one overlay slot anchored to one node, using the placement options of OVL-03. It SHALL attach on mount, detach on unmount, hide while the node is absent from the model, and call an optional callback with the reason when the node disappears. Host React context SHALL be available inside the content. It is intended for a handful of nodes at a time; the integration SHALL NOT mount React content per node for the whole graph (REA-03 is separate).

#### Scenario: Context inside the overlay
- **WHEN** the anchored overlay renders a component that reads a host context value
- **THEN** it receives the value provided above the editor in the host tree

#### Scenario: Text field keeps its keys
- **WHEN** the overlay holds a text field with focus, a node is selected, and the user presses Delete or a letter bound to a graph command
- **THEN** the text field receives the key and no graph command runs (INT-06)

#### Scenario: Overlay follows the node
- **WHEN** the anchored node is moved, or the view is panned or zoomed
- **THEN** the overlay content stays at the node's placement point

#### Scenario: Overlay unmount
- **WHEN** the component unmounts or the view is disposed
- **THEN** its element is removed from the overlay layer and no listener remains

#### Scenario: Anchored node removed
- **WHEN** the anchored node is deleted by an external change
- **THEN** the overlay hides, the callback receives a "node removed" reason, and nothing is submitted for the stale ID (REA-07)

### Requirement: REA-09 View controls
The react entry point SHALL provide an optional, compact controls panel with zoom in, zoom out, fit-to-content, and a lock toggle. It SHALL render plain buttons with stable class names and no required stylesheet, SHALL default to a bottom-left corner placement over the view, and hosts MAY restyle, reposition, omit single buttons, or replace it. Fit SHALL run the registered fit command; the buttons SHALL reflect command availability. The lock toggle SHALL switch the view's lock state (VIS-06) and show it as pressed or released.

#### Scenario: Fit button
- **WHEN** the user presses the fit control with nodes outside the visible area
- **THEN** the viewport changes to show all nodes with the configured padding

#### Scenario: Lock toggle
- **WHEN** the user presses the lock control
- **THEN** the view becomes locked, the control shows the pressed state, and pressing it again restores editing

#### Scenario: Zoom limits respected
- **WHEN** the zoom control is pressed repeatedly at the configured maximum zoom
- **THEN** the zoom stays at the maximum
