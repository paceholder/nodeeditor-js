/// <reference types="@vitest/browser-playwright" />
import { act, createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildModel, twoPortNode } from "../core/space/scene/scene-fixtures.js";
import { frames } from "../view/browser-support.js";
import type { ViewHandle } from "../view/index.js";
import { mouse } from "../view/interact/input/input-test-support.js";
import { EditorProvider, NodeEditor, useEditor, useHover } from "./index.js";
import { type Rendered, renderReact } from "./test-support/render-harness.js";

const rendered: Rendered[] = [];
afterEach(async () => {
  for (const r of rendered.splice(0)) await r.unmount();
});

const seen = { view: null as ViewHandle | null, renders: 0 };
beforeEach(() => {
  seen.view = null;
  seen.renders = 0;
});

function Grab(): null {
  seen.view = useEditor();
  return null;
}

function Hovered(): ReactNode {
  seen.renders += 1;
  const target = useHover();

  return createElement(
    "p",
    { id: "out" },
    target?.kind === "node" ? target.node : (target?.kind ?? "none"),
  );
}

async function mount() {
  const model = buildModel([
    twoPortNode("a", 100, 100, { w: 60, h: 40 }),
    twoPortNode("b", 300, 100, { w: 60, h: 40 }),
  ]);
  const r = await renderReact(
    createElement(
      EditorProvider,
      null,
      createElement(NodeEditor, { model }),
      createElement(Grab),
      createElement(Hovered),
    ),
  );
  rendered.push(r);
  await frames();
  const view = seen.view;
  if (!view) throw new Error("editor did not mount");
  const text = () => r.container.querySelector("#out")?.textContent;
  return { view, text };
}

describe("hover hook", () => {
  it("re-renders only when the hovered entity changes", async () => {
    const { view, text } = await mount();
    const m = mouse(view);
    expect(text()).toBe("none");
    const initial = seen.renders;

    await act(async () => {
      m.move(100, 100);
      await frames();
    });
    expect(text()).toBe("a");
    expect(seen.renders).toBe(initial + 1);

    // Moving within the same node renders nothing.
    await act(async () => {
      for (const dx of [2, 4, 6]) {
        m.move(100 + dx, 100);
        await frames();
      }
    });
    expect(seen.renders).toBe(initial + 1);

    await act(async () => {
      m.move(300, 100);
      await frames();
    });
    expect(text()).toBe("b");
    expect(seen.renders).toBe(initial + 2);

    await act(async () => {
      m.move(200, 250);
      await frames();
    });
    expect(text()).toBe("none");
    expect(seen.renders).toBe(initial + 3);
  });
});
