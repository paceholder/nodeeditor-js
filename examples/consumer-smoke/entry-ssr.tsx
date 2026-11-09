// Consumer smoke: renders a component that calls hooks of the host's React and of the
// library's react entry point. It throws if two React copies are bundled (the hook
// dispatcher of one copy is not set in the other).
import { createGraphModel } from "@paceholder/nodeeditor-js";
import {
  EditorProvider,
  NodeEditor,
  useEditor,
} from "@paceholder/nodeeditor-js/react";
import { useState } from "react";
import { renderToString } from "react-dom/server";

function Probe() {
  const [count] = useState(1);
  const editor = useEditor();
  return (
    <p>
      {count}:{editor === null ? "none" : "mounted"}
    </p>
  );
}

const html = renderToString(
  <EditorProvider>
    <NodeEditor model={createGraphModel()} />
    <Probe />
  </EditorProvider>,
);
console.log(
  html.replaceAll("<!-- -->", "").includes("1:none")
    ? "react-ok"
    : `unexpected: ${html}`,
);
