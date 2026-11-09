// Consumer smoke: a small React component built on the react entry point.
import { createGraphModel } from "@paceholder/nodeeditor-js";
import { EditorProvider, NodeEditor } from "@paceholder/nodeeditor-js/react";

export function App() {
  return (
    <EditorProvider>
      <NodeEditor model={createGraphModel()} />
    </EditorProvider>
  );
}
