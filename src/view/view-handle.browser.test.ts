/// <reference types="@vitest/browser-playwright" />
import { describe, expect, it, vi } from "vitest";
import { createGeometryScene, nodeId, portId } from "../core/index.js";
import { buildModel, twoPortNode } from "../core/space/scene/scene-fixtures.js";
import { cleanupScope, frames, makeHost, setDpr } from "./browser-support.js";
import { mountView } from "./mount-view.js";

const cleanup = cleanupScope();

function setup() {
  const model = buildModel(
    [twoPortNode("a", 60, 100, { w: 40, h: 20 }), twoPortNode("b", 240, 100)],
    [["c", "a", "aR", "b", "bL"]],
  );
  const host = makeHost(320, 200);
  const view = mountView(host, { model });
  cleanup(() => view.dispose());
  const scene = createGeometryScene(model);
  cleanup(() => scene.dispose());
  return { model, view, scene, host };
}

describe("view handle", () => {
  it("GEO-04a pick through view: client position to ordered candidates", async () => {
    const { view, scene, host } = setup();
    await frames();
    view.viewport.set({ zoom: 1.5, panX: 10, panY: 20 });
    const r = host.getBoundingClientRect();
    const toClient = (p: { x: number; y: number }) => ({
      x: r.left + p.x * 1.5 + 10,
      y: r.top + p.y * 1.5 + 20,
    });
    const anchor = scene
      .node(nodeId("a"))
      ?.anchors.find((a) => a.portId === portId("aR"));
    const onPort = toClient(anchor?.position ?? { x: 0, y: 0 });
    const hits = view.pick(onPort.x, onPort.y);
    expect(hits[0]).toMatchObject({ kind: "port", portId: "aR" });
    // On the body, away from ports: the node.
    const body = scene.node(nodeId("a"))?.bodyBounds;
    const inside = toClient({
      x: (body?.x ?? 0) + (body?.w ?? 0) / 2,
      y: (body?.y ?? 0) + (body?.h ?? 0) / 2,
    });
    expect(view.pick(inside.x, inside.y)[0]).toMatchObject({
      kind: "node",
      nodeId: "a",
    });
    // The same point converts to world coordinates through the shared transform.
    const w = view.clientToWorld(inside.x, inside.y);
    expect(w.ok && w.value.x).toBeCloseTo(
      (body?.x ?? 0) + (body?.w ?? 0) / 2,
      6,
    );
    // Empty space: nothing.
    expect(view.pick(r.left + 5, r.top + 190)).toEqual([]);
  });

  it("GEO-05 tolerance in CSS pixels at DPR 2, whatever the zoom", async () => {
    await setDpr(2);
    expect(window.devicePixelRatio).toBe(2);
    const { view, scene, host } = setup();
    await frames();
    const path = scene.connection("c" as never)?.path;
    const lineY = path?.p0.y ?? 0;
    const midX = ((path?.p0.x ?? 0) + (path?.p1.x ?? 0)) / 2;
    const r = host.getBoundingClientRect();
    for (const zoom of [1, 2]) {
      view.viewport.set({ zoom, panX: 0, panY: 0 });
      const x = r.left + midX * zoom;
      const y = r.top + lineY * zoom;
      // Default tolerance is 4 CSS pixels: 3 hits the connection, 6 does not.
      expect(view.pick(x, y + 3)[0]).toMatchObject({ kind: "connection" });
      expect(view.pick(x, y - 3)[0]).toMatchObject({ kind: "connection" });
      expect(view.pick(x, y + 6)).toEqual([]);
      expect(view.pick(x, y + 6, { tolerancePx: 8 })[0]).toMatchObject({
        kind: "connection",
      });
    }
  });

  it("GEO-04 viewport setters, interaction painters and element are exposed", async () => {
    const { view, host } = setup();
    await frames();
    expect(view.element.parentElement).toBe(host);
    view.viewport.zoomAt({ x: 100, y: 50 }, 2);
    view.viewport.panBy(10, 0);
    expect(view.viewport.get().zoom).toBe(2);
    const painter = { paint: vi.fn() };
    const remove = view.interaction.add(painter);
    await frames();
    const first = painter.paint.mock.calls.length;
    expect(first).toBeGreaterThan(0);
    view.interaction.invalidate();
    await frames();
    expect(painter.paint.mock.calls.length).toBe(first + 1);
    remove();
    view.interaction.invalidate();
    await frames();
    expect(painter.paint.mock.calls.length).toBe(first + 1);
  });
});
