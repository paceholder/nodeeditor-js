import { describe, expect, it } from "vitest";
import { createNodeTypeRegistry, nodeId } from "../../../core/index.js";
import {
  cornerNode,
  cornerOf,
  createToolHarness,
} from "../../test-support/tool-harness.js";
import { nodeKey } from "../selection/selection-model.js";

const fixture = () =>
  createToolHarness({
    nodes: [cornerNode("a", 0, 0), cornerNode("b", 200, 0)],
  });

describe("lost pointer release", () => {
  it("a move of the dragging mouse with no button held cancels the drag and submits nothing", () => {
    const h = fixture();
    h.down({ x: 20, y: 10 }, { pointerType: "mouse", buttons: 1 });
    h.move({ x: 60, y: 10 }, { pointerType: "mouse", buttons: 1 });
    expect(h.router.activeTool).toBe("select-move");
    // The mouse-up was lost (a native menu swallowed it): the button is no longer held.
    const result = h.move(
      { x: 90, y: 10 },
      { pointerType: "mouse", buttons: 0 },
    );
    expect(result.handled).toBe(true);
    expect(h.router.activeTool).toBeUndefined();
    expect(h.log.previews.at(-1)).toBeNull();
    // The next click does not commit the old drag.
    h.down({ x: 220, y: 10 }, { pointerType: "mouse", buttons: 1 });
    h.up({ x: 220, y: 10 }, { pointerType: "mouse", buttons: 0 });
    expect(h.log.commits).toEqual([]);
    expect(cornerOf(h, "a")).toEqual({ x: 0, y: 0 });
  });

  it("an undragged press is cancelled the same way", () => {
    const h = fixture();
    h.down({ x: 20, y: 10 }, { pointerType: "mouse", buttons: 1 });
    h.move({ x: 21, y: 10 }, { pointerType: "mouse", buttons: 0 });
    expect(h.router.activeTool).toBeUndefined();
    expect(h.log.commits).toEqual([]);
  });

  it("a middle-button pan ends when the middle button is no longer held", () => {
    const h = fixture();
    h.down({ x: 100, y: 100 }, { pointerType: "mouse", button: 1, buttons: 4 });
    expect(h.router.activeTool).toBeDefined();
    // Another button held is not the gesture's button.
    h.move({ x: 120, y: 100 }, { pointerType: "mouse", buttons: 1 });
    expect(h.router.activeTool).toBeUndefined();
  });

  it("moves that still hold the button, or carry no button state, keep the gesture", () => {
    const h = fixture();
    h.down({ x: 20, y: 10 }, { pointerType: "mouse", buttons: 1 });
    h.move({ x: 60, y: 10 }, { pointerType: "mouse", buttons: 3 });
    h.move({ x: 70, y: 10 });
    expect(h.router.activeTool).toBe("select-move");
    h.up({ x: 70, y: 10 }, { pointerType: "mouse", buttons: 0 });
    expect(h.log.commits).toHaveLength(1);
  });
});

describe("gestures yield to any change of their entities", () => {
  it("an undo that moves the dragged node cancels the drag and the undo's position stays", () => {
    const h = fixture();
    h.down({ x: 20, y: 10 });
    h.move({ x: 60, y: 10 });
    h.up({ x: 60, y: 10 });
    expect(cornerOf(h, "a")).toEqual({ x: 40, y: 0 });
    // A new drag of a, and an undo (a toolbar button, a host call) while it runs.
    h.down({ x: 60, y: 10 });
    h.move({ x: 120, y: 10 });
    h.model.undo();
    expect(h.router.activeTool).toBeUndefined();
    expect(h.cancellations).toEqual([{ reason: "entity-changed", ids: ["a"] }]);
    h.up({ x: 120, y: 10 });
    expect(h.log.commits).toHaveLength(1);
    expect(cornerOf(h, "a")).toEqual({ x: 0, y: 0 });
  });

  it("a local host edit of the resized node cancels the resize and keeps the host's size", () => {
    const registry = createNodeTypeRegistry();
    registry.register({
      type: "t",
      label: "T",
      defaultSize: { width: 40, height: 20 },
      capabilities: { resize: true },
    });
    const h = createToolHarness({
      nodes: [cornerNode("a", 0, 0)],
      modelOptions: { registry },
    });
    h.selection.replace([nodeKey(nodeId("a"))]);
    h.down({ x: 38, y: 18 });
    h.move({ x: 60, y: 30 });
    expect(h.router.activeTool).toBe("resize");
    const host = h.model.execute({
      kind: "resizeNode",
      node: nodeId("a"),
      size: { width: 80, height: 50 },
    });
    expect(host.status).toBe("accepted");
    expect(h.router.activeTool).toBeUndefined();
    expect(h.cancellations).toEqual([{ reason: "entity-changed", ids: ["a"] }]);
    h.up({ x: 60, y: 30 });
    expect(h.model.reader.getNode(nodeId("a"))?.size).toEqual({
      width: 80,
      height: 50,
    });
  });

  it("a change of another node leaves the drag running", () => {
    const h = fixture();
    h.down({ x: 20, y: 10 });
    h.move({ x: 60, y: 10 });
    h.change({ removed: [], changed: ["b"], origin: "undo" });
    expect(h.router.activeTool).toBe("select-move");
    h.up({ x: 60, y: 10 });
    expect(h.log.commits).toHaveLength(1);
  });
});
