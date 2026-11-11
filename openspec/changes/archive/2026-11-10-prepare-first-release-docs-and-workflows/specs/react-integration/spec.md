## ADDED Requirements

### Requirement: Connection chooser survives re-renders
An inline connection chooser passed to the mounting component SHALL NOT abort a choice that is pending when the host re-renders and passes a new function. The view SHALL call the most recent function. The chooser SHALL be installed or removed on the view only when the prop goes between present and absent.

#### Scenario: Chooser that sets state
- **WHEN** a chooser opens a menu by setting host state, the host re-renders with a new chooser function, and the user then picks an option
- **THEN** the request was not aborted and the connection is committed

### Requirement: State hooks read on change only
A state hook SHALL read its value again only after a view or model change it follows, or after its reader or arguments changed, and SHALL NOT read again on every render. A reader that returns a fresh nested value on each call SHALL NOT make the component re-render without end.

#### Scenario: Fresh nested value
- **WHEN** a state hook's reader returns a new object containing a new array on every call
- **THEN** the component renders a bounded number of times

### Requirement: Remount keeps viewport and selection
When the mounting component builds a new view for the same model (the editor hidden and shown again, or a changed remount option), the new view SHALL start with the previous view's viewport and selection, as it already does with the lock state, unless the model itself was replaced.

#### Scenario: Remount with a changed option
- **WHEN** the user zoomed and selected a node and a remount option then changes while the model stays the same
- **THEN** the new view has the same viewport and selection

### Requirement: View handle by reference
The mounting component SHALL accept a `ref` that receives the view handle when a view is mounted and `null` when it is disposed, so the host never keeps a disposed view.

#### Scenario: Unmount clears the ref
- **WHEN** the editor unmounts
- **THEN** the ref holds `null`

### Requirement: Command arguments compared by value
The command hooks SHALL treat command arguments that are equal by value as the same arguments, so an inline argument object does not cause new subscriptions.

#### Scenario: Inline arguments
- **WHEN** a component passes a new but equal argument object on every render
- **THEN** the hook does not resubscribe

### Requirement: Hydration
Server-rendered output of the mounting component SHALL hydrate on the client without a mismatch error, and the view SHALL mount afterwards.

#### Scenario: Hydrate
- **WHEN** the server-rendered markup is hydrated in a browser
- **THEN** no hydration error is reported and a canvas appears
