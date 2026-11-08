## MODIFIED Requirements

### Requirement: Provider, mount component, and hooks
The react entry point SHALL provide a mounting component, a provider, and hooks for instance access, selection, viewport, command availability (also as a single hook that returns availability, the reason and a run function), history state, hover, and entity-level subscriptions by node or connection ID, so inspectors and palettes can be built as ordinary React components. The mounting component SHALL create exactly one view on mount and dispose it on unmount; options with a runtime setter, including the view lock, SHALL update without remounting, and other option changes SHALL remount cleanly. The theme and tool-option props SHALL describe the whole value, so a dropped key returns to its default. Every mount option SHALL be classified explicitly, so a new option cannot be added without deciding whether a change updates, remounts or is ignored. The component SHALL report lock changes made inside the editor to the host through a callback, SHALL give the host the view handle when one is mounted, and SHALL accept child components that read the editor it renders, so controls and overlays work without a separate provider. An editor that unmounts SHALL clear the shared view slot only when the slot is its own. Hook snapshots SHALL be referentially stable while their value is unchanged.

#### Scenario: Inspector follows selection
- **WHEN** an inspector component uses the selection hook and the user selects a node
- **THEN** the inspector re-renders with that node's ID and the kind of the primary selection, without any encoded key

#### Scenario: Command availability hook
- **WHEN** a toolbar button uses the command availability hook for delete and the selection becomes empty
- **THEN** the hook reports delete as unavailable with its reason

#### Scenario: Availability follows the view lock
- **WHEN** a toolbar button uses the command hook for delete with a node selected and the view is then locked
- **THEN** the button becomes unavailable with the lock reason, and available again when the view is unlocked

#### Scenario: History hook
- **WHEN** a toolbar uses the history hook and an edit is committed, then undone
- **THEN** it reports the undo label with undo enabled after the edit, and redo enabled with the redo label after the undo

#### Scenario: Theme update without remount
- **WHEN** the theme prop changes while the editor is mounted
- **THEN** the view is repainted with the new theme and the same view instance stays mounted

#### Scenario: Lock prop after mount
- **WHEN** the lock prop changes from false to true on a mounted editor
- **THEN** the same view instance becomes locked without a remount

#### Scenario: Lock owned by the view
- **WHEN** the editor has no lock prop and the lock changes through the lock button or the view's API, and the view is later remounted
- **THEN** every change reaches the host's lock callback, and the new view starts in the same state

#### Scenario: Lock controlled by the prop
- **WHEN** the editor has a lock prop and the lock button is pressed or the view's API asks for a different state
- **THEN** the host's lock callback receives the requested state as an attempt and the view stays at the prop until the host passes a new value, which locks or unlocks it without a second callback

#### Scenario: Initial and inline options
- **WHEN** an initial-viewport or initial-fit prop changes, or the zoom limits are passed as a new object with the same values, on a mounted editor
- **THEN** the view is not remounted; changed zoom limits update the live view

#### Scenario: Remount storm warning
- **WHEN** a remount option is rebuilt on every render during development
- **THEN** the component warns once that it remounts repeatedly

#### Scenario: Theme prop describes the whole theme
- **WHEN** a theme prop with a colour override changes to one without it, or is removed
- **THEN** the same view returns to the default for that value, and no earlier override remains

#### Scenario: Children without a provider
- **WHEN** the controls panel and an anchored overlay are passed as children of the mount component with no provider above it
- **THEN** both render for that editor

#### Scenario: Older editor unmounts
- **WHEN** two editors share a provider and the one that mounted first unmounts
- **THEN** the hooks still report the remaining editor's view

#### Scenario: Remount on a non-settable option
- **WHEN** the geometry registry prop changes identity
- **THEN** the old view is disposed and a new one is mounted, and the old view leaves no listener behind

## ADDED Requirements

### Requirement: Anchored node overlay
The react entry point SHALL provide a component or hook that portals React children into one overlay slot anchored to one node, using the placement options of the overlay placement rule. It SHALL attach on mount, detach on unmount, hide while the node is absent from the model, and call an optional callback when the node is removed from the model being shown; unmounting the editor or replacing its model SHALL NOT count as a removal. Host React context SHALL be available inside the content. It is intended for a handful of nodes at a time; the integration SHALL NOT mount React content per node for the whole graph (the React content inside nodes rule is separate).

#### Scenario: Context inside the overlay
- **WHEN** the anchored overlay renders a component that reads a host context value
- **THEN** it receives the value provided above the editor in the host tree

#### Scenario: Text field keeps its keys
- **WHEN** the overlay holds a text field with focus, a node is selected, and the user presses Delete or a letter bound to a graph command
- **THEN** the text field receives the key and no graph command runs

#### Scenario: Overlay follows the node
- **WHEN** the anchored node is moved, or the view is panned or zoomed
- **THEN** the overlay content stays at the node's placement point

#### Scenario: Overlay unmount
- **WHEN** the component unmounts or the view is disposed
- **THEN** its element is removed from the overlay layer and no listener remains

#### Scenario: Anchored node removed
- **WHEN** the anchored node is deleted by an external change
- **THEN** the overlay hides, the callback is called once, and nothing is submitted for the stale ID

#### Scenario: Editor unmounted or model replaced
- **WHEN** the editor unmounts, or its model is replaced by one without the node, while the overlay stays mounted
- **THEN** the callback is not called

### Requirement: View controls
The react entry point SHALL provide an optional, compact controls panel with zoom in, zoom out, fit-to-content, and a lock toggle. It SHALL render plain buttons with stable class names and no required stylesheet, SHALL default to a bottom-left corner placement over the view, and hosts MAY restyle, reposition, omit single buttons, replace the icons, add buttons of their own as children, or replace it. The icons SHALL be inline vector graphics rather than text glyphs, and the lock icon SHALL differ between the locked and unlocked states. Fit, zoom in and zoom out SHALL run the registered view commands, so the buttons reflect command availability; zoom in SHALL be unavailable at the maximum zoom and zoom out at the minimum, and the zoom commands SHALL keep working while the view is locked. The lock toggle SHALL switch the view's lock state and show it as pressed or released.

#### Scenario: Fit button
- **WHEN** the user presses the fit control with nodes outside the visible area
- **THEN** the viewport changes to show all nodes with the configured padding

#### Scenario: Lock toggle
- **WHEN** the user presses the lock control
- **THEN** the view becomes locked, the control shows the pressed state, and pressing it again restores editing

#### Scenario: Zoom buttons follow the limits
- **WHEN** the zoom reaches the configured maximum, by the button or by the zoom command
- **THEN** the zoom-in button is disabled with the reason "Already at the maximum zoom", and the zoom-out button stays enabled

#### Scenario: Host button
- **WHEN** a host passes a button of its own as a child of the panel
- **THEN** it appears after the built-in buttons in the same panel and works like them

#### Scenario: Zoom limits respected
- **WHEN** the zoom control is pressed repeatedly at the configured maximum zoom
- **THEN** the zoom stays at the maximum

### Requirement: One event channel and a generic state hook
The view SHALL announce every piece of view state a host can follow through the single `view.on` channel: `"viewport"` (at most once per animation frame, after painting), `"selection"` (the node IDs, the connection IDs and the primary entity), `"hover"`, `"lock"` and `"availability"` (raised when a command is registered or removed, the clipboard buffer is filled, or the zoom limits move, which change what a command can do without any other event). There SHALL be no second subscription style on the viewport or the selection. The react entry point SHALL export one generic hook that reads any value from the mounted view and re-renders when a named event fires and the value differs, and the built-in selection, viewport, hover and lock hooks SHALL be written with it. The selection hook SHALL report the selected node IDs, the selected connection IDs and the primary entity with its kind, and SHALL NOT expose the view's internal selection keys. The view's own selection handle and its event SHALL speak the same language: the handle reads and changes the selection by entity (kind and ID), and the `"selection"` event carries the same value as the hook.

#### Scenario: Selection through the event channel
- **WHEN** a host subscribes to `"selection"` and the selection is replaced, extended, then replaced with the same keys
- **THEN** it hears two events carrying the node IDs, connection IDs and the primary entity, and nothing for the repeat

#### Scenario: Host-defined state
- **WHEN** a component reads the selection size and the lock flag with the generic hook, naming the `"selection"` and `"lock"` events
- **THEN** it re-renders when either changes and shows the new values, and not otherwise

#### Scenario: Availability follows every trigger
- **WHEN** a toolbar button reads a command's availability and then a command is registered, something is copied, or the zoom limits are set to the current zoom
- **THEN** the button reflects the new state without any selection, model or viewport change

#### Scenario: Hook unmounted from a view
- **WHEN** the generic hook runs before an editor is mounted or during server rendering
- **THEN** it returns the fallback value it was given
