# Design

## Context

- Reserved today: `GroupId` and the `"group"` ID kind (`core/base/ids/ids.ts`), and
  `groups?: readonly []` in `GraphSnapshot` (`core/io/snapshot/snapshot-types.ts`), which
  the validator requires to be empty.
- The model holds three collections (nodes, ports, connections). `PatchOp`
  (`core/data/patch/types.ts`) is a union of add / remove / update per entity kind;
  removes carry the full record and its `seq`, so the inverse restores order.
- `moveNodes` (`core/edit/commands/transform-nodes.ts`) updates node positions and shifts
  route pins of connections whose both ends move. `deleteEntities` plans the atomic delete.
- The scene (`core/space/scene/`) builds node and connection entries, indexes them, and
  `pickAt` returns hits of kind port, node or connection in interactive order.
- The view's selection keys are `n:` and `c:` (`selection-model.ts`). The select-and-move
  tool is a state machine with `pressed` and `dragging` states that commits one `moveNodes`
  on release. Tool order: pan, resize, connect, route-edit, select-move, empty-pan, marquee.
- The overlay host anchors DOM elements to world points; the library ships no text editor
  yet. The keymap already binds primary-modifier chords and suppresses the browser's action.
- Capabilities are per node and per action (`move`, `resize`, `rotate`, `mirror`, `edit`,
  `connect`, `disconnect`, `delete`); read-only mode denies every edit.
- Behavioural reference, the Qt predecessor (`../nodeeditor`, `NodeGroup`,
  `GroupGraphicsObject`, group hooks in `BasicGraphicsScene` and `NodeGraphicsObject`):
  frame derived from members plus margins, one group per node, empty groups removed,
  drop-to-join for free nodes, lock toggled by double-click, groups owned by the graphics
  scene rather than the model. This design keeps the first four, changes the lock control,
  and moves ownership into the model.

## Goals / Non-Goals

**Goals:** groups as first-class document entities with the same patch, undo, adapter and
serialization path as nodes; frame geometry in core; one history entry per gesture; the
group painter as an independent registration.

**Non-Goals:** collapse, nesting, stored rectangles, empty groups, a grouping capability
per node, a shipped menu.

## Decisions

### D1. Where groups live: a fourth collection, membership on the node
A `GroupRecord { id, title, locked, style? }` joins nodes, ports and connections in the
store, and `NodeRecord` gains `group?: GroupId`. The reader gets `getGroup`, `groups()` and
`groupMembers(id)` (an index kept with the other indexes, members in node collection order).

Alternatives:
- *Member list on the group* (`members: NodeId[]`, as the Qt JSON does). Rejected: "at most
  one group" becomes a cross-record rule to check on every patch, deleting a node has to
  edit another record, and two concurrent edits to one list conflict where two node updates
  do not.
- *Groups in the view* (as Qt does). Rejected: they would not be undoable through the
  model, would not reach an external authority, and two views would disagree. It also
  contradicts the rule that a view keeps no authoritative state.
- *Groups as a special node type.* Rejected: a group has no ports, position or size, and
  every node query would need to filter it out.

With membership on the node, joining and leaving are ordinary node updates
(`group: { old, new }`), and deleting a node drops its membership with the record.

### D2. Patch operations and integrity
`EntityKind` gains `"group"` with add, remove (record plus `seq`) and update (title,
locked, style) operations; inversion and equality follow the existing pattern. Integrity
adds two checks after a patch is staged: every `node.group` names an existing group, and
every group has at least one member. Planners keep the second true: `ungroup` clears the
members and removes the group; `removeFromGroup` and `deleteEntities` add the group removal
when the last member goes. Enforcing it in integrity too means a host-written patch cannot
create an empty group.

### D3. Commands
New command kinds, each one planner in `core/edit/commands/group-commands.ts` (split if it
passes 300 lines):

| Command | Patch |
| --- | --- |
| `groupNodes { nodes, title?, style? }` | add group, set `group` on each node, remove groups left empty |
| `ungroup { groups }` | clear `group` on members, remove groups |
| `addToGroup { group, nodes }` | set `group` (moving nodes out of other groups) |
| `removeFromGroup { nodes }` | clear `group`, remove groups left empty |
| `renameGroup { group, title }` | update title |
| `setGroupLocked { group, locked }` | update locked |

Moving a group is `moveNodes` over its members; no separate command. `moveNodes` gains an
optional `membership: { node, group | null }[]` so a drag that moves and regroups is one
patch (D7). `deleteEntities` accepts group IDs: a group alone is removed like `ungroup`.
Rejections: unknown entity, `group-locked` (membership change or partial move of a locked
group), title too long (limit beside the existing ones in `size-limits.ts`). The default
title is the literal `Group`; the host passes its own for localisation.

Convenience methods on the model facade carry the command names (`model.groupNodes(nodes)`,
`model.ungroup(groups)`, and so on). The shared membership logic, including removal of
groups left empty, is in `group-membership.ts`.

### D4. Frame geometry in core/space
`core/space/scene` gains a group entry: the union of the member node entries' body bounds,
grown by `padding` and a `titleHeight` strip on top (world units, scene options, defaults
16 and 24), plus two sub-rectangles: the title strip and the lock icon box. Entries are
rebuilt when a member entry changes or membership changes, using the group-members index,
so the cost is proportional to the affected groups. The move preview feeds the pending
positions through the same function, which also takes an explicit member list so the tool
can ask for "the frame without the moved nodes" (D7).

The lock icon's pointer target is constant in screen pixels, so its hit test takes the
viewport scale, as the resize handle does.

### D5. Picking and selection
`HitKind` gains `"group"` with two parts: `title` (the strip, including the lock box as a
sub-part) and `border` (a band of the picking tolerance around the outline). The interior
is not a hit. Groups come last in the interactive order. The selection key space gains
`g:<id>`; marquee containment and intersection use the frame rectangle. The context-menu
and hover targets gain a group kind.

### D6. Tools
- **Select-and-move** gets a third press target, `group`. Its drag moves the members; a
  press on a member of a locked group substitutes the whole group's members for the moved
  set (`selection/moved-nodes.ts`, shared with the arrow-key move and the clipboard). The
  membership outcome of a drop (D7) is computed by a pure helper, `group-drop.ts`.
- **Group frame tool** (`group-frame-tool.ts`), placed before select-and-move: a click on
  the lock box submits `setGroupLocked`; a second press on the same title strip within the
  double-click time asks the view to edit the title (a new `edit-group-title` effect). It
  declines everything else, so drags on the title strip reach select-and-move. Like the
  route-edit tool it remembers the last click, so it is created per view.
- **Commands** (`commands/group-commands.ts`): `group.create`, `group.ungroup`,
  `group.rename`. Delete passes selected groups to `deleteEntities`; cut removes a
  selected group together with its members, because that is what it copied.
- The marquee and empty-pan tools are unchanged: the interior yields no hit, so they see
  empty canvas.

`ToolOptions.groups: GroupOptions | false` with
`{ dragMembership: boolean; titleEditor: boolean }`, both true by default; `false` leaves
frames painted but not interactive.

### D7. Drop to join, drag out to leave
On each pointer move the helper (`group-drop.ts`) takes the moved nodes with their preview
positions and returns the membership changes the drop would make. Both tests use the
frames as they are in the scene, which does not change during a drag, so they are the
frames from when the gesture began:

1. A group is *open* when it is unlocked and at least one of its members is not moved.
2. A moved member of an open group whose body bounds do not intersect that group's frame
   leaves.
3. A moved node that is free after step 2 and whose bounds intersect the frame of another
   open group joins it; with several candidates, the one whose frame contains the
   pointer, then document order.

The preview carries, for every group the move touches, the members it will have after the
drop; the move preview painter draws those frames on the interaction layer and the scene
layer hides them meanwhile, so a pointer move repaints the interaction layer only. On
release the tool submits one `moveNodes` with `membership`.

The first version tested leaving against the frame of the members that stay behind. That
ejected a member on any move at all whenever it sat farther from the others than the
padding, which is the normal case. Testing against the whole frame from the start of the
gesture, as the Qt code does by remembering the group's original size, keeps "a move inside
the frame changes nothing" true and still lets a frame be enlarged by dragging a member
partly across its border.

The capability probe for `move` tries the whole group when a node belongs to a locked
group, so the drag, the arrow keys and the preview's lock marker agree, and one member that
may not move holds the whole locked group in place.

### D8. Lock
`locked` is a record field, so it is undoable, saved, and the same in every view. The
planner of `moveNodes` rejects a move that includes some but not all members of a locked
group with `group-locked`; the membership planners reject changes to a locked group.
`ungroup`, `renameGroup` and `setGroupLocked` ignore the lock.

### D9. Title editor
The first DOM control the library ships: one `<input>` created on demand in the overlay
slot, anchored to the title strip's world rectangle, sized from it, with the theme's font
and the title's colour on the frame's own fill. It draws no border and no focus ring (the
owner found a second frame inside the group frame heavy): the caret, in the selection
colour, and the selected text show focus. Enter and blur commit `renameGroup` when the text changed; Escape
discards. Input scoping already keeps graph shortcuts away from focused text fields. With
`titleEditor: false` the view raises a `group-title-edit` event carrying the group ID and
the strip's viewport rectangle instead. The editor closes without committing if its group
is removed or changed by any edit while open, following the rule that gestures yield to
changes of their entities.

### D10. Painter and theme
`painters.group` is a new slot in the painter registry with a default preset
(`render/presets/group-frame-painter.ts`): rounded fill, dashed border when unselected and
solid when selected, title text measured with the existing text measure, and a padlock
drawn as a path, open or closed. Theme tokens: fill, border, title color, selected border,
join-target border, plus a `groupStyles` map from style key to overrides. Frames are
painted first on the scene layer. The overview painter draws plain rectangles.

### D11. Snapshot, fragments and sync
`GraphSnapshot.groups` becomes `readonly GroupSnapshot[]` (`id`, `title`, `locked?`,
`style?`; `locked` omitted when false, the section omitted when empty) and `NodeSnapshot`
gains `group?`. The format version does **not** change. This follows the precedent of
`route`, which was added the same way: the fields are additive, a document without groups
is byte-identical to one written before, and an older reader refuses a document that uses
groups through its existing reserved-section error. Raising the version would have made
every new save unreadable to older readers even when it holds no group. The ID cursor gains
the group counter and load observes group IDs. Fragment extraction includes a selected
group and all its members; remapping gives it a new ID and drops `group` from nodes whose
group is not in the fragment. When the host names nodes, the create-fragment intent lists
the copied groups by positional key and each node's group key, so the host can create
them. The snapshot diff compares groups by ID and membership through the node field; the
snapshot adapter's display diff is built on export and diff and needs nothing of its own.

## Risks / Trade-offs

- [Accidental leave when spreading nodes apart] → the rest frame includes padding, the
  frame preview shows the outcome before release, one undo restores it, and
  `dragMembership: false` or the lock turns it off.
- [Widened unions break exhaustive host switches] → pre-release; listed in the changelog.
- [Frame recomputation on large groups during a drag] → only affected groups are rebuilt;
  add a group case to the benchmark fixture and compare against the move baseline.
- [Ctrl+G is "find next" in browsers] → suppressed only while the editor has focus, like
  the duplicate shortcut.
- [Duplicating one member yields a free node lying inside the frame] → accepted; it is the
  membership rule applied literally, and a drag joins it.
- [An external authority may accept a move and refuse the membership part] → the patch is
  atomic, so it is accepted or refused whole.

## Migration Plan

Additive, no version change. Older documents load as they are. Documents that use groups
are refused by 0.2.0 readers with the existing reserved-section error; documents that do
not are unaffected in both directions.
