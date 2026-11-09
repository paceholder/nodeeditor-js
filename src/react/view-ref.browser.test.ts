/// <reference types="@vitest/browser-playwright" />
import { createElement, createRef } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { createGeometryRegistry } from "../core/index.js";
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

describe("view handle by ref", () => {
  it("an object ref holds the view while mounted and null after unmount", async () => {
    const ref = createRef<ViewHandle | null>();
    const r = await renderReact(createElement(NodeEditor, { model, ref }));
    rendered.push(r);
    await frames();
    expect(ref.current).not.toBeNull();
    expect(typeof ref.current?.dispose).toBe("function");
    await r.unmount();
    expect(ref.current).toBeNull();
  });

  it("a callback ref receives each new view after a remount and null at the end", async () => {
    const calls: Array<ViewHandle | null> = [];
    const ref = (v: ViewHandle | null) => {
      calls.push(v);
    };
    const tree = () =>
      createElement(NodeEditor, {
        model,
        ref,
        geometry: createGeometryRegistry(),
      });
    const r = await renderReact(tree());
    rendered.push(r);
    await frames();
    await r.rerender(tree());
    await frames();
    await r.unmount();
    // view, null (old view disposed), view, null (unmount)
    expect(calls.map((c) => c !== null)).toEqual([true, false, true, false]);
    expect(calls[0]).not.toBe(calls[2]);
  });
});
