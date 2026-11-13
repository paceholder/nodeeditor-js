# groups Specification

## Purpose

Defines flat visual groups: durable view data that organizes nodes without creating a nested
or executable graph. Optional collapse and hierarchical extensions are described but not
required for R1.

## Requirements

### Requirement: Flat visual groups
The library SHALL support flat visual groups with stable ID, title, explicit membership, a frame, style, lock state, selection, movement, and undoable group and ungroup operations. A group SHALL organize nodes visually only: it SHALL NOT change connections, ports, or what the graph means. Grouping nodes that already belong to other groups SHALL move them into the new group. Ungrouping, and deleting a selected group, SHALL remove only the group and SHALL leave its member nodes and their connections unchanged.

#### Scenario: Create a named group
- **WHEN** the user groups three selected nodes and names the group
- **THEN** a group with a new stable ID, the title, and exactly those three members exists, and one undo removes it

#### Scenario: Ungroup keeps nodes
- **WHEN** a group is ungrouped
- **THEN** the group is removed and all member nodes remain with their positions and connections

#### Scenario: Grouping nodes taken from another group
- **WHEN** two of the three members of group A and one free node are grouped
- **THEN** a new group holds those three nodes, group A keeps its remaining member, and one undo restores both groups as they were

#### Scenario: Delete a selected group
- **WHEN** a group is selected, none of its members is selected, and the user deletes the selection
- **THEN** the group is removed and its member nodes remain

### Requirement: Membership changes only by command or by a drop
Group membership SHALL change only through an explicit membership command or through the drop of a move gesture described in the rule for dropping to join and dragging out to leave. Membership SHALL NOT change because of how nodes come to lie after any other edit, such as a keyboard move, a paste, an undo, or a change pushed by the host. Moving a group SHALL move each member node exactly once and update incident routes without duplicating connection edits.

#### Scenario: Dragging a node over a group
- **WHEN** a free node is dragged over a group's frame and the gesture is cancelled before release
- **THEN** the group's membership is unchanged; only a completed drop can add the node

#### Scenario: Node placed inside a frame without a drop
- **WHEN** a free node is moved with the arrow keys until it lies inside a group's frame
- **THEN** the group's membership is unchanged

#### Scenario: Move group
- **WHEN** a group with four members is moved
- **THEN** one command moves each member once and connections keep their IDs

#### Scenario: Explicit membership change
- **WHEN** the add-to-group command is applied to a node
- **THEN** the node becomes a member and the change is undoable

#### Scenario: Remove from group by command
- **WHEN** the remove-from-group command is applied to one member of a three-member group
- **THEN** the node is free, the group keeps two members, and the node's position is unchanged

### Requirement: Group collapse (SHOULD)
The library SHALL support collapsing and expanding a group with stable proxy endpoints for external connections. Collapse SHALL NOT alter logical endpoints, lose selection references, or claim to create a nested executable graph.

#### Scenario: Collapse and expand
- **WHEN** a group with two external connections is collapsed and then expanded
- **THEN** both connections reference their original port IDs throughout

### Requirement: Hierarchical groups (MAY)
Hierarchical groups or nested graph navigation MAY be provided through a separately specified extension. Imported documents with cyclic group ownership SHALL be rejected.

#### Scenario: Cyclic group metadata
- **WHEN** an imported snapshot declares group A inside group B and group B inside group A
- **THEN** the import is rejected with a structural error naming both groups

### Requirement: Groups are stored in the model document
A group SHALL be part of the model document, like a node or a connection, and not state of a view. Every change to a group or to membership SHALL be a patch with an inverse, submitted through the model adapter, so it is undoable, can be accepted or refused by an external authority, and is reported through the same change events as other edits. All views of one model SHALL show the same groups. A view SHALL keep only data derived from the document, such as frame geometry.

#### Scenario: Two views of one model
- **WHEN** two views show one model and a group is created through one of them
- **THEN** the other view shows the same group with the same ID, title and members

#### Scenario: Group edit refused by the authority
- **WHEN** an external authority refuses a submitted group creation
- **THEN** no group exists afterwards and the refusal is reported like any other rejected edit

#### Scenario: Headless grouping
- **WHEN** a program without any view groups two nodes through the model and then undoes
- **THEN** the group exists after the command and is gone after the undo

### Requirement: A node belongs to at most one group
A node SHALL belong to one group or to none. A group SHALL always have at least one member: an edit that removes the last member from a group, by removing it from the group or by deleting the node, SHALL remove the group in the same atomic edit, and one undo SHALL restore the group with its ID, title, lock state and style. A patch or imported document that would leave a group without members, or that names a group that does not exist as a node's group, SHALL be rejected with a structural error.

#### Scenario: Deleting every member
- **WHEN** both members of a group are deleted in one delete
- **THEN** the nodes and the group are removed in one patch, and one undo restores the nodes and the group with their original IDs

#### Scenario: Last member removed from its group
- **WHEN** the remove-from-group command is applied to the only member of a group
- **THEN** the node is free and the group no longer exists

#### Scenario: Patch that would empty a group
- **WHEN** a hand-written patch clears the group of the only member and does not remove the group
- **THEN** the patch is rejected with a structural error naming the group and nothing changes

### Requirement: Group frame derived from members
A group SHALL store no rectangle. Its frame SHALL be the smallest axis-aligned rectangle containing the body bounds of all its members, enlarged by a configurable padding and by a title strip along the top. The frame SHALL follow its members whenever a member is moved, resized, rotated, added or removed, including while an uncommitted move is previewed. Frame geometry SHALL be computable without a browser.

#### Scenario: Frame follows a moved member
- **WHEN** one member of a group is moved 100 world units to the right and still overlaps the frame formed by the other members
- **THEN** the frame's right edge moves so the frame again contains that member plus padding

#### Scenario: Frame without a browser
- **WHEN** a headless program asks for the frame of a group of two nodes
- **THEN** it receives the rectangle containing both nodes' body bounds plus padding and title strip

### Requirement: Group selection and movement
A group SHALL be selectable by a press on its title strip or its border, alone or together with nodes and connections, with the same additive and toggle modifiers as other entities, and a marquee SHALL select a group whose frame it covers under the marquee's containment or intersection mode. Dragging a group by its title strip or border SHALL move all its members by the same offset as one committed command and one history entry, with the same snapping as a node move; members that may not move SHALL be marked in the preview and SHALL stay in place. A press or drag on the interior of a frame that hits no node, port or connection SHALL behave as on empty canvas.

#### Scenario: Select by the title strip
- **WHEN** the user clicks a group's title strip
- **THEN** the group is selected and its members are not added to the selection

#### Scenario: Drag the frame
- **WHEN** the user drags a group of three nodes by its title strip by 40 world units
- **THEN** all three nodes move by that offset in one committed command and one undo moves them back

#### Scenario: Drag inside the frame
- **WHEN** the user drags from a blank spot inside a group's frame
- **THEN** the view pans as it does for a drag on empty canvas and no node moves

### Requirement: Drop to join and drag out to leave
When a move gesture ends, a moved member whose body bounds no longer overlap its group's frame SHALL leave the group, and a moved node that then belongs to no group and whose body bounds overlap the frame of another group SHALL join that group. Both tests SHALL use the frames as they were when the gesture began, so a frame never grows to keep hold of a node that is being dragged away, and a move that stays inside the frame changes no membership. A node that leaves one group and overlaps another in the same drop SHALL join the other. When a node overlaps more than one frame it SHALL join the group whose frame contains the pointer, and otherwise the group that comes first in document order. A group whose members are all moved by the gesture SHALL keep every member and SHALL gain none. A locked group SHALL accept no node and release none. During the drag the affected frames SHALL be drawn as they will be after the drop, and a group about to gain a node SHALL be highlighted by more than color. The move and every membership change of one gesture SHALL be one committed edit and one history entry, and a cancelled gesture SHALL change nothing. A view option SHALL turn joining and leaving by drag off.

#### Scenario: Drop a free node on a group
- **WHEN** the user drags a free node and releases it overlapping a group's frame
- **THEN** the node is a member of that group, the frame contains it, and one undo returns the node to its old position outside the group

#### Scenario: Drag a member out
- **WHEN** the user drags one member of a three-member group and releases it clear of the group's frame as it was when the drag began
- **THEN** the node is free, the frame contains only the other two, and one undo restores both position and membership

#### Scenario: Move that still overlaps the frame
- **WHEN** the user drags a member so that it ends partly outside the group's frame but still overlapping it
- **THEN** it stays a member and the frame grows to contain it

#### Scenario: Leave one group and join another
- **WHEN** the user drags a member of one group clear of its frame and releases it overlapping the frame of a second group
- **THEN** the node belongs to the second group and the whole drop is one history entry

#### Scenario: Preview while dragging over a group
- **WHEN** a free node is dragged over a group's frame and not yet released
- **THEN** the frame is drawn enlarged around the node and highlighted, and the document is unchanged

#### Scenario: Escape during the drag
- **WHEN** the user presses Escape while dragging a free node over a group
- **THEN** the node returns to its place and no membership changes

#### Scenario: Drag membership turned off
- **WHEN** the option is off and a free node is dropped overlapping a group's frame
- **THEN** the node moves and the group's membership is unchanged

### Requirement: Group lock
A group SHALL have a lock state stored in the document, off for a new group. While a group is locked, a drag of any member SHALL move the whole group as one unit, a command that moves only some of its members SHALL be rejected with a reason naming the lock, and nodes SHALL NOT join or leave it by drag or by command. Renaming, ungrouping and unlocking SHALL stay available. The frame SHALL show a padlock icon in a corner of its title strip, with a pointer target whose size is constant in screen pixels, drawn open or closed according to the state; a click on it SHALL toggle the lock as one undoable edit. A double-click on the frame SHALL NOT toggle the lock.

#### Scenario: Lock by the icon
- **WHEN** the user clicks the padlock icon of an unlocked group
- **THEN** the group is locked, the icon shows a closed padlock, and one undo unlocks it

#### Scenario: Drag a member of a locked group
- **WHEN** the user drags one member of a locked three-member group by 40 world units
- **THEN** all three members move by that offset in one committed command

#### Scenario: Drop on a locked group
- **WHEN** a free node is dropped overlapping the frame of a locked group
- **THEN** the node moves and does not join the group

#### Scenario: Partial move by command
- **WHEN** a program submits a move of one member of a locked group
- **THEN** the command is rejected with a reason naming the lock and nothing moves

### Requirement: Group title is shown and editable
The frame SHALL draw the group's title in its title strip, shortened with an ellipsis when it does not fit. Double-clicking the title strip, or pressing F2 while exactly one group is selected, SHALL open a text editor in place over the title. Pressing Enter, moving focus out of the editor, or pressing the pointer anywhere outside it SHALL close the editor and commit the text as one rename and one history entry when it differs from the current title; Escape SHALL close the editor without a change. The editor SHALL draw no border or ring of its own; the text caret and the selected text SHALL show that it has focus. It SHALL keep graph shortcuts from running while it has focus. A title SHALL be limited in length, and a longer one SHALL be rejected with a reason. A view option SHALL turn the built-in editor off, in which case the same double-click and key SHALL raise an event a host can answer with its own editor.

#### Scenario: Rename in place
- **WHEN** the user double-clicks a group's title, types a new name and presses Enter
- **THEN** the group has the new title and one undo restores the old one

#### Scenario: Escape while renaming
- **WHEN** the user opens the title editor, types, and presses Escape
- **THEN** the title is unchanged and the history gains no entry

#### Scenario: Press on the canvas while renaming
- **WHEN** the user types a new name in the title editor and then starts dragging a node
- **THEN** the editor closes, the group has the new title, and the drag proceeds as usual

#### Scenario: Typing letters in the title editor
- **WHEN** the user types R, M or Delete in the title editor
- **THEN** the characters edit the text and no rotate, mirror or delete command runs

#### Scenario: Rename by command
- **WHEN** a headless program renames a group
- **THEN** the title changes and the edit is undoable
