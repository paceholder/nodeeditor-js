/// <reference types="@vitest/browser-playwright" />
import { act, createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createGeometryRegistry,
  createGraphModel,
  exportSnapshot,
  type GraphModel,
  loadSnapshot,
  nodeId,
} from "../core/index.js";
import {
  type NodeSpec,
  submitChunked,
  twoPortNode,
} from "../core/space/scene/scene-fixtures.js";
import { frames } from "../view/browser-support.js";
import type { ViewModel } from "../view/index.js";
import { EditorProvider, NodeEditor, useNode } from "./index.js";
import { type Rendered, renderReact } from "./test-support/render-harness.js";

const rendered: Rendered[] = [];
afterEach(async () => {
  for (const r of rendered.splice(0)) await r.unmount();
});

// Render counts per probe, filled by the module-level components below.
const renders = new Map<string, number>();
beforeEach(() => renders.clear());

function bigModel(count: number): GraphModel {
  const model = createGraphModel();
  const nodes: NodeSpec[] = [];
  for (let i = 0; i < count; i++) {
    nodes.push(twoPortNode(`n${i}`, (i % 50) * 60, Math.floor(i / 50) * 40));
  }
  submitChunked(model, nodes, []);
  return model;
}

function NodeProbe(props: { id: string }): ReactNode {
  renders.set(props.id, (renders.get(props.id) ?? 0) + 1);
  const node = useNode(nodeId(props.id));
  return createElement(
    "span",
    { "data-node": props.id },
    node ? `${node.position.x},${node.position.y}` : "absent",
  );
}

/** A model whose `change`/`reset` subscriptions are counted. */
function counted(model: GraphModel) {
  let live = 0;
  const view: ViewModel = {
    reader: model.reader,
    on: ((type: never, handler: never) => {
      const off = model.on(type, handler);
      if (type === "change") live += 1;
      return () => {
        if (type === "change") live -= 1;
        off();
      };
    }) as ViewModel["on"],
  };
  return { view, live: () => live };
}

async function mount(model: ViewModel, ids: string[]) {
  const r = await renderReact(
    createElement(
      EditorProvider,
      null,
      createElement(NodeEditor, { model }),
      ...ids.map((id) => createElement(NodeProbe, { id, key: id })),
    ),
  );
  rendered.push(r);
  await frames();
  return r;
}

const move = (m: GraphModel, id: string, x: number): void => {
  m.moveNodes([{ node: nodeId(id), position: { x, y: 0 } }]);
};

describe("entity hooks", () => {
  it("Drag does not re-render inspector: moving another node leaves a node inspector alone", async () => {
    const m = bigModel(1000);
    const r = await mount(m, ["n1", "n2"]);
    const before = new Map(renders);
    await act(async () => {
      for (let x = 1; x <= 20; x++) move(m, "n1", x);
    });
    expect(renders.get("n2")).toBe(before.get("n2"));
    expect(renders.get("n1")).toBeGreaterThan(before.get("n1") ?? 0);
    expect(r.container.querySelector('[data-node="n1"]')?.textContent).toBe(
      "20,0",
    );
  });

  it("Entity-level subscription: one model subscription however many hooks, 1k nodes", async () => {
    const m = bigModel(1000);
    const alone = counted(m);
    const base = await mount(alone.view, []);
    const baseline = alone.live();
    await base.unmount();
    expect(alone.live()).toBe(0);
    const many = counted(m);
    const ids = Array.from({ length: 300 }, (_, i) => `n${i}`);
    const r = await mount(many.view, ids);
    expect(many.live() - baseline).toBeLessThanOrEqual(1);
    await r.unmount();
    expect(many.live()).toBe(0);
  });

  it("a reset notifies every hook and a node missing from the new document reads as absent", async () => {
    const m = bigModel(10);
    const r = await mount(m, ["n1", "n2"]);
    const before = renders.get("n2") ?? 0;
    await act(async () => {
      move(m, "n1", 5);
    });
    expect(renders.get("n2")).toBe(before);
    const smaller = exportSnapshot(bigModel(2));
    await act(async () => {
      expect(loadSnapshot(m, smaller).ok).toBe(true);
    });
    expect(renders.get("n2")).toBeGreaterThan(before);
    const text = (id: string) =>
      r.container.querySelector(`[data-node="${id}"]`)?.textContent;
    expect(text("n1")).toBe("60,0");
    expect(text("n2")).toBe("absent");
  });

  it("hooks keep following the model after a remount that keeps it (new geometry registry)", async () => {
    const m = bigModel(3);
    const tree = (geometry: ReturnType<typeof createGeometryRegistry>) =>
      createElement(
        EditorProvider,
        null,
        createElement(NodeEditor, { model: m, geometry }),
        createElement(NodeProbe, { id: "n1" }),
      );
    const r = await renderReact(tree(createGeometryRegistry()));
    rendered.push(r);
    await frames();
    // A different geometry registry remounts the view; the model stays the same.
    await r.rerender(tree(createGeometryRegistry()));
    await frames();
    await act(async () => {
      move(m, "n1", 7);
    });
    expect(r.container.querySelector('[data-node="n1"]')?.textContent).toBe(
      "7,0",
    );
  });
});
