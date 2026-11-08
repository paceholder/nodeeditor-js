/// <reference types="@vitest/browser-playwright" />
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { nodeId } from "../core/index.js";
import { buildModel, twoPortNode } from "../core/space/scene/scene-fixtures.js";
import { frames } from "../view/browser-support.js";
import { EditorProvider, NodeEditor, NodeOverlay } from "./index.js";
import { type Rendered, renderReact } from "./test-support/render-harness.js";

const rendered: Rendered[] = [];
afterEach(async () => {
  for (const r of rendered.splice(0)) await r.unmount();
});

const withA = () => buildModel([twoPortNode("a", 100, 100)]);
const withoutA = () => buildModel([twoPortNode("b", 100, 100)]);

type Model = ReturnType<typeof withA>;

/** The overlay stays mounted under the provider while the editor comes and goes. */
function tree(model: Model | null, gone: () => void): ReactNode {
  return createElement(
    EditorProvider,
    null,
    model ? createElement(NodeEditor, { model }) : null,
    createElement(NodeOverlay, { node: nodeId("a"), onNodeGone: gone }),
  );
}

describe("node gone notification", () => {
  it("unmounting the editor does not report the node as removed", async () => {
    let gone = 0;
    const model = withA();
    const r = await renderReact(tree(model, () => gone++));
    rendered.push(r);
    await frames();
    await r.rerender(tree(null, () => gone++));
    await frames();
    expect(gone).toBe(0);
  });

  it("swapping the editor's model does not report the node as removed", async () => {
    let gone = 0;
    const r = await renderReact(tree(withA(), () => gone++));
    rendered.push(r);
    await frames();
    await r.rerender(tree(withoutA(), () => gone++));
    await frames();
    expect(gone).toBe(0);
  });

  it("a removal from the shown model is still reported once", async () => {
    let gone = 0;
    const model = withA();
    const r = await renderReact(tree(model, () => gone++));
    rendered.push(r);
    await frames();
    model.deleteEntities({ nodes: [nodeId("a")] });
    await frames();
    expect(gone).toBe(1);
    await r.rerender(tree(model, () => gone++));
    await frames();
    expect(gone).toBe(1);
  });
});
