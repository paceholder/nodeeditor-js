# Changelog

All notable changes to `@paceholder/nodeeditor-js` are listed here. The project follows
[semantic versioning](https://semver.org/); while the version is 0.x, a minor version may
contain breaking changes.

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
