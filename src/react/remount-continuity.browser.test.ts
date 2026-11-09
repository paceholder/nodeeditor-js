/// <reference types="@vitest/browser-playwright" />
import { Activity, act, createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { createGeometryRegistry } from "../core/index.js";
import { buildModel, twoPortNode } from "../core/space/scene/scene-fixtures.js";
import { frames, selNode } from "../view/browser-support.js";
import type { ViewHandle } from "../view/index.js";
import { EditorProvider, NodeEditor, useEditor } from "./index.js";
import { type Rendered, renderReact } from "./test-support/render-harness.js";

const rendered: Rendered[] = [];
afterEach(async () => {
  for (const r of rendered.splice(0)) await r.unmount();
});

type Seen = { view: ViewHandle | null };

function Probe(props: { into: Seen }): null {
  props.into.view = useEditor();
  return null;
}

const model = () =>
  buildModel([twoPortNode("a", 100, 100), twoPortNode("b", 300, 100)]);

describe("remount continuity", () => {
  it("an editor hidden with Activity and shown again keeps its viewport and selection", async () => {
    const m = model();
    const seen: Seen = { view: null };
    const tree = (mode: "visible" | "hidden") =>
      createElement(Activity, {
        mode,
        // biome-ignore lint/correctness/noChildrenProp: Activity's typings require the prop
        children: createElement(
          EditorProvider,
          null,
          createElement(NodeEditor, { model: m }),
          createElement(Probe, { into: seen }),
        ),
      });
    const r = await renderReact(tree("visible"));
    rendered.push(r);
    await frames();
    const first = seen.view;
    await act(async () => {
      first?.viewport.set({ zoom: 2, panX: 30, panY: 40 });
      first?.selection.replace([selNode("b")]);
    });
    await r.rerender(tree("hidden"));
    await frames();
    await r.rerender(tree("visible"));
    await frames();
    const second = seen.view;
    expect(second).not.toBe(first);
    expect(second?.viewport.get()).toEqual({ zoom: 2, panX: 30, panY: 40 });
    expect(second?.selection.nodes()).toEqual([selNode("b").id]);
  });

  it("a remount caused by a changed remount option keeps viewport and selection", async () => {
    const m = model();
    const seen: Seen = { view: null };
    const tree = (geometry = createGeometryRegistry()) =>
      createElement(
        EditorProvider,
        null,
        createElement(NodeEditor, { model: m, geometry }),
        createElement(Probe, { into: seen }),
      );
    const r = await renderReact(tree());
    rendered.push(r);
    await frames();
    await act(async () => {
      seen.view?.viewport.set({ zoom: 1.5, panX: 5, panY: 6 });
      seen.view?.selection.replace([selNode("a")]);
    });
    const before = seen.view;
    await r.rerender(tree());
    await frames();
    expect(seen.view).not.toBe(before);
    expect(seen.view?.viewport.get()).toEqual({ zoom: 1.5, panX: 5, panY: 6 });
    expect(seen.view?.selection.nodes()).toEqual([selNode("a").id]);
  });

  it("a different model starts with a fresh viewport and no selection", async () => {
    const seen: Seen = { view: null };
    const tree = (m: ReturnType<typeof model>) =>
      createElement(
        EditorProvider,
        null,
        createElement(NodeEditor, { model: m }),
        createElement(Probe, { into: seen }),
      );
    const r = await renderReact(tree(model()));
    rendered.push(r);
    await frames();
    await act(async () => {
      seen.view?.viewport.set({ zoom: 2, panX: 30, panY: 40 });
      seen.view?.selection.replace([selNode("a")]);
    });
    await r.rerender(tree(model()));
    await frames();
    expect(seen.view?.viewport.get()).toEqual({ zoom: 1, panX: 0, panY: 0 });
    expect(seen.view?.selection.nodes()).toEqual([]);
  });
});
