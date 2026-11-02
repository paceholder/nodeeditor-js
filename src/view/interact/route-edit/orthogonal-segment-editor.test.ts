import { describe, expect, it } from "vitest";
import {
  type ConnectionEntry,
  type ConnectionId,
  createOrthogonalRouter,
  createRouteRegistry,
  polylineVertices,
  type RouteConstraint,
} from "../../../core/index.js";
import {
  cornerNode,
  createToolHarness,
} from "../../test-support/tool-harness.js";
import { createOrthogonalSegmentEditor } from "./orthogonal-segment-editor.js";

const V = (at: number): RouteConstraint => ({
  kind: "segment",
  orientation: "vertical",
  at,
});

const editor = createOrthogonalSegmentEditor();

/** An orthogonal wire with the given nodes (corner coordinates) and pins. */
function wire(to: [number, number], route: readonly RouteConstraint[] = []) {
  const routes = createRouteRegistry({ default: createOrthogonalRouter() });
  const h = createToolHarness({
    nodes: [cornerNode("a", 0, 0), cornerNode("b", to[0], to[1])],
    connections: [["c1", "a", "aR", "b", "bL"]],
    routes,
  });
  const id = h.model.reader.connections()[0]?.id as ConnectionId;
  if (route.length > 0) {
    h.model.execute({ kind: "setRoute", connection: id, route });
  }
  const entry = h.scene.connection(id) as ConnectionEntry;
  return { h, id, entry };
}

const world = (x: number, y: number) => ({ x, y });

describe("ROU-03c, ROU-03d orthogonal segment editor", () => {
  it("ROU-03c offers one handle per inner segment, free until pinned", () => {
    const { entry } = wire([200, 80]);
    // S shape: first segment, one vertical middle segment, last segment.
    expect(polylineVertices(entry.path as never)).toHaveLength(4);
    expect(editor.handles(entry).map((h) => h.pinned)).toEqual([false]);
  });

  it("ROU-03c a straight route (no inner segment, like an L) has no handles", () => {
    const straight = wire([200, 0]).entry;
    expect(editor.handles(straight)).toEqual([]);
  });

  it("ROU-03c marks the handle of a realized pin as pinned", () => {
    const { entry } = wire([200, 80], [V(100)]);
    const pinned = editor.handles(entry).filter((h) => h.pinned);
    expect(pinned).toHaveLength(1);
    expect(pinned[0]?.at.x).toBe(100);
  });

  it("ROU-03c hit finds the segment within the tolerance and nothing outside", () => {
    const { entry } = wire([200, 80]);
    const mid = editor.handles(entry).find((h) => h.id.startsWith("v"));
    expect(mid).toBeDefined();
    const at = mid?.at ?? world(0, 0);
    expect(editor.hit(entry, world(at.x + 3, at.y + 10), 4)?.id).toBe(mid?.id);
    expect(editor.hit(entry, world(at.x + 9, at.y), 4)).toBeUndefined();
  });

  it("ROU-03c dragging a free segment inserts a pin at its new coordinate", () => {
    const { entry } = wire([200, 80]);
    const mid = editor.handles(entry).find((h) => h.id.startsWith("v"));
    const handle = mid ?? { id: "", at: world(0, 0), pinned: false };
    const route = editor.drag(entry, handle, world(0, 0), world(40, 7));
    expect(route).toEqual([V(handle.at.x + 40)]);
  });

  it("ROU-03c dragging a pinned segment replaces its pin and keeps the others", () => {
    const { entry } = wire([200, 80], [V(100)]);
    const handle = editor.handles(entry).find((h) => h.pinned);
    expect(handle).toBeDefined();
    if (!handle) return;
    expect(editor.drag(entry, handle, world(0, 0), world(-30, 0))).toEqual([
      V(70),
    ]);
  });

  it("ROU-03c a new pin keeps walk order with existing pins", () => {
    // Two vertical pins around a free horizontal segment: a horizontal handle between.
    const { entry } = wire([300, 100], [V(80), V(200)]);
    const free = editor
      .handles(entry)
      .filter((h) => !h.pinned && h.id.startsWith("h"));
    expect(free.length).toBeGreaterThan(0);
    const handle = free[0];
    if (!handle) return;
    const route = editor.drag(entry, handle, world(0, 0), world(0, 12));
    expect(route.map((p) => p.orientation)).toEqual([
      "vertical",
      "horizontal",
      "vertical",
    ]);
    expect(route[0]).toEqual(V(80));
    expect(route[2]).toEqual(V(200));
  });

  it("ROU-03d activate on a pinned handle removes only that pin", () => {
    const { entry } = wire([300, 100], [V(80), V(200)]);
    const handle = editor
      .handles(entry)
      .find((h) => h.pinned && h.at.x === 200);
    expect(handle).toBeDefined();
    if (!handle) return;
    expect(editor.activate(entry, handle)).toEqual([V(80)]);
  });

  it("ROU-03d activate on a free handle does nothing", () => {
    const { entry } = wire([200, 80]);
    const handle = editor.handles(entry)[0];
    expect(handle && editor.activate(entry, handle)).toBeUndefined();
  });

  it("ROU-03c cursors follow the segment orientation", () => {
    const { entry } = wire([300, 100], [V(80), V(200)]);
    const cursors = editor.handles(entry).map((h) => editor.cursor(h));
    expect(cursors).toContain("ew-resize");
    expect(cursors).toContain("ns-resize");
  });
});
