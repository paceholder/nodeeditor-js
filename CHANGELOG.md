# Changelog

All notable changes to `@paceholder/nodeeditor-js` are listed here. The project follows
[semantic versioning](https://semver.org/); while the version is 0.x, a minor version may
contain breaking changes.

## 0.1.0 (unreleased)

First release.

- Headless core: graph model with stable IDs, ports and connections, patches and history,
  commands with policy checks, graph snapshots, geometry and a spatial index.
- Canvas2D view: pan and zoom, selection, moving, connecting, resizing, orthogonal routing
  with segment editing, overlays, an image-symbol node preset with rotate and mirror, a
  connection chooser and a context-menu hook.
- React bindings: mount component, provider and hooks, a node-anchored overlay and view
  controls. React 19 is an optional peer dependency.
- ESM only, Node 20 or later, with type declarations for four entry points.
