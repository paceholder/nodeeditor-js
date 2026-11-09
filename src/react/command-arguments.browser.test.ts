/// <reference types="@vitest/browser-playwright" />
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { buildModel, twoPortNode } from "../core/space/scene/scene-fixtures.js";
import { frames } from "../view/browser-support.js";
import type { ViewHandle } from "../view/index.js";
import {
  type CommandState,
  EditorProvider,
  NodeEditor,
  useCommand,
  useEditor,
} from "./index.js";
import { type Rendered, renderReact } from "./test-support/render-harness.js";

const rendered: Rendered[] = [];
afterEach(async () => {
  for (const r of rendered.splice(0)) await r.unmount();
});

type Seen = { view: ViewHandle | null; states: CommandState[] };

/** Passes an argument object that is new on every render but equal by value. */
function Button(props: { into: Seen }): null {
  props.into.view = useEditor();
  props.into.states.push(useCommand("edit.delete", { scope: "selection" }));
  return null;
}

describe("command hooks", () => {
  it("equal arguments given as a new object each render keep the same state object", async () => {
    const seen: Seen = { view: null, states: [] };
    const model = buildModel([twoPortNode("a", 100, 100)]);
    const tree = (label: string) =>
      createElement(
        EditorProvider,
        null,
        createElement(NodeEditor, { model }),
        createElement(Button, { into: seen }),
        createElement("i", null, label),
      );
    const r = await renderReact(tree("one"));
    rendered.push(r);
    await frames();
    const settled = seen.states.at(-1);
    await r.rerender(tree("two"));
    await r.rerender(tree("three"));
    expect(seen.states.at(-1)).toBe(settled);
  });

  it("equal arguments do not ask the view for availability again", async () => {
    const seen: Seen = { view: null, states: [] };
    const model = buildModel([twoPortNode("a", 100, 100)]);
    const tree = (label: string) =>
      createElement(
        EditorProvider,
        null,
        createElement(NodeEditor, { model }),
        createElement(Button, { into: seen }),
        createElement("i", null, label),
      );
    const r = await renderReact(tree("one"));
    rendered.push(r);
    await frames();
    const view = seen.view;
    if (!view) throw new Error("no view");
    let asked = 0;
    const original = view.commands.availability.bind(view.commands);
    view.commands.availability = (id, args) => {
      asked += 1;
      return original(id, args);
    };
    await r.rerender(tree("two"));
    await r.rerender(tree("three"));
    expect(asked).toBe(0);
  });
});
