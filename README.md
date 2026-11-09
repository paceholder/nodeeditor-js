# nodeeditor-js

A general-purpose node editor library for JavaScript and TypeScript. It is the web
successor of the C++/Qt library QtNodes: a headless graph model with patches and undo,
a Canvas2D view, and React bindings.

Status: pre-release (`0.1.0`). The API may still change.

```bash
npm install @paceholder/nodeeditor-js   # available after the first npm publish
```

See `docs/guide-installing.md` for git-tag installs and `docs/guide-releasing.md` for how
releases are published.

## What it provides

- **Headless core** (`@paceholder/nodeeditor-js`): graph model with stable IDs, ports and connections,
  patches and history, commands with policy checks, snapshots, geometry and a spatial
  index. Runs in Node, no DOM.
- **Canvas view** (`@paceholder/nodeeditor-js/view`): Canvas2D rendering, pan and zoom, selection,
  moving, connecting, resizing, orthogonal routing with segment editing, overlays, and an
  image-symbol node preset with rotate and mirror. `@paceholder/nodeeditor-js/view/advanced` exposes the
  building blocks.
- **React** (`@paceholder/nodeeditor-js/react`): a mount component, a provider, hooks for selection,
  viewport, hover, commands, history and single entities, a node-anchored overlay and an
  optional zoom, fit and lock panel. React 19 is an optional peer dependency.

Design rules: the core never touches the DOM; nothing runs at import time; views never keep
a second copy of the graph; every edit is a patch that an adapter applies atomically.

## Quick start

```bash
npm install
npm run build        # dist/{core,view,react}
npm test             # headless tests (vitest)
npm run test:browser # browser tests in Chrome
npm run demo         # live demo of examples/plain-js
npm run demo:react   # the same editor hosted from React (examples/react)
```

Node 20 or newer is required.

## Documentation

- `docs/architecture.md`: how the library is put together, with QtNodes comparisons.
- `docs/guide-installing.md`: depending on the library from an application (git tag or
  commit, install-time build, Node version, one React copy).
- `docs/guide-releasing.md`: publishing to npm (first manual publish, trusted publishing,
  later releases).
- `docs/guide-core-model.md`, `docs/guide-using-the-model.md`, `docs/guide-view.md`,
  `docs/guide-react.md`: walkthroughs of the implemented code.
- `docs/interaction.md`, `docs/geometry.md`, `docs/format.md`: interaction, geometry and
  the snapshot format.
- `openspec/specs/`: the requirements, one capability per folder. `openspec/changes/` holds
  planned work. Requirements are stable, named by their titles, and cited in tests.
- `AGENTS.md`: conventions for contributors and coding agents.

## License

MIT
