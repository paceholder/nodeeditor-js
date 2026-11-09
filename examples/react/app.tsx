import {
  EditorProvider,
  NodeEditor,
  ViewControls,
} from "@paceholder/nodeeditor-js/react";
import { useState } from "react";
import { createDemo } from "./demo-model.js";
import { HoverPopover } from "./hover-popover.js";
import { Inspector } from "./inspector.js";
import { Toolbar } from "./toolbar.js";

export function App() {
  // Mount options other than the theme are fixed per view, so create them once. The model
  // holds the document, so it lives in state: React may discard a memoized value (and Fast
  // Refresh does), and that would silently replace the graph.
  const [demo] = useState(createDemo);
  return (
    <EditorProvider>
      <div className="app">
        <Toolbar />
        <div className="editor">
          <NodeEditor
            model={demo.model}
            geometry={demo.geometry}
            painters={demo.painters}
            initialFit
            style={{ position: "absolute", inset: 0 }}
          />
          <HoverPopover />
          <ViewControls />
        </div>
        <Inspector />
      </div>
    </EditorProvider>
  );
}
