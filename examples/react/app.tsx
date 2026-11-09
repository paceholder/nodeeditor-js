import {
  EditorProvider,
  NodeEditor,
  ViewControls,
} from "@paceholder/nodeeditor-js/react";
import { useMemo } from "react";
import { createDemo } from "./demo-model.js";
import { HoverPopover } from "./hover-popover.js";
import { Inspector } from "./inspector.js";
import { Toolbar } from "./toolbar.js";

export function App() {
  // Mount options other than the theme are fixed per view, so create them once.
  const demo = useMemo(createDemo, []);
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
