# @paceholder/nodeeditor-js

A general-purpose node editor library for JavaScript and TypeScript. It is the web
successor of the C++/Qt library QtNodes: a headless graph model with patches and undo,
a Canvas2D view, and React bindings.

- **Headless core**: graph model with stable IDs, ports and connections, patches and
  history, commands with policy checks, snapshots, geometry and a spatial index. Runs in
  Node, no DOM.
- **Canvas view**: Canvas2D rendering, pan and zoom, selection, moving, connecting,
  resizing, orthogonal routing with segment editing, overlays, and an image-symbol node
  preset with rotate and mirror.
- **React bindings**: a mount component, a provider and hooks. React 19 is an optional
  peer dependency.

**Stability:** version 0.x. The API may still change between minor versions; changes are
listed in the [changelog](https://github.com/paceholder/nodeeditor-js/blob/main/CHANGELOG.md).

ESM only, Node 20+, evergreen browsers. TypeScript needs `moduleResolution` set to
`bundler`, `node16` or `nodenext` in `tsconfig.json` to find the entry points' types.

```bash
npm install @paceholder/nodeeditor-js
```

## Model and view

```ts
import {
  createCardGeometry,
  createGeometryRegistry,
  createGraphModel,
} from "@paceholder/nodeeditor-js";
import {
  createCardPainter,
  createPainterRegistries,
  mountView,
} from "@paceholder/nodeeditor-js/view";

const model = createGraphModel();
model.registry.register({
  type: "step",
  label: "Step",
  defaultSize: { width: 140, height: 70 },
  ports: () => [
    { direction: "input", typeKey: "flow", label: "in" },
    { direction: "output", typeKey: "flow", label: "out" },
  ],
});
model.createNode("step", { x: 0, y: 0 }, { title: "First" });
model.createNode("step", { x: 240, y: 0 }, { title: "Second" });

const geometry = createGeometryRegistry();
geometry.register("step", createCardGeometry());
const painters = createPainterRegistries();
painters.nodes.register("step", createCardPainter());

// The container needs a size, for example a block with a height.
const container = document.getElementById("editor") as HTMLElement;
const view = mountView(container, { model, geometry, painters, initialFit: true });

// Later: view.dispose();
```

The model belongs to your application: edits go through it (`model.createNode`,
`model.connect`, `model.undo`, ...) and the view only shows it.

## React

```tsx
import { createGraphModel } from "@paceholder/nodeeditor-js";
import {
  EditorProvider,
  NodeEditor,
  ViewControls,
  useSelection,
} from "@paceholder/nodeeditor-js/react";
import { useState } from "react";

function Selected() {
  const { nodes } = useSelection();
  return <p>{nodes.length} selected</p>;
}

export function App() {
  // The model holds the document: keep it in state, not in useMemo.
  const [model] = useState(() => createGraphModel());
  return (
    <EditorProvider>
      <div style={{ height: 600, position: "relative" }}>
        <NodeEditor model={model} initialFit style={{ position: "absolute", inset: 0 }}>
          <ViewControls />
        </NodeEditor>
      </div>
      <Selected />
    </EditorProvider>
  );
}
```

The React entry is marked `"use client"` and is safe to import and server-render; the
canvas is created after mount in the browser.

## Documentation

- [Architecture](https://github.com/paceholder/nodeeditor-js/blob/main/docs/architecture.md):
  how the library is put together, with QtNodes comparisons.
- [Using the model](https://github.com/paceholder/nodeeditor-js/blob/main/docs/guide-using-the-model.md)
  and [the core model](https://github.com/paceholder/nodeeditor-js/blob/main/docs/guide-core-model.md).
- [Rendering in the browser](https://github.com/paceholder/nodeeditor-js/blob/main/docs/guide-view.md)
  and [interaction](https://github.com/paceholder/nodeeditor-js/blob/main/docs/interaction.md).
- [Using the editor from React](https://github.com/paceholder/nodeeditor-js/blob/main/docs/guide-react.md).
- [Installing in an application](https://github.com/paceholder/nodeeditor-js/blob/main/docs/guide-installing.md),
  including git-tag installs.
- [Geometry](https://github.com/paceholder/nodeeditor-js/blob/main/docs/geometry.md) and
  [the snapshot format](https://github.com/paceholder/nodeeditor-js/blob/main/docs/format.md).
- [Contributing](https://github.com/paceholder/nodeeditor-js/blob/main/CONTRIBUTING.md) and
  [security policy](https://github.com/paceholder/nodeeditor-js/blob/main/SECURITY.md).

Two runnable demos live in the repository: `examples/plain-js` (`npm run demo`) and
`examples/react` (`npm run demo:react`).

## License

MIT
