import { describe, expect, it } from "vitest";
import { createGeometryScene, nodeId } from "../../../core/index.js";
import {
  buildModel,
  twoPortNode,
} from "../../../core/space/scene/scene-fixtures.js";
import { cleanupScope, frames, makeHost } from "../../browser-support.js";
import { mountView } from "../../mount-view.js";
import { mouse, wheel } from "../input/input-test-support.js";

const cleanup = cleanupScope();

function box(w = 60, h = 30): HTMLElement {
  const el = document.createElement("input");
  el.style.cssText = `width:${w}px;height:${h}px;box-sizing:border-box;margin:0;`;
  return el;
}

describe("overlay", () => {
  it("inline editor on a node: sits at the node and is removed on dispose", async () => {
    const model = buildModel([twoPortNode("a", 100, 75, { w: 60, h: 30 })]);
    const host = makeHost(300, 200);
    const view = mountView(host, {
      model,
      initialViewport: { zoom: 1, panX: 20, panY: 10 },
    });
    cleanup(() => view.dispose());
    const body = createGeometryScene(model).node(nodeId("a"))?.bodyBounds;
    const editor = box();
    const handle = view.overlay.attach(editor, {
      kind: "node",
      node: nodeId("a"),
    });
    await frames();
    const hostBox = host.getBoundingClientRect();
    const at = editor.getBoundingClientRect();
    expect(at.left - hostBox.left).toBeCloseTo((body?.x ?? 0) + 20, 3);
    expect(at.top - hostBox.top).toBeCloseTo((body?.y ?? 0) + 10, 3);
    expect(view.overlayElement.contains(editor)).toBe(true);

    // The node moves: the editor follows the committed change.
    model.moveNodes([{ node: nodeId("a"), position: { x: 140, y: 75 } }]);
    await frames();
    expect(editor.getBoundingClientRect().left - hostBox.left).toBeCloseTo(
      (body?.x ?? 0) + 40 + 20,
      3,
    );

    handle.dispose();
    handle.dispose();
    expect(editor.isConnected).toBe(false);
  });

  it("an editor anchored to a removed node is hidden", async () => {
    const model = buildModel([twoPortNode("a", 100, 75)]);
    const view = mountView(makeHost(300, 200), { model });
    cleanup(() => view.dispose());
    const editor = box();
    view.overlay.attach(editor, { kind: "node", node: nodeId("a") });
    expect(editor.style.display).not.toBe("none");
    model.deleteEntities({ nodes: [nodeId("a")] });
    await frames();
    expect(editor.style.display).toBe("none");
  });

  it("overlay follows pan and zoom", async () => {
    const host = makeHost(300, 200);
    const view = mountView(host);
    cleanup(() => view.dispose());
    const fixed = box();
    const scaled = box(10, 10);
    view.overlay.attach(fixed, {
      kind: "world",
      point: { x: 10, y: 20 },
    });
    view.overlay.attach(scaled, {
      kind: "world",
      point: { x: 10, y: 20 },
      scale: true,
    });
    await frames();
    view.viewport.set({ zoom: 2, panX: 30, panY: 5 });
    await frames();
    const hostBox = host.getBoundingClientRect();
    const f = fixed.getBoundingClientRect();
    expect(f.left - hostBox.left).toBeCloseTo(10 * 2 + 30, 3);
    expect(f.top - hostBox.top).toBeCloseTo(20 * 2 + 5, 3);
    expect(f.width).toBeCloseTo(60, 3); // constant size on screen
    expect(scaled.getBoundingClientRect().width).toBeCloseTo(20, 3); // scales with zoom
    view.viewport.panBy(-5, 5);
    await frames();
    expect(fixed.getBoundingClientRect().left - hostBox.left).toBeCloseTo(
      45,
      3,
    );
  });

  it("hidden overlay does not block input", async () => {
    const host = makeHost(300, 200);
    const view = mountView(host);
    cleanup(() => view.dispose());
    const el = box(100, 100);
    const handle = view.overlay.attach(el, {
      kind: "world",
      point: { x: 0, y: 0 },
    });
    await frames();
    const r = host.getBoundingClientRect();
    const probe = () => document.elementFromPoint(r.left + 50, r.top + 50);
    expect(probe()).toBe(el);
    // Outside the element the overlay slot itself lets input through to the canvases/root.
    expect(document.elementFromPoint(r.left + 200, r.top + 150)).toBe(
      view.element,
    );
    handle.setVisible(false);
    expect(probe()).toBe(view.element);
    handle.setVisible(true);
    expect(probe()).toBe(el);
  });

  it("Menu fixed on screen: a viewport anchor ignores zoom and pan", async () => {
    const host = makeHost(300, 200);
    const view = mountView(host, {
      model: buildModel([twoPortNode("a", 100, 60)]),
    });
    cleanup(() => view.dispose());
    const menu = document.createElement("button");
    menu.style.cssText = "width:80px;height:24px;margin:0;";
    view.overlay.attach(menu, { kind: "viewport", point: { x: 40, y: 30 } });
    await frames();
    const hostBox = host.getBoundingClientRect();
    const where = () => {
      const r = menu.getBoundingClientRect();
      return [r.left - hostBox.left, r.top - hostBox.top, r.width];
    };
    expect(where()).toEqual([40, 30, 80]);
    wheel(view, 100, 60, -300);
    view.viewport.panBy(25, -10);
    await frames();
    expect(view.viewport.get().zoom).toBeGreaterThan(1);
    expect(where()).toEqual([40, 30, 80]);
    // A press on the menu is the menu's: no pan, no selection.
    const before = view.viewport.get();
    const press = mouse(view, menu);
    press.down(0, 0);
    press.move(50, 50);
    press.up(50, 50);
    expect(view.viewport.get()).toEqual(before);
    expect(view.selection.size).toBe(0);
  });

  it("Menu following the graph: a world anchor moves with a pan", async () => {
    const host = makeHost(300, 200);
    const view = mountView(host);
    cleanup(() => view.dispose());
    const menu = box();
    view.overlay.attach(menu, { kind: "world", point: { x: 50, y: 40 } });
    await frames();
    view.viewport.panBy(20, 10);
    await frames();
    const r = menu.getBoundingClientRect();
    const hostBox = host.getBoundingClientRect();
    expect([r.left - hostBox.left, r.top - hostBox.top]).toEqual([70, 50]);
  });

  it("a hidden viewport-anchored element does not block input", async () => {
    const host = makeHost(300, 200);
    const view = mountView(host);
    cleanup(() => view.dispose());
    const el = box(100, 100);
    const handle = view.overlay.attach(el, {
      kind: "viewport",
      point: { x: 0, y: 0 },
    });
    await frames();
    const r = host.getBoundingClientRect();
    const probe = () => document.elementFromPoint(r.left + 50, r.top + 50);
    expect(probe()).toBe(el);
    handle.setVisible(false);
    expect(probe()).toBe(view.element);
  });
});
