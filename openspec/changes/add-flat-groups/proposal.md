# Proposal

## Why

Flat visual groups are a required part of the first release, yet nothing implements them:
the group ID kind is reserved, the snapshot has an empty `groups` placeholder, and there is
no group record, command, painter or tool. Node editors of this kind, the Qt predecessor
included, let a user frame related nodes, name the frame and move it as a unit; without it
a large graph cannot be organised.

The owner also settled how groups behave, and two of those decisions differ from the
current requirement: dropping a node on a group adds it to the group, and dragging a member
clear of its group removes it. The requirement that overlap never changes membership is
replaced accordingly.

## What Changes

- **Groups are model entities.** A group is a record in the document beside nodes, ports
  and connections: stable ID, title, locked flag, optional style key. Membership is a field
  of the node (the group it belongs to, or none), so a node is in at most one group by
  construction. Every group edit is a patch with an inverse, goes through the adapter, is
  undoable, is serialized, and is seen by every view of the model. A group always has at
  least one member; the edit that takes its last member away removes the group too.
- **Derived frame.** A group stores no rectangle. Its frame is the union of its members'
  body bounds plus padding and a title strip, computed in core so picking and culling stay
  headless.
- **Commands.** Group nodes, ungroup, add nodes to a group, remove nodes from a group,
  rename a group, lock or unlock a group, move a group. Grouping nodes that already belong
  to other groups moves them into the new group.
- **Shortcuts.** The primary modifier with G groups the selected nodes; with Shift+G it
  ungroups the selected groups and the groups of the selected nodes.
- **Drop to join, drag out to leave. BREAKING for the groups requirement.** Dropping a
  dragged free node so that it overlaps a group's frame adds it to that group; dropping a
  member clear of its group's frame removes it. The frame previews the
  outcome during the drag, and the move and the membership change are one history entry.
  A tool option turns both off.
- **Lock.** A locked group moves as one unit: dragging any member drags the whole group,
  and nodes cannot join or leave it. A small padlock icon in the frame's corner toggles the
  lock with a click; there is no double-click toggle. New groups start unlocked. The lock is
  stored in the document.
- **Title.** The frame draws its title in the title strip. Double-clicking the title, or
  pressing F2 with one group selected, opens an in-place text editor; Enter or leaving the
  field commits one rename, Escape cancels. Grouping by shortcut opens the editor on the new
  group.
- **Selection and movement.** A group is selected by its title strip or border and can be
  selected together with nodes and connections. Dragging it there moves all members in one
  command. The blank interior of a frame is not a grab area: a drag there pans as on empty
  canvas.
- **Delete.** Deleting a selected group removes only the frame, like ungroup. Deleting
  nodes removes a group whose members are all deleted, in the same patch.
- **Painting.** The group frame painter is its own registration with a default preset;
  frames paint beneath connections and nodes.
- **Snapshot and clipboard.** The snapshot's `groups` section and a node's `group` field
  carry groups through save, load, snapshot-mode pushes and clipboard fragments. Copying a
  selected group copies it with its members under new IDs.

Requirements implemented: flat visual groups; the atomic delete rule and the duplicate and
paste fragments rule as far as they concern groups; the one graph snapshot shape rule
(groups section); the z-order and interactive order rule (groups).
Refined: the rule that membership is independent of overlap, renamed to say membership
changes only by command or by a drop; the selection rule (groups are selectable); the
keyboard editing shortcuts rule (group, ungroup, rename); the independent extension
contracts rule (group frame painter).
New requirements: groups are stored in the model document; group frame derived from
members; a node belongs to at most one group; group lock; group title is shown and
editable; group selection and movement; drop to join and drag out to leave; group and
ungroup shortcuts; groups in the snapshot; group frame painter.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `groups`: membership rule replaced; storage, frame, lock, title, selection and drag
  membership requirements added.
- `interaction`: group, ungroup and rename shortcuts added.
- `serialization`: content of the snapshot's groups section defined.
- `canvas-view`: group frame painter and its place in the paint and picking order added.

## Out of Scope

- Group collapse with proxy endpoints (stays a should-have, separate change).
- Nested groups and nested graph navigation.
- A node in more than one group.
- A stored, user-resizable frame rectangle and empty groups.
- A per-node "may be grouped" capability; read-only mode and the group lock are the only
  gates. Moving a group still follows each member's move capability.
- A shipped context menu: hosts build "add to group" and similar menus from the commands
  and the context-menu event, which gains a group target.
- React hooks specific to groups.

## Impact

- Core: new group record and collection, node `group` field, patch operations for groups,
  integrity checks, planners, group frame entries in the scene and picking, snapshot
  validation, export, load, diff and fragment remapping. The snapshot format version
  stays the same: the fields are additive and omitted when unused.
- View: selection keys for groups, select-and-move handling of frames and drag membership,
  lock icon and title editor, group painter registration, theme tokens, keymap entries,
  context-menu and hover targets.
- Public API: additive (new command kinds, record and snapshot types, options, painter
  registration); the patch operation union and the hit kinds widen, which exhaustive
  switches in host code will notice.
- Docs: `docs/architecture.md`, `docs/format.md`, `docs/guide-view.md`, a short groups
  guide, and the demo.
- Order: after `add-reconnect-tool`, before `add-docking`.
