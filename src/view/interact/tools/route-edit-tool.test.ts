import { describe, expect, it } from "vitest";
import {
  type ConnectionId,
  createOrthogonalRouter,
  createRouteRegistry,
  type RouteConstraint,
} from "../../../core/index.js";
import { createRouteEditorRegistry } from "../../render/registries/route-editor-registry.js";
import {
  cornerNode,
  createToolHarness,
  type ToolHarness,
} from "../../test-support/tool-harness.js";
import { createOrthogonalSegmentEditor } from "../route-edit/orthogonal-segment-editor.js";
import { connectionKey } from "../selection/selection-model.js";
import type { ToolOptions } from "./thresholds.js";

const V = (at: number): RouteConstraint => ({
  kind: "segment",
  orientation: "vertical",
  at,
});

/**
 * a(0,0) -> b(200,80): the wire runs (40,10) (120,10) (120,90) (200,90), so its only inner
 * segment is the vertical one at x = 120, y 10..90.
 */
function setup(opts: {
  editor?: boolean;
  select?: boolean;
  route?: readonly RouteConstraint[];
  options?: Partial<ToolOptions>;
}) {
  const routeEditors = createRouteEditorRegistry();
  if (opts.editor !== false) {
    routeEditors.register("default", createOrthogonalSegmentEditor());
  }
  const h = createToolHarness({
    nodes: [cornerNode("a", 0, 0), cornerNode("b", 200, 80)],
    connections: [["c1", "a", "aR", "b", "bL"]],
    routes: createRouteRegistry({ default: createOrthogonalRouter() }),
    routeEditors,
    ...(opts.options ? { options: opts.options } : {}),
  });
  const id = h.model.reader.connections()[0]?.id as ConnectionId;
  if (opts.route) {
    h.model.execute({ kind: "setRoute", connection: id, route: opts.route });
  }
  if (opts.select !== false) h.selection.replace([connectionKey(id)]);
  return { h, id };
}

const routeOf = (h: ToolHarness, id: ConnectionId) =>
  h.model.reader.getConnection(id)?.route;

describe("ROU-03b, ROU-03c route-edit tool: drag", () => {
  it("ROU-03c, INT-08 a drag on a handle previews each move and commits one setRoute", () => {
    const { h, id } = setup({});
    expect(h.down({ x: 120, y: 50 }).handled).toBe(true);
    expect(h.router.activeTool).toBe("route-edit");
    h.move({ x: 140, y: 52 });
    h.move({ x: 160, y: 55 });
    expect(h.log.previews).toEqual([
      { kind: "route", connection: id, route: [V(140)] },
      { kind: "route", connection: id, route: [V(160)] },
    ]);
    h.up({ x: 160, y: 55 });
    expect(h.log.commits).toEqual([
      { kind: "setRoute", connection: id, route: [V(160)] },
    ]);
    expect(h.log.previews.at(-1)).toBeNull();
    expect(routeOf(h, id)).toEqual([V(160)]);
    // The wire stays selected and no node moved.
    expect(h.selection.connectionIds()).toEqual([id]);
  });

  it("ROU-03c undo restores the constraints", () => {
    const { h, id } = setup({});
    h.down({ x: 120, y: 50 });
    h.move({ x: 150, y: 50 });
    h.up({ x: 150, y: 50 });
    expect(routeOf(h, id)).toEqual([V(150)]);
    h.model.undo();
    expect(routeOf(h, id)).toBeUndefined();
  });

  it("ROU-03c, INT-05 Escape discards the preview and commits nothing", () => {
    const { h, id } = setup({});
    h.down({ x: 120, y: 50 });
    h.move({ x: 150, y: 50 });
    h.key("Escape");
    expect(h.log.commits).toEqual([]);
    expect(h.log.previews.at(-1)).toBeNull();
    expect(h.router.activeTool).toBeUndefined();
    expect(routeOf(h, id)).toBeUndefined();
  });

  it("ROU-03c a press below the drag threshold commits nothing", () => {
    const { h } = setup({});
    h.down({ x: 120, y: 50 });
    h.move({ x: 121, y: 50 });
    h.up({ x: 121, y: 50 });
    expect(h.log.commits).toEqual([]);
    expect(h.log.previews).toEqual([]);
  });

  it("ROU-03c a drag of a pinned segment back to its start commits nothing", () => {
    const { h } = setup({ route: [V(100)] });
    h.down({ x: 100, y: 50 });
    h.move({ x: 150, y: 50 });
    h.move({ x: 100, y: 50 });
    h.up({ x: 100, y: 50 });
    expect(h.log.commits).toEqual([]);
  });
});

describe("ROU-03b, ROU-03c route-edit tool: acceptance", () => {
  it("ROU-03b an unselected wire is not accepted", () => {
    const { h } = setup({ select: false });
    h.down({ x: 120, y: 50 });
    expect(h.router.activeTool).toBe("select-move");
  });

  it("ROU-03b Kind without an editor starts no route edit", () => {
    const { h, id } = setup({ editor: false });
    h.down({ x: 120, y: 50 });
    expect(h.router.activeTool).not.toBe("route-edit");
    h.move({ x: 160, y: 50 });
    h.up({ x: 160, y: 50 });
    expect(h.log.commits).toEqual([]);
    expect(routeOf(h, id)).toBeUndefined();
  });

  it("ROU-03c First and last segments are not draggable", () => {
    const { h } = setup({});
    h.down({ x: 80, y: 10 });
    expect(h.router.activeTool).toBe("select-move");
    h.up({ x: 80, y: 10 });
    h.down({ x: 160, y: 90 });
    expect(h.router.activeTool).toBe("select-move");
  });
});

describe("ROU-03d route-edit tool: double-click", () => {
  const click = (h: ToolHarness) => {
    h.down({ x: 100, y: 50 });
    h.up({ x: 100, y: 50 });
  };

  it("ROU-03d two presses within doubleClickMs on a pinned handle free it", () => {
    const { h, id } = setup({ route: [V(100)] });
    click(h);
    expect(h.log.commits).toEqual([]);
    click(h);
    expect(h.log.commits).toEqual([
      { kind: "setRoute", connection: id, route: [] },
    ]);
    expect(routeOf(h, id)).toBeUndefined();
  });

  it("ROU-03d two slow presses do not", () => {
    const { h, id } = setup({
      route: [V(100)],
      options: { doubleClickMs: 1 },
    });
    click(h);
    click(h);
    expect(h.log.commits).toEqual([]);
    expect(routeOf(h, id)).toEqual([V(100)]);
  });

  it("ROU-03d a double-click on a free handle does nothing", () => {
    const { h, id } = setup({});
    h.down({ x: 120, y: 50 });
    h.up({ x: 120, y: 50 });
    h.down({ x: 120, y: 50 });
    h.up({ x: 120, y: 50 });
    expect(h.log.commits).toEqual([]);
    expect(routeOf(h, id)).toBeUndefined();
  });

  it("ROU-03d a drag between the presses breaks the double-click", () => {
    const { h } = setup({ route: [V(100)] });
    click(h);
    h.down({ x: 100, y: 50 });
    h.move({ x: 110, y: 50 });
    h.up({ x: 110, y: 50 });
    expect(h.log.commits).toHaveLength(1);
    expect(h.log.commits[0]).toMatchObject({ route: [V(110)] });
  });
});
