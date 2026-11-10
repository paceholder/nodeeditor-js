## ADDED Requirements

### Requirement: Clipboard shortcuts without a text selection
The platform copy, cut and paste shortcuts SHALL run their editor command exactly once while the view's root has focus, in every browser of the support matrix, including browsers that fire their native clipboard events only for an editable focused element or a text selection. The command SHALL still run only from the browser's native clipboard event, never from a timer or a second path, so no shortcut runs two commands. To make that event fire, the view MAY move focus for the duration of the key press to a hidden editable element inside its root, which SHALL NOT scroll the page, open an on-screen keyboard, take part in tab order or be exposed to assistive technology, and focus SHALL return to the root when the event has run. A text field, or host content in the overlay, SHALL keep its own clipboard behavior, and two editors on one page SHALL never share a shortcut.

#### Scenario: Copy and paste in Safari
- **WHEN** the canvas of a view in Safari has focus, two connected nodes are selected, and the user presses Cmd+C and then Cmd+V with the pointer over the view
- **THEN** one copy of both nodes and their connection appears at the pointer, the history gains one entry, and holding Cmd+V pastes only once

#### Scenario: Cut in Safari
- **WHEN** the canvas of a view in Safari has focus, one node is selected, and the user presses Cmd+X
- **THEN** the node is removed in one history entry and its fragment is on the clipboard

#### Scenario: Paste of foreign text
- **WHEN** the system clipboard holds plain text that is not a fragment and the user presses the paste shortcut on the canvas
- **THEN** nothing is pasted and the refusal reports that the text is not a fragment

#### Scenario: Text field keeps its clipboard
- **WHEN** a text field in a node editor overlay has focus and the user presses the copy, cut or paste shortcut
- **THEN** the text field's own action happens and no graph command runs

#### Scenario: Two editors
- **WHEN** two views are mounted, the user copies in the first and presses the paste shortcut with focus in the second
- **THEN** the paste happens only in the second view

#### Scenario: No side effects
- **WHEN** the user presses any of the three shortcuts on the canvas
- **THEN** the page does not scroll, focus ends on the view's root, and no on-screen keyboard opens
