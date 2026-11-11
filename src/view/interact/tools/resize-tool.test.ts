import { describe, expect, it } from "vitest";
import {
  createNodeTypeRegistry,
  type NodeId,
  nodeId,
} from "../../../core/index.js";
import {
  createSnapshotToolHarness,
  recordOf,
} from "../../test-support/snapshot-tool-harness.js";
import {
  cornerNode,
  cornerOf,
  createToolHarness,
  type HarnessOptions,
} from "../../test-support/tool-harness.js";
import { nodeKey } from "../selection/selection-model.js";
import { resizeTool } from "./resize-tool.js";

const N = (id: string): NodeId => nodeId(id);

function resizableType(resizable = true) {
  const registry = createNodeTypeRegistry();
  registry.register({
    type: "t",
    label: "T",
    defaultSize: { width: 40, height: 20 },
    ...(resizable ? { capabilities: { resize: true } } : {}),
    sizeLimits: { min: { width: 10, height: 10 } },
  });
  return registry;
}

/** Two 40 x 20 nodes of fixture type `t`; `resizable` opts the type in. */
function fixture(resizable = true, extra: HarnessOptions = {}) {
  const registry = resizableType(resizable);
  return createToolHarness({
    nodes: [cornerNode("a", 0, 0), cornerNode("b", 200, 0)],
    modelOptions: { registry },
    ...extra,
  });
}

const sizeOf = (
  h: { model: ReturnType<typeof fixture>["model"] },
  id: string,
) => h.model.reader.getNode(N(id))?.size;

describe("resize tool", () => {
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

  it("an external change of the resized node cancels; changes of other nodes do not", () => {
    const h = fixture();
    h.selection.replace([nodeKey(N("a"))]);
    h.down({ x: 38, y: 18 });
    h.move({ x: 60, y: 30 });
    expect(resizeTool.involved?.({ kind: "idle" })).toEqual([]);
    h.change({ removed: [], changed: ["b"], origin: "external" });
    h.change({ removed: [], changed: ["b"], origin: "local" });
    expect(h.router.activeTool).toBe("resize");
    expect(h.cancellations).toEqual([]);
    h.change({ removed: [], changed: ["a"], origin: "external" });
    expect(h.router.activeTool).toBeUndefined();
    expect(h.cancellations).toEqual([
      { reason: "external-change", ids: ["a"] },
    ]);
    expect(h.log.previews.at(-1)).toBeNull();
    expect(h.log.commits).toEqual([]);
  });

  it("removal of the node discards the preview", () => {
    const h = fixture();
    h.selection.replace([nodeKey(N("a"))]);
    h.down({ x: 38, y: 18 });
    h.move({ x: 60, y: 30 });
    h.model.execute({ kind: "deleteEntities", nodes: [N("a")] });
    expect(h.router.activeTool).toBeUndefined();
    expect(h.cancellations).toEqual([{ reason: "entity-removed", ids: ["a"] }]);
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

describe("resize tool: changes to involved entities from a host-owned document", () => {
  /** Node a selected, its bottom-right handle at (38, 18). */
  const hosted = () => {
    const h = createSnapshotToolHarness({
      nodes: [cornerNode("a", 0, 0), cornerNode("b", 200, 0)],
      modelOptions: { registry: resizableType() },
    });
    h.selection.replace([nodeKey(N("a"))]);
    return h;
  };

  it("a push removing the resized node cancels with entity-removed and submits nothing", () => {
    const h = hosted();
    h.down({ x: 38, y: 18 });
    h.move({ x: 60, y: 30 });
    h.push((s) => {
      s.nodes = s.nodes.filter((n) => n.id !== "a");
    });
    expect(h.cancellations).toEqual([{ reason: "entity-removed", ids: ["a"] }]);
    h.up({ x: 60, y: 30 });
    expect(h.host.calls).toEqual([]);
  });

  it("a push changing the resized node cancels with external-change", () => {
    const h = hosted();
    h.down({ x: 38, y: 18 });
    h.move({ x: 60, y: 30 });
    h.push((s) => {
      recordOf(s.nodes, "a").title = "Renamed";
    });
    expect(h.cancellations).toEqual([
      { reason: "external-change", ids: ["a"] },
    ]);
    h.up({ x: 60, y: 30 });
    expect(h.host.calls).toEqual([]);
  });

  it("a rollback after the host rejects an edit of the resized node cancels with external-change", async () => {
    const h = hosted();
    h.model.execute({
      kind: "moveNodes",
      moves: [{ node: N("a"), position: { x: 20, y: 50 } }],
    });
    h.down({ x: 38, y: 58 });
    h.move({ x: 60, y: 70 });
    expect(h.router.activeTool).toBe("resize");
    await h.answer(0, "rejected");
    expect(h.cancellations).toEqual([
      { reason: "external-change", ids: ["a"] },
    ]);
    h.up({ x: 60, y: 70 });
    expect(h.host.calls).toHaveLength(1);
  });

  it("an unrelated push does not cancel; the release submits one resize", () => {
    const h = hosted();
    h.down({ x: 38, y: 18 });
    h.move({ x: 78, y: 38 });
    h.push((s) => {
      recordOf(s.nodes, "b").title = "Renamed";
    });
    h.up({ x: 78, y: 38 });
    expect(h.cancellations).toEqual([]);
    expect(h.host.calls).toHaveLength(1);
    expect(sizeOf(h, "a")).toEqual({ width: 80, height: 40 });
  });
});
