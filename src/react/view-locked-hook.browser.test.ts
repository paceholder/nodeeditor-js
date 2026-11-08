/// <reference types="@vitest/browser-playwright" />
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { buildModel, twoPortNode } from "../core/space/scene/scene-fixtures.js";
import { frames } from "../view/browser-support.js";
import type { ViewHandle } from "../view/index.js";
import {
  EditorProvider,
  NodeEditor,
  useEditor,
  useViewLocked,
} from "./index.js";
import { type Rendered, renderReact } from "./test-support/render-harness.js";

const rendered: Rendered[] = [];
afterEach(async () => {
  for (const r of rendered.splice(0)) await r.unmount();
});

const seen = { view: null as ViewHandle | null, renders: 0 };

function reset(): void {
  seen.view = null;
  seen.renders = 0;
}

function Probe(): ReactNode {
  seen.view = useEditor();
  seen.renders += 1;
  return createElement("p", { id: "out" }, String(useViewLocked()));
}

describe("view lock hook", () => {
  it("follows the view lock and re-renders only when it changes", async () => {
    reset();
    const model = buildModel([twoPortNode("a", 100, 100)]);
    const r = await renderReact(
      createElement(
        EditorProvider,
        null,
        createElement(NodeEditor, { model }),
        createElement(Probe),
      ),
    );
    rendered.push(r);
    await frames();
    const text = () => r.container.querySelector("#out")?.textContent;
    expect(text()).toBe("false");
    seen.view?.setLocked(true);
    await frames();
    expect(text()).toBe("true");
    const after = seen.renders;
    seen.view?.setLocked(true);
    seen.view?.viewport.panBy(10, 10);
    await frames();
    expect(seen.renders).toBe(after);
    seen.view?.setLocked(false);
    await frames();
    expect(text()).toBe("false");
  });
});
