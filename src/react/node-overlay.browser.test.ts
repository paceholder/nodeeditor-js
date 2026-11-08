/// <reference types="@vitest/browser-playwright" />
import {
  createContext,
  createElement,
  type ReactNode,
  useContext,
} from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type NodeId, nodeId } from "../core/index.js";
import { buildModel, twoPortNode } from "../core/space/scene/scene-fixtures.js";
import { frames } from "../view/browser-support.js";
import type { ViewHandle } from "../view/index.js";
import {
  EditorProvider,
  NodeEditor,
  NodeOverlay,
  type NodeOverlayProps,
  useEditor,
} from "./index.js";
import { type Rendered, renderReact } from "./test-support/render-harness.js";

const rendered: Rendered[] = [];
afterEach(async () => {
  for (const r of rendered.splice(0)) await r.unmount();
});

const seen = { view: null as ViewHandle | null };
beforeEach(() => {
  seen.view = null;
});

function Grab(): null {
  seen.view = useEditor();
  return null;
}

const Theme = createContext("none");
function Label(): ReactNode {
  return createElement("span", { id: "label" }, useContext(Theme));
}

const KEYMAP = [
  { chord: "Delete", command: "edit.delete" },
  { chord: "x", command: "edit.delete" },
] as const;

async function mount(
  overlay: (Omit<NodeOverlayProps, "node"> & { node?: NodeId }) | null,
  content: ReactNode = createElement(Label),
) {
  const model = buildModel([
    twoPortNode("a", 100, 100, { w: 60, h: 40 }),
    twoPortNode("b", 300, 100, { w: 60, h: 40 }),
  ]);
  const tree = (o: typeof overlay): ReactNode =>
    createElement(
      EditorProvider,
      null,
      createElement(
        Theme.Provider,
        { value: "from-host" },
        createElement(NodeEditor, {
          model,
          input: { platform: "other", keymap: KEYMAP },
        }),
        createElement(Grab),
        o
          ? createElement(NodeOverlay, { node: nodeId("a"), ...o }, content)
          : null,
      ),
    );
  const r = await renderReact(tree(overlay));
  rendered.push(r);
  await frames();
  const view = seen.view;
  if (!view) throw new Error("editor did not mount");
  return {
    model,
    view,
    r,
    rerender: (o: typeof overlay) => r.rerender(tree(o)),
  };
}

describe("node overlay", () => {
  it("Context inside the overlay: content reads the host's context value", async () => {
    const { view } = await mount({});
    await frames();
    const label = view.overlayElement.querySelector("#label");
    expect(label?.textContent).toBe("from-host");
  });

  it("Overlay unmount: the element leaves the overlay layer", async () => {
    const { view, rerender } = await mount({});
    await frames();
    expect(view.overlayElement.childElementCount).toBe(1);
    await rerender(null);
    await frames();
    expect(view.overlayElement.childElementCount).toBe(0);
  });

  it("Overlay unmount: disposing the whole editor removes it too", async () => {
    const { view, r } = await mount({});
    await frames();
    await r.unmount();
    expect(view.disposed).toBe(true);
    expect(view.overlayElement.childElementCount).toBe(0);
  });

  it("Anchored node removed: hides, reports once, submits nothing", async () => {
    const gone: string[] = [];
    const { model, view } = await mount({
      onNodeGone: (reason) => gone.push(reason),
    });
    await frames();
    const slot = view.overlayElement.firstElementChild as HTMLElement;
    expect(slot.style.display).not.toBe("none");
    let changes = 0;
    model.on("change", () => {
      changes += 1;
    });
    model.deleteEntities({ nodes: [nodeId("a")] });
    await frames();
    expect(slot.style.display).toBe("none");
    expect(gone).toEqual(["node removed"]);
    // Only the external delete reached the model; the overlay submitted nothing.
    expect(changes).toBe(1);
  });
});
