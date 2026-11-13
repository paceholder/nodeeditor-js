# Guide: groups

A group is a visual frame around some nodes, with a title and a lock. It organizes a
graph for the person reading it and changes nothing about ports, connections or what the
graph means. This guide covers the model side first (it works without a browser), then
what the mounted view adds.

If you know QtNodes: the behaviour is the one of its node groups (frame derived from the
members, one group per node, drop a node on a frame to add it), with three differences.
Groups live in the model instead of the graphics scene, the lock is a padlock icon instead
of a double-click, and a group has a title that is drawn and edited in place.

## 1. Where a group lives

In the model document, as a fourth kind of record beside nodes, ports and connections:

```
GroupRecord   id, title, locked, style?
NodeRecord    ..., group?          // the group this node belongs to
```

- **Membership is a field of the node.** A node is in one group or in none, by
  construction. `reader.groupMembers(id)` lists the members in node insertion order.
- **A group stores no rectangle.** Its frame is computed from its members (section 3).
- **A group is never empty.** The edit that takes the last member away removes the group
  in the same patch, and the model rejects a patch that would leave an empty group or a
  node naming a missing group.

Because groups are records, every group edit is a patch: it has an inverse (undo), it
goes through the model adapter (so a host that owns the document accepts or refuses it),
it is saved with the document, and every view of the model shows the same groups. One
backend with many clients therefore needs nothing special: a client's group edit reaches
the backend like a node move does, and the other clients receive it as an external change.

## 2. Commands

```ts
const made = model.groupNodes([a, b, c], { title: "Inlet stage" });
const group = made.status === "accepted" ? made.changed.groups[0] : undefined;

model.addToGroup(group, [d]);
model.removeFromGroup([b]);
model.renameGroup(group, "Feed");
model.setGroupLocked(group, true);
model.ungroup([group]);          // the nodes stay where they are
```

| Command | What it does |
| --- | --- |
| `groupNodes` | Puts the nodes into one new group. Nodes taken from other groups move into it; a group left without members is removed. The title defaults to `Group`. |
| `ungroup` | Removes the groups; members keep their positions and connections. |
| `addToGroup`, `removeFromGroup` | Explicit membership changes. Removing the last member removes the group. |
| `renameGroup` | Sets the title (at most 200 characters, else `out-of-range`). |
| `setGroupLocked` | Locks or unlocks. |
| `moveNodes` with `membership` | A move that also changes membership, as one edit. This is what a drag commits. |
| `deleteEntities` with `groups` | Removes the listed groups and frees their surviving members. Deleting every member of a group removes the group too. |

Moving a group is a `moveNodes` over its members; there is no separate command.

**The lock.** A locked group moves only as a whole and its membership is frozen: a move of
some but not all members, and any change that makes a node join or leave, is rejected with
the code `group-locked`. Renaming, unlocking, ungrouping and deleting nodes still work.
The lock is part of the record, so it is undoable, saved, and the same for every client.

Membership changes only through these commands and through the drop of a drag (section
4). Moving a node with the arrow keys into a frame, pasting, undo or a pushed snapshot
never change which group a node belongs to on their own.

## 3. The frame

The frame is the smallest rectangle around the members' bodies, grown by a padding
(default 16 world units) and by a title strip on top (default 24). It follows the members
when one is moved, resized, rotated, added or removed.

```ts
const scene = createGeometryScene(model, { groupFrame: { padding: 24 } });
scene.group(id)?.frame;        // Rect in world units
scene.group(id)?.titleStrip;
scene.groups(visibleRect);     // frames meeting a rectangle, in document order
```

Picking reports three parts of a frame, after every node, port and connection at the same
point: `lock` (the padlock, a square of constant size on screen), `title` (the strip) and
`border`. The interior is not a hit, so a press there is a press on empty canvas.

## 4. In the view

| Gesture or key | What happens |
| --- | --- |
| Click the title strip or the border | Selects the group (not its members). Shift and Ctrl/Cmd work as for nodes. |
| Drag the title strip or the border | Moves every member, one undo step. |
| Drag the blank interior | Pans, like empty canvas. |
| Drag a free node onto a frame | The node joins the group on release. The frame is drawn around it during the drag, with a doubled border. |
| Drag a member clear of the frame | The node leaves the group on release. |
| Click the padlock | Locks or unlocks. |
| Drag a member of a locked group | Moves the whole group. |
| Double-click the title, or F2 | Edits the title in place. Enter or clicking away commits, Escape cancels. |
| Ctrl/Cmd+G | Groups the selected nodes, selects the new group and opens its title editor. |
| Ctrl/Cmd+Shift+G | Ungroups the selected groups and the groups of the selected nodes. |
| Delete with a group selected | Removes the frame only. Select the nodes too to delete them. |
| Copy, cut, duplicate with a group selected | The group travels with all its members and gets a new ID on paste. Cut removes the members as well. |

**Joining and leaving by drag.** Both are judged against the frames as they were when the
drag began. A member leaves when it is dropped completely outside its group's frame; a
move that keeps it overlapping the frame leaves it a member, and the frame grows or
shrinks to fit, which is how a frame is resized. A free node joins the group whose frame
it overlaps when dropped (the one under the pointer when it overlaps several). A group
whose members are all being dragged keeps them all. The move and the membership change
are one undo step. Turn it off with `groups: { dragMembership: false }`.

```ts
mountView(container, {
  model,
  input: {
    toolOptions: {
      groups: { dragMembership: true, titleEditor: true }, // the defaults
      // groups: false  leaves frames painted but not interactive
    },
  },
});
```

**Your own title editor.** With `titleEditor: false` the double-click and F2 raise an
event instead of opening the built-in field:

```ts
view.on("group-title-edit", ({ group, title, rect }) => {
  // rect is the title strip in client pixels; open your editor there, then:
  view.commands.run("group.rename", { title: edited });
});
```

**Commands.** `group.create` (`{ title?, style? }`), `group.ungroup` and `group.rename`
(`{ title? }`; without a title it opens the editor) are in the command registry, so a
toolbar or a context menu runs the same code as the shortcuts. The context-menu event
reports a `group` target for a right-click on a title strip or border, and the selection
lists `groups` beside `nodes` and `connections`.

## 5. Painting and styles

The frame painter is its own registration, separate from node, port and connection
painters:

```ts
painters.group.set({
  paint(ctx, { group, frame, titleStrip, lockBox, style, state, detail, unit }) {
    // world space; draw the frame, the title and the lock as you like
  },
});
```

The default (`createGroupFramePainter()`) draws a filled rounded rectangle, the title and
a padlock. Its states differ by more than color: the border is dashed when idle, solid
and thicker when selected, and doubled while a node is about to join; the padlock is
drawn closed or open. Frames are painted beneath connections and nodes, and at the
overview level of detail without title and padlock.

Colors come from the theme: `groupFill`, `groupStroke`, `groupTitleColor`, `groupRadius`,
`groupJoin`. A group's `style` key selects a named style; an unknown key uses the default.

```ts
view.setTheme({
  groupStyles: { note: { groupFill: "rgba(255, 214, 102, 0.12)", groupStroke: "#ffd666" } },
});
model.groupNodes([a, b], { title: "To review", style: "note" });
```

## 6. Saving, and hosts that own the document

The snapshot lists groups in `groups` and each member node names its group in `group`
(see `docs/format.md`). Both are omitted when unused and the format version is unchanged,
so documents without groups are exactly as before.

A host that owns the document (`createSnapshotModel`) receives a group edit as an ordinary
submitted patch with group operations and node updates of the `group` field. It must store
the group records and each node's `group`, and include them in the snapshots it pushes;
otherwise the groups disappear with the next push. A host that does not want groups
refuses those edits and the client rolls back. `decodeIntents` reports group operations
under the `other` intent. When the host names nodes, the create-fragment intent of a paste
or duplicate lists the copied groups by key and each node's group key.
