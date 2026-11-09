/// <reference types="@vitest/browser-playwright" />
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { buildModel, twoPortNode } from "../core/space/scene/scene-fixtures.js";
import { frames } from "../view/browser-support.js";
import type { ViewHandle } from "../view/index.js";
import { NodeEditor } from "./index.js";
import { type Rendered, renderReact } from "./test-support/render-harness.js";

const rendered: Rendered[] = [];
afterEach(async () => {
  for (const r of rendered.splice(0)) await r.unmount();
});

const model = buildModel([twoPortNode("a", 100, 100)]);

describe("accessible name prop", () => {
  it("a changed label renames the mounted view without a remount", async () => {
    const views: ViewHandle[] = [];
    const onReady = (v: ViewHandle) => views.push(v);
    const r = await renderReact(
      createElement(NodeEditor, { model, label: "Circuit diagram", onReady }),
    );
    rendered.push(r);
    await frames();
    expect(views[0]?.element.getAttribute("aria-label")).toBe(
      "Circuit diagram",
    );
    await r.rerender(
      createElement(NodeEditor, { model, label: "Pump schematic", onReady }),
    );
    await frames();
    expect(views).toHaveLength(1);
    expect(views[0]?.element.getAttribute("aria-label")).toBe("Pump schematic");
  });

  it("removing the label restores Node editor", async () => {
    const views: ViewHandle[] = [];
    const onReady = (v: ViewHandle) => views.push(v);
    const r = await renderReact(
      createElement(NodeEditor, { model, label: "Circuit diagram", onReady }),
    );
    rendered.push(r);
    await frames();
    await r.rerender(createElement(NodeEditor, { model, onReady }));
    await frames();
    expect(views).toHaveLength(1);
    expect(views[0]?.element.getAttribute("aria-label")).toBe("Node editor");
  });
});
