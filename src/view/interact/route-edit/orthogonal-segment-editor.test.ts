import { describe, expect, it } from "vitest";
import {
  type ConnectionEntry,
  type ConnectionId,
  createOrthogonalRouter,
  createRouteRegistry,
  type Point,
  polylineVertices,
  type RouteConstraint,
} from "../../../core/index.js";
import { rerouteEntry } from "../../render/paint/previews/ghost-entries.js";
import type {
  RouteEditContext,
  RouteHandle,
} from "../../render/registries/route-editor-registry.js";
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
const H = (at: number): RouteConstraint => ({
  kind: "segment",
  orientation: "horizontal",
  at,
});

const editor = createOrthogonalSegmentEditor();
const world = (x: number, y: number): Point<"world"> => ({ x, y });

/** An orthogonal wire with the given nodes (corner coordinates) and pins. */
function wire(to: [number, number], route: readonly RouteConstraint[] = []) {
  const routes = createRouteRegistry({ default: createOrthogonalRouter() });
  const h = createToolHarness({
    nodes: [cornerNode("a", 0, 0), cornerNode("b", to[0], to[1])],
    connections: [["c1", "a", "aR", "b", "bL"]],
    routes,
  });
  const id = h.model.reader.connections()[0]?.id as ConnectionId;
  const entryOf = (): ConnectionEntry =>
    h.scene.connection(id) as ConnectionEntry;
  if (route.length > 0) {
    h.model.execute({ kind: "setRoute", connection: id, route });
  }
  const context: RouteEditContext = {
    zoom: 1,
    reroute: (entry, pins) =>
      rerouteEntry(entry, pins, {
        reader: h.model.reader,
        scene: h.scene,
        routes,
      }),
  };
  return { h, id, entry: entryOf(), context };
}

const view = { zoom: 1 };
const verts = (entry: ConnectionEntry) =>
  polylineVertices(entry.path as never).map((p) => [p.x, p.y]);
const bends = (entry: ConnectionEntry): number => verts(entry).length - 2;
const move = (hs: readonly RouteHandle[], index: number) =>
  hs.find(
    (x) => x.role === "move" && x.id.endsWith(`:${index}`),
  ) as RouteHandle;
const split = (hs: readonly RouteHandle[], index: number) =>
  hs.find(
    (x) => x.role === "split" && x.id.endsWith(`:${index}`),
  ) as RouteHandle;

/** The route after dragging `handle` by (dx, dy), applied to the model. */
function dragged(
  w: ReturnType<typeof wire>,
  handle: RouteHandle,
  dx: number,
  dy: number,
) {
  const start = handle.at;
  const route = editor.drag(
    w.entry,
    handle,
    start,
    world(start.x + dx, start.y + dy),
    w.context,
  );
  w.h.model.execute({ kind: "setRoute", connection: w.id, route });
  return { route, entry: w.h.scene.connection(w.id) as ConnectionEntry };
}

describe("orthogonal segment editor", () => {
  it("offers a move handle for every segment, first and last included, free until pinned", () => {
    const { entry } = wire([200, 80]);
    // S shape: first stub-side segment, one vertical middle segment, last segment.
    expect(polylineVertices(entry.path as never)).toHaveLength(4);
    const moves = editor.handles(entry, view).filter((h) => h.role === "move");
    expect(moves.map((h) => h.pinned)).toEqual([false, false, false]);
    expect(moves.map((h) => h.id)).toEqual(["h:0", "v:1", "h:2"]);
  });

  it("Straight wire becomes editable: one move handle on the only segment", () => {
    const { entry } = wire([200, 0]);
    const moves = editor.handles(entry, view).filter((h) => h.role === "move");
    expect(moves).toHaveLength(1);
  });

  it("marks the handle of a realized pin as pinned", () => {
    const { entry } = wire([200, 80], [V(100)]);
    const pinned = editor.handles(entry, view).filter((h) => h.pinned);
    expect(pinned).toHaveLength(1);
    expect(pinned[0]?.at.x).toBe(100);
  });

  it("hit finds the segment within the tolerance and nothing outside", () => {
    const { entry } = wire([200, 80]);
    const mid = move(editor.handles(entry, view), 1);
    const at = mid.at;
    expect(editor.hit(entry, world(at.x + 3, at.y + 10), 4, view)?.id).toBe(
      mid.id,
    );
    expect(editor.hit(entry, world(at.x + 9, at.y), 4, view)).toBeUndefined();
  });

  it("dragging a free segment inserts a pin at its new coordinate", () => {
    const w = wire([200, 80]);
    const mid = move(editor.handles(w.entry, view), 1);
    const route = editor.drag(
      w.entry,
      mid,
      world(0, 0),
      world(40, 7),
      w.context,
    );
    expect(route).toEqual([V(mid.at.x + 40)]);
  });

  it("dragging a pinned segment replaces its pin and keeps the others", () => {
    const w = wire([200, 80], [V(100)]);
    const handle = editor.handles(w.entry, view).find((h) => h.pinned);
    expect(handle).toBeDefined();
    if (!handle) return;
    expect(
      editor.drag(w.entry, handle, world(0, 0), world(-30, 0), w.context),
    ).toEqual([V(70)]);
  });

  it("a new pin keeps walk order with existing pins", () => {
    // Two vertical pins around a free horizontal segment: a horizontal handle between.
    const w = wire([300, 100], [V(80), V(200)]);
    const free = editor
      .handles(w.entry, view)
      .filter((h) => h.role === "move" && !h.pinned && h.id.startsWith("h"));
    const handle = free.find((h) => h.at.x > 80 && h.at.x < 200);
    expect(handle).toBeDefined();
    if (!handle) return;
    const route = editor.drag(
      w.entry,
      handle,
      world(0, 0),
      world(0, 12),
      w.context,
    );
    expect(route.map((p) => p.orientation)).toEqual([
      "vertical",
      "horizontal",
      "vertical",
    ]);
    expect(route[0]).toEqual(V(80));
    expect(route[2]).toEqual(V(200));
  });

  it("activate on a pinned handle removes only that pin", () => {
    const { entry } = wire([300, 100], [V(80), V(200)]);
    const handle = editor
      .handles(entry, view)
      .find((h) => h.pinned && h.at.x === 200);
    expect(handle).toBeDefined();
    if (!handle) return;
    expect(editor.activate(entry, handle)).toEqual([V(80)]);
  });

  it("activate on a free handle does nothing", () => {
    const { entry } = wire([200, 80]);
    const handle = move(editor.handles(entry, view), 1);
    expect(editor.activate(entry, handle)).toBeUndefined();
  });

  it("cursors: resize by orientation, move on a diamond", () => {
    const { entry } = wire([300, 100], [V(80), V(200)]);
    const hs = editor.handles(entry, view);
    const cursors = hs.filter((h) => h.role === "move").map(editor.cursor);
    expect(cursors).toContain("ew-resize");
    expect(cursors).toContain("ns-resize");
    expect(hs.filter((h) => h.role === "split").map(editor.cursor)).toEqual(
      hs.filter((h) => h.role === "split").map(() => "move"),
    );
    expect(hs.some((h) => h.role === "split")).toBe(true);
  });

  it("End segment drag keeps the stub", () => {
    const w = wire([200, 80]);
    const first = move(editor.handles(w.entry, view), 0);
    const { route, entry } = dragged(w, first, 0, 30);
    expect(route).toHaveLength(1);
    expect(route[0]?.orientation).toBe("horizontal");
    const v = verts(entry);
    const p0 = verts(w.entry)[0] as number[];
    const stubEnd = verts(w.entry)[1] as number[];
    // Leaves the port along the escape direction for at least the clearance, then steps.
    expect(v[0]).toEqual(p0);
    expect(v[1]?.[1]).toBe(p0[1]);
    expect(v[1]?.[0]).toBeGreaterThanOrEqual((p0[0] as number) + 20);
    expect(v[1]?.[0]).toBeGreaterThanOrEqual(stubEnd[0] as number);
    expect(v.some((p) => p[1] === (p0[1] as number) + 30)).toBe(true);
  });

  it("Straight wire becomes editable: dragging it steps out from both stubs", () => {
    const w = wire([200, 0]);
    const only = move(editor.handles(w.entry, view), 0);
    const { entry } = dragged(w, only, 0, 40);
    expect(bends(entry)).toBe(4);
    const v = verts(entry);
    expect(v[1]?.[1]).toBe(v[0]?.[1]);
    expect(v[v.length - 2]?.[1]).toBe(v[v.length - 1]?.[1]);
  });
});

describe("split handles", () => {
  it("Short segment has no diamond: a segment under splitMinPx shows only its square", () => {
    const w = wire([200, 80]);
    const hs = editor.handles(w.entry, view);
    // All three segments are 80 long: a diamond each at zoom 1.
    expect(hs.filter((h) => h.role === "split")).toHaveLength(3);
    const short = editor.handles(w.entry, { zoom: 0.1 });
    expect(short.every((h) => h.role === "move")).toBe(true);
    const custom = createOrthogonalSegmentEditor({ splitMinPx: 1000 });
    expect(custom.handles(w.entry, view).every((h) => h.role === "move")).toBe(
      true,
    );
  });

  it("the diamond sits 16 CSS px from the square toward the later end", () => {
    const w = wire([200, 80]);
    const hs = editor.handles(w.entry, { zoom: 2 });
    const sq = move(hs, 1);
    const dia = split(hs, 1);
    expect(dia.at.x).toBe(sq.at.x);
    expect(dia.at.y - sq.at.y).toBeCloseTo(8, 9); // 16 px / zoom 2, downward
  });

  it("the diamond is hit before the square", () => {
    const w = wire([200, 80]);
    const hs = editor.handles(w.entry, view);
    const dia = split(hs, 1);
    expect(editor.hit(w.entry, dia.at, 6, view)?.role).toBe("split");
    expect(editor.hit(w.entry, move(hs, 1).at, 6, view)?.role).toBe("move");
  });

  it("Break a segment: a split yields three pins in walk order and two more bends", () => {
    // Pinned middle segment of a U-shaped route: horizontal at y = -40 from x 170 to 225.
    const w = wire([300, 100], [H(-40)]);
    const dia = split(editor.handles(w.entry, view), 2);
    const before = bends(w.entry);
    const { route, entry } = dragged(w, dia, 0, 30);
    expect(route.map((p) => p.orientation)).toEqual([
      "horizontal",
      "vertical",
      "horizontal",
    ]);
    expect(route[0]?.at).toBe(-40);
    expect(route[1]?.at).toBe(dia.at.x);
    expect(route[2]?.at).toBe(-10);
    expect(bends(entry)).toBe(before + 2);
    expect(verts(entry).some((p) => p[1] === -10)).toBe(true);
  });

  it("splitting a segment on a stub line drops the redundant stub-line pin", () => {
    const w = wire([200, 80]);
    const dia = split(editor.handles(w.entry, view), 0);
    const y0 = (verts(w.entry)[0] as number[])[1] as number;
    const { route, entry } = dragged(w, dia, 0, 30);
    expect(route.map((p) => p.orientation)).toEqual(["vertical", "horizontal"]);
    expect(route[0]?.at).toBe(dia.at.x);
    expect(route[1]?.at).toBe(y0 + 30);
    expect(bends(entry)).toBe(bends(w.entry) + 2);
  });

  it("a split with no movement changes nothing", () => {
    const w = wire([200, 80]);
    const dia = split(editor.handles(w.entry, view), 0);
    expect(editor.drag(w.entry, dia, dia.at, dia.at, w.context)).toEqual([]);
  });

  it("repeated breaks add bends and keep pins in walk order", () => {
    const w = wire([200, 0]);
    const first = dragged(w, split(editor.handles(w.entry, view), 0), 0, 30);
    expect(bends(first.entry)).toBe(4);
    const last = editor
      .handles(first.entry, view)
      .filter((h) => h.role === "split")
      .pop() as RouteHandle;
    const second = dragged({ ...w, entry: first.entry }, last, 0, -40);
    expect(bends(second.entry)).toBeGreaterThan(bends(first.entry));
    const xs = second.route
      .filter((p) => p.orientation === "vertical")
      .map((p) => p.at);
    expect(xs).toEqual([...xs].sort((p, q) => p - q));
  });
});

describe("redundant pins removed", () => {
  it("Drag into line removes the bends", () => {
    const w = wire([200, 0]);
    const y0 = (verts(w.entry)[0] as number[])[1] as number;
    const broken = dragged(w, split(editor.handles(w.entry, view), 0), 0, 30);
    expect(bends(broken.entry)).toBe(4);
    // The segment after the step lies 30 lower; drag it back into line with the ends.
    const lowered = editor
      .handles(broken.entry, view)
      .find(
        (h) => h.role === "move" && h.id.startsWith("h") && h.at.y === y0 + 30,
      );
    expect(lowered).toBeDefined();
    if (!lowered) return;
    const back = dragged({ ...w, entry: broken.entry }, lowered, 0, -30);
    expect(back.route).toEqual([]);
    expect(bends(back.entry)).toBe(0);
  });

  it("Drag back to the start: a free segment returned to its place leaves the list unchanged", () => {
    const w = wire([200, 80]);
    const mid = move(editor.handles(w.entry, view), 1);
    expect(
      editor.drag(w.entry, mid, world(0, 0), world(0, 0), w.context),
    ).toEqual([]);
    const first = move(editor.handles(w.entry, view), 0);
    expect(
      editor.drag(w.entry, first, world(0, 0), world(3, 0), w.context),
    ).toEqual([]);
  });

  it("a pinned segment dragged back to its automatic place drops its pin", () => {
    const w = wire([200, 80], [V(60)]);
    const handle = editor.handles(w.entry, view).find((h) => h.pinned);
    if (!handle) throw new Error("no pinned handle");
    const auto = wire([200, 80]).entry;
    const autoX = move(editor.handles(auto, view), 1).at.x;
    expect(
      editor.drag(w.entry, handle, world(60, 0), world(autoX, 0), w.context),
    ).toEqual([]);
  });

  it("dragging a segment replaces every pin it realizes", () => {
    // Two pins on one vertical line are realized by the same segment.
    const w = wire([200, 80], [V(60), V(60)]);
    const handle = editor.handles(w.entry, view).find((h) => h.pinned);
    if (!handle) throw new Error("no pinned handle");
    expect(
      editor.drag(w.entry, handle, world(60, 0), world(90, 0), w.context),
    ).toEqual([V(90)]);
  });
});
