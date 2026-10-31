import { describe, expect, it } from "vitest";
import {
  createNodeTypeRegistry,
  type NodeId,
  nodeId,
} from "../../../core/index.js";
import {
  cornerNode,
  cornerOf,
  createToolHarness,
  type HarnessOptions,
} from "../../test-support/tool-harness.js";
import { nodeKey } from "../selection/selection-model.js";

const N = (id: string): NodeId => nodeId(id);

/** Two 40 x 20 nodes of fixture type `t`; `resizable` opts the type in. */
function fixture(resizable = true, extra: HarnessOptions = {}) {
  const registry = createNodeTypeRegistry();
  registry.register({
    type: "t",
    label: "T",
    defaultSize: { width: 40, height: 20 },
    ...(resizable ? { capabilities: { resize: true } } : {}),
    sizeLimits: { min: { width: 10, height: 10 } },
  });
  return createToolHarness({
    nodes: [cornerNode("a", 0, 0), cornerNode("b", 200, 0)],
    modelOptions: { registry },
    ...extra,
  });
}

const sizeOf = (h: ReturnType<typeof fixture>, id: string) =>
  h.model.reader.getNode(N(id))?.size;

describe("INT-05, INT-05a, INT-08, INT-10 resize tool", () => {
  it("idle, pressed, dragging, idle: one commit over 100 moves", () => {
    const h = fixture();
    h.selection.replace([nodeKey(N("a"))]);
    h.down({ x: 38, y: 18 });
    expect(h.router.activeTool).toBe("resize");
    expect(h.log.cursors).toEqual(["nwse-resize"]);
    for (let i = 1; i <= 100; i++) h.move({ x: 38 + i * 0.4, y: 18 + i * 0.2 });
    expect(h.log.commits).toEqual([]);
    expect(h.log.previews.at(-1)).toMatchObject({
      kind: "resize",
      size: { width: 80, height: 40 },
    });
    h.up({ x: 78, y: 38 });
    expect(h.router.activeTool).toBeUndefined();
    expect(h.log.commits).toEqual([
      {
        kind: "resizeNode",
        node: N("a"),
        size: { width: 80, height: 40 },
        fixed: { x: -1, y: -1 },
      },
    ]);
    expect(h.log.submits[0]?.status).toBe("accepted");
    expect(h.log.previews.at(-1)).toBeNull();
    expect(sizeOf(h, "a")).toEqual({ width: 80, height: 40 });
    // The top-left corner stayed.
    expect(h.model.reader.getNode(N("a"))?.position).toEqual({ x: 40, y: 20 });
    expect(h.model.historyState().undoLabel).toBe("Resize");
  });

  it("a press below the threshold commits nothing and keeps the selection", () => {
    const h = fixture();
    h.selection.replace([nodeKey(N("a"))]);
    h.down({ x: 38, y: 18 });
    h.move({ x: 39, y: 19 });
    h.up({ x: 39, y: 19 });
    expect(h.log.commits).toEqual([]);
    expect(h.log.previews).toEqual([]);
    expect(h.selection.keys()).toEqual([nodeKey(N("a"))]);
  });

  it("Cancel a resize: Escape or lost capture discard the preview", () => {
    for (const cancel of ["escape", "lost-capture"] as const) {
      const h = fixture();
      h.selection.replace([nodeKey(N("a"))]);
      h.down({ x: 38, y: 18 });
      h.move({ x: 60, y: 30 });
      if (cancel === "escape") h.key("Escape");
      else h.send({ type: "cancel", reason: "lost-capture" });
      expect(h.router.activeTool).toBeUndefined();
      expect(h.log.previews.at(-1)).toBeNull();
      h.up({ x: 60, y: 30 });
      expect(h.log.commits).toEqual([]);
      expect(sizeOf(h, "a")).toEqual({ width: 40, height: 20 });
      expect(cornerOf(h, "a")).toEqual({ x: 0, y: 0 });
    }
  });

  it("removal of the node discards the preview", () => {
    const h = fixture();
    h.selection.replace([nodeKey(N("a"))]);
    h.down({ x: 38, y: 18 });
    h.move({ x: 60, y: 30 });
    h.send({ type: "entities-removed", ids: ["a"] });
    expect(h.router.activeTool).toBeUndefined();
    expect(h.log.previews.at(-1)).toBeNull();
  });

  it("No handle for several nodes: a press on a corner starts a move", () => {
    const h = fixture();
    h.selection.replace([nodeKey(N("a")), nodeKey(N("b"))]);
    h.down({ x: 38, y: 18 });
    expect(h.router.activeTool).toBe("select-move");
    h.move({ x: 58, y: 18 });
    h.up({ x: 58, y: 18 });
    expect(h.log.commits[0]?.kind).toBe("moveNodes");
    expect(sizeOf(h, "a")).toEqual({ width: 40, height: 20 });
  });

  it("No handle without the capability: a press on the corner moves instead", () => {
    const h = fixture(false);
    h.selection.replace([nodeKey(N("a"))]);
    h.down({ x: 38, y: 18 });
    expect(h.router.activeTool).toBe("select-move");
  });

  it("a move-locked opted-in node resizes from its handle", () => {
    const h = fixture();
    h.model.submit({
      ops: [
        {
          op: "update",
          entity: "node",
          id: N("a"),
          fields: { capabilities: { new: { move: false } } },
        },
      ],
    });
    h.selection.replace([nodeKey(N("a"))]);
    h.down({ x: 38, y: 18 });
    h.move({ x: 58, y: 28 });
    h.up({ x: 58, y: 28 });
    expect(h.log.submits.map((s) => s.status)).toEqual(["accepted"]);
    expect(sizeOf(h, "a")).toEqual({ width: 60, height: 30 });
    // The top-left corner stayed at (0, 0).
    expect(h.model.reader.getNode(N("a"))?.position).toEqual({ x: 30, y: 15 });
  });
});
