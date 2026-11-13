# Changelog

All notable changes to `@paceholder/nodeeditor-js` are listed here. The project follows
[semantic versioning](https://semver.org/); while the version is 0.x, a minor version may
contain breaking changes.

## Unreleased

- Fix: the browser's copy, cut and paste events follow the keymap. A clipboard command
  with no bound chord no longer runs from its native event, so a host that unbinds
  Mod+X no longer loses the selection on Ctrl+X, Shift+Delete or Edit > Cut. With the
  default keymap nothing changes.
- `native: true` on a binding only applies to `edit.copy`, `edit.cut` and `edit.paste`;
  on any other command the key-down runs that command like any other binding.
- The command context has an optional `pointer`: the world position of a mouse or pen
  pointer over the view. A host that replaces `edit.paste` or `edit.duplicate` uses it to
  place the copy.
- Taking over a clipboard command by registering a command under its ID is now a
  documented, tested way to route copy, cut, paste or duplicate to the host. Removing the
  replacement does not bring the built-in back.
- Breaking for hosts with `nodeCreation: "delegated"`: a duplicate reaches `onDelegate` as
  a new `duplicate` intent (node IDs, connection IDs, the IDs of copied groups and the
  offset) instead of a `create-fragment` intent, so the backend can copy the records in
  one operation. Answer plain `accepted`; no placeholder is shown. Paste still sends
  `create-fragment`.

## 0.3.0

Groups: frames around nodes, stored in the document. Minor version: several public unions
and records gained a group member.

- Groups are model records (`GroupRecord`) and a node names its group (`NodeRecord.group`),
  so group edits are undoable patches, go to a host that owns the document, are saved,
  and look the same in every view. A node is in at most one group; a group is never empty.
- Commands `groupNodes`, `ungroup`, `addToGroup`, `removeFromGroup`, `renameGroup`,
  `setGroupLocked`; `moveNodes` can carry membership changes and `deleteEntities` takes
  groups. A locked group moves only as a whole (rejection code `group-locked`).
- In the view: select and drag a frame by its title strip or border, drop a node on a
  frame to add it, drag a member clear of the frame to remove it, click the padlock to
  lock, double-click the title or press F2 to rename, Ctrl/Cmd+G to group and
  Ctrl/Cmd+Shift+G to ungroup. Options under `toolOptions.groups`.
- The frame painter is its own registration (`painters.group`) with theme tokens and
  named group styles.
- Snapshots carry `groups` and a node's `group`; the format version is unchanged and
  documents without groups are written as before.
- Breaking for exhaustive host code: `PatchOp`, `EntityKind`, `HitCandidate`,
  `ContextMenuTarget`, `HoverTarget` and `SelectedEntity` gained a group member;
  `ChangedIds`, `EntityIds`, `SelectionState` and `ScenePaintStats` gained a `groups`
  field; `ThemeTokens` gained the group tokens; `GraphReader` gained `getGroup`, `groups`
  and `groupMembers`.
- New guide `docs/guide-groups.md`.

## 0.2.0

A host application can now own the document. Minor version: painter inputs changed.

- Snapshot model (`createSnapshotModel`): the host keeps the document in its own store.
  The editor shows each edit at once, hands it to the host as an intent (move, resize,
  rotate, mirror, create, delete, connect, disconnect, reconnect) and waits for the answer.
  A rejected edit is rolled back; an unanswered one ends as unknown after `timeoutMs`.
- Pushed snapshots are applied as incremental changes: selection, viewport, history and
  gestures on untouched entities survive. A push with an older revision is ignored.
- Undo can stay local or be owned by the host (`history: "host"`).
- Delegated node creation: when the host names nodes and ports, a placeholder marks the
  drop position until the host answers. Paste and duplicate are handed over as one
  fragment intent.
- Connections are always named by the client. The host must reject a connection between
  ports that are already connected and an ID already in use; both are rolled back.
- `decodeIntents` turns a committed patch into intents; `conflict` and `resync-requested`
  events; the `unconfirmed` flag per entity and the placeholders list for painters.
- Breaking for custom painters: node, port and connection painters receive a required
  `unconfirmed` field, and interaction painters get the view state as a third argument.
- New guide `docs/guide-host-authority.md` and a runnable example in
  `examples/host-authority/`.

## 0.1.0 (2026-11-10)

First release.

- Headless core: graph model with stable IDs, ports and connections, patches and history,
  commands with policy checks, graph snapshots, geometry and a spatial index.
- Canvas2D view: pan and zoom, selection, moving, connecting, resizing, orthogonal routing
  with segment editing, overlays, an image-symbol node preset with rotate and mirror, a
  connection chooser and a context-menu hook.
- React bindings: mount component, provider and hooks, a node-anchored overlay and view
  controls. React 19 is an optional peer dependency.
- ESM only, Node 20 or later, with type declarations for four entry points.
