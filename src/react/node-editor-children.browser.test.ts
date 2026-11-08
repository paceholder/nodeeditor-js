/// <reference types="@vitest/browser-playwright" />
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGeometryRegistry } from "../core/index.js";
import { buildModel, twoPortNode } from "../core/space/scene/scene-fixtures.js";
import { frames } from "../view/browser-support.js";
import type { ViewHandle } from "../view/index.js";
import {
  EditorProvider,
  NodeEditor,
  NodeOverlay,
  useEditor,
  ViewControls,
} from "./index.js";
import { type Rendered, renderReact } from "./test-support/render-harness.js";

const rendered: Rendered[] = [];
afterEach(async () => {
  for (const r of rendered.splice(0)) await r.unmount();
  vi.restoreAllMocks();
});

const model = () => buildModel([twoPortNode("a", 100, 100)]);

const seen = { view: null as ViewHandle | null };

function Probe(): null {
  seen.view = useEditor();
  return null;
}

describe("NodeEditor children and onReady", () => {
  it("controls and overlays work as children, with no provider", async () => {
    const r = await renderReact(
      createElement(
        NodeEditor,
        { model: model() },
        createElement(ViewControls),
        createElement(
          NodeOverlay,
          { node: "a" as never },
          createElement("span", { id: "pop" }, "hello"),
        ),
      ),
    );
    rendered.push(r);
    await frames();
    expect(r.container.querySelector(".nodeeditor-controls")).not.toBeNull();
    expect(r.container.querySelector("#pop")?.textContent).toBe("hello");
  });

  it("onReady receives the view on mount and again after a remount", async () => {
    const m = model();
    const ready: ViewHandle[] = [];
    const tree = () =>
      createElement(NodeEditor, {
        model: m,
        geometry: createGeometryRegistry(),
        onReady: (v: ViewHandle) => ready.push(v),
      });
    const r = await renderReact(tree());
    rendered.push(r);
    await frames();
    expect(ready).toHaveLength(1);
    expect(ready[0]?.disposed).toBe(false);
    await r.rerender(tree());
    await frames();
    expect(ready).toHaveLength(2);
    expect(ready[0]?.disposed).toBe(true);
    expect(ready[1]?.disposed).toBe(false);
  });
});

describe("several editors in one provider", () => {
  it("an editor that unmounts leaves the slot of the editor that took it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const views: Record<string, ViewHandle> = {};
    const models = { a: model(), b: model() };
    const editor = (key: string) =>
      createElement(NodeEditor, {
        key,
        model: models[key as "a" | "b"],
        onReady: (v: ViewHandle) => {
          views[key] = v;
        },
      });
    const tree = (...keys: string[]) =>
      createElement(
        EditorProvider,
        null,
        ...keys.map(editor),
        createElement(Probe),
      );
    const r = await renderReact(tree("a"));
    rendered.push(r);
    await frames();
    await r.rerender(tree("a", "b"));
    await frames();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain("EditorProvider");
    expect(seen.view).toBe(views.b);
    await r.rerender(tree("b"));
    await frames();
    expect(views.a?.disposed).toBe(true);
    expect(seen.view).toBe(views.b);
    expect(seen.view?.disposed).toBe(false);
  });
});
