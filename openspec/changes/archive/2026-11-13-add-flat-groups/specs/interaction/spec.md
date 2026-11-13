## ADDED Requirements

### Requirement: Group and ungroup shortcuts
The default keymap SHALL bind grouping to the platform's primary modifier with G and ungrouping to the primary modifier with Shift+G, and each SHALL run the same command as the API. Grouping SHALL put every selected node into one new group, select that group, and, when the built-in title editor is on, open it on the new group. Ungrouping SHALL remove every selected group and every group that has a selected node as a member, as one committed edit. With no node selected grouping SHALL report unavailable, and with no group affected ungrouping SHALL report unavailable. The browser's own action for these keys SHALL NOT run while the editor has focus, and neither shortcut SHALL run while a text field has focus. An auto-repeated key-down of a held key SHALL NOT run either command again.

#### Scenario: Group the selection
- **WHEN** the editor has focus, three nodes are selected, and the user presses the primary modifier with G
- **THEN** one group containing those three nodes exists and is selected, the history gains one entry, and the browser's own action for that shortcut does not run

#### Scenario: Ungroup from a member
- **WHEN** one member node of a group is selected and the user presses the primary modifier with Shift+G
- **THEN** the group is removed, its nodes remain, and one undo restores the group

#### Scenario: Nothing to group
- **WHEN** only a connection is selected and the user presses the primary modifier with G
- **THEN** no group is created and the command reports unavailable

#### Scenario: Shortcut in a text field
- **WHEN** the user presses the primary modifier with G inside a text field in an overlay
- **THEN** no group is created
