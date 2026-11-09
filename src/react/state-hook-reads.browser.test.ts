/// <reference types="@vitest/browser-playwright" />
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { buildModel, twoPortNode } from "../core/space/scene/scene-fixtures.js";
import { frames } from "../view/browser-support.js";
import { EditorProvider, NodeEditor, useEditorState } from "./index.js";
import { type Rendered, renderReact } from "./test-support/render-harness.js";

const rendered: Rendered[] = [];
afterEach(async () => {
  for (const r of rendered.splice(0)) await r.unmount();
});

const model = () => buildModel([twoPortNode("a", 100, 100)]);

type Counts = { renders: number; reads: number };

/** A reader whose result is a new object holding a new array on every call. */
function FreshNested(props: { counts: Counts }) {
  props.counts.renders += 1;
  const value = useEditorState(
    (view) => {
      props.counts.reads += 1;
      return { selected: { ids: [...view.selection.nodes()] } };
    },
    ["selection"],
    { fallback: { selected: { ids: [] as string[] } } },
  );
  return createElement("i", null, value.selected.ids.length);
}

describe("state hooks", () => {
  it("a reader that returns a fresh nested value does not make the component render without end", async () => {
    const counts: Counts = { renders: 0, reads: 0 };
    const r = await renderReact(
      createElement(
        EditorProvider,
        null,
        createElement(NodeEditor, { model: model() }),
        createElement(FreshNested, { counts }),
      ),
    );
    rendered.push(r);
    await frames();
    expect(counts.renders).toBeLessThan(10);
  });

  it("a state hook reads at most once per render", async () => {
    const counts: Counts = { renders: 0, reads: 0 };
    const m = model();
    const tree = (label: string) =>
      createElement(
        EditorProvider,
        null,
        createElement(NodeEditor, { model: m }),
        createElement(FreshNested, { counts }),
        createElement("b", null, label),
      );
    const r = await renderReact(tree("one"));
    rendered.push(r);
    await frames();
    const before = counts.reads;
    await r.rerender(tree("two"));
    await r.rerender(tree("three"));
    // The reader is an inline function, so each render may read once; it must not read
    // more than once per render.
    expect(counts.reads - before).toBeLessThanOrEqual(2);
  });
});
