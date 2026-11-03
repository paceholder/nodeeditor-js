# nodeeditor-js

A general-purpose node editor library for JavaScript and TypeScript. It is the web
successor of the C++/Qt library QtNodes: a headless graph model with patches and undo,
a Canvas2D view, and (planned) React bindings.

Status: pre-release (`0.0.0`, not published). The API may still change.

## What it provides

- **Headless core** (`nodeeditor-js`): graph model with stable IDs, ports and connections,
  patches and history, commands with policy checks, snapshots, geometry and a spatial
  index. Runs in Node, no DOM.
- **Canvas view** (`nodeeditor-js/view`): Canvas2D rendering, pan and zoom, selection,
  moving, connecting, resizing, orthogonal routing with segment editing, overlays, and an
  image-symbol node preset with rotate and mirror. `nodeeditor-js/view/advanced` exposes the
  building blocks.
- **React** (`nodeeditor-js/react`): planned; today it re-exports the view.

Design rules: the core never touches the DOM; nothing runs at import time; views never keep
a second copy of the graph; every edit is a patch that an adapter applies atomically.

## Quick start

```bash
npm install
npm run build        # dist/{core,view,react}
npm test             # headless tests (vitest)
npm run test:browser # browser tests in Chrome
npm run demo         # live demo of examples/plain-js
```

Node 22 or newer is required.

## Documentation

- `docs/architecture.md`: how the library is put together, with QtNodes comparisons.
- `docs/guide-core-model.md`, `docs/guide-using-the-model.md`, `docs/guide-view.md`:
  walkthroughs of the implemented code.
- `docs/interaction.md`, `docs/geometry.md`, `docs/format.md`: interaction, geometry and
  the snapshot format.
- `openspec/specs/`: the requirements, one capability per folder. `openspec/changes/` holds
  planned work. Requirement IDs such as `MOD-03` are stable and cited in tests.
- `AGENTS.md`: conventions for contributors and coding agents.

## License

MIT
