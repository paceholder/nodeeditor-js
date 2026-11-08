/// <reference types="@vitest/browser-playwright" />
import { describe, expect, it } from "vitest";
import { createGeometryScene, nodeId } from "../core/index.js";
import { buildModel, twoPortNode } from "../core/space/scene/scene-fixtures.js";
import { cleanupScope, frames, makeHost } from "./browser-support.js";
import type { HoverEvent } from "./interact/hover/hover-types.js";
import { key, mouse } from "./interact/input/input-test-support.js";
import { mountView } from "./mount-view.js";
import { createPainterRegistries } from "./render/registries/painters.js";

const cleanup = cleanupScope();

function setup() {
  const model = buildModel(
    [
      twoPortNode("a", 100, 100, { w: 60, h: 40 }),
      twoPortNode("b", 300, 100, { w: 60, h: 40 }),
    ],
    [],
  );
  const scene = createGeometryScene(model);
  cleanup(() => scene.dispose());
  const centre = (id: string): [number, number] => {
    const b = scene.node(nodeId(id))?.bodyBounds;
    return [(b?.x ?? 0) + (b?.w ?? 0) / 2, (b?.y ?? 0) + (b?.h ?? 0) / 2];
  };
  // A node painter that records which nodes it saw as hovered.
  const hovered = new Set<string>();
  const painters = createPainterRegistries();
  painters.nodes.replace("t", {
    paint(_ctx, args) {
      if (args.state.hovered) hovered.add(args.node.id);
      else hovered.delete(args.node.id);
    },
  });
  const host = makeHost(500, 300);
  const view = mountView(host, { model, painters });
  cleanup(() => view.dispose());
  const events: HoverEvent[] = [];
  view.on("hover", (e) => events.push(e));
  return { model, host, view, centre, events, hovered };
}

describe("hover", () => {
  it("enter carries the node's screen rectangle, nothing within, one on leave", async () => {
    const { view, centre, events } = setup();
    await frames();
    const m = mouse(view);
    const [ax, ay] = centre("a");
    m.move(ax, ay);
    await frames();
    expect(events).toHaveLength(1);
    expect(events[0]?.target).toEqual({ kind: "node", node: "a" });
    expect(events[0]?.rect).toEqual(view.nodeRect(nodeId("a")));
    for (const dx of [2, 4, 6]) {
      m.move(ax + dx, ay);
      await frames();
    }
    expect(events).toHaveLength(1);
    m.move(200, 250);
    await frames();
    expect(events).toHaveLength(2);
    expect(events[1]).toEqual({ target: null });
    expect(view.hover.get()).toBeNull();
  });

  it("the pointer leaving the view raises the leave form", async () => {
    const { view, centre, events } = setup();
    await frames();
    const [ax, ay] = centre("a");
    mouse(view).move(ax, ay);
    await frames();
    view.element.dispatchEvent(
      new PointerEvent("pointerleave", { pointerType: "mouse" }),
    );
    await frames();
    expect(events.map((e) => e.target?.kind ?? null)).toEqual(["node", null]);
  });

  it("a node drag raises none; at its end one for the entity under the pointer", async () => {
    const { view, centre, events } = setup();
    await frames();
    const m = mouse(view);
    const [ax, ay] = centre("a");
    const [bx, by] = centre("b");
    m.move(ax, ay);
    await frames();
    expect(events).toHaveLength(1);
    m.down(ax, ay);
    for (let i = 1; i <= 8; i++) {
      m.move(ax + ((bx - ax) * i) / 8, ay + ((by - ay) * i) / 8);
      await frames(2);
    }
    // The pointer crossed empty space and ended on the other node: still nothing.
    expect(events).toHaveLength(1);
    // Cancelling puts the dragged node back, so the pointer rests on the other node.
    key(view.element, "Escape");
    await frames();
    expect(events).toHaveLength(2);
    expect(events[1]?.target).toEqual({ kind: "node", node: "b" });
  });

  it("the hovered flag reaches painters for that node only", async () => {
    const { view, centre, hovered } = setup();
    await frames();
    const m = mouse(view);
    const [ax, ay] = centre("a");
    m.move(ax, ay);
    await frames(3);
    expect([...hovered]).toEqual(["a"]);
    m.move(200, 250);
    await frames(3);
    expect([...hovered]).toEqual([]);
  });

  it("a deleted hovered node clears the state and raises a leave", async () => {
    const { model, view, centre, events } = setup();
    await frames();
    const [ax, ay] = centre("a");
    mouse(view).move(ax, ay);
    await frames();
    expect(view.hover.get()).toEqual({ kind: "node", node: "a" });
    model.deleteEntities({ nodes: [nodeId("a")] });
    expect(view.hover.get()).toBeNull();
    expect(events[events.length - 1]).toEqual({ target: null });
  });

  it("unsubscribed handlers hear nothing, and dispose stops the tracker", async () => {
    const { view, centre } = setup();
    await frames();
    const seen: HoverEvent[] = [];
    const off = view.on("hover", (e) => seen.push(e));
    off();
    const [ax, ay] = centre("a");
    mouse(view).move(ax, ay);
    await frames();
    expect(seen).toHaveLength(0);
  });
});
