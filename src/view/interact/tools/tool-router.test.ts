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

describe("tool router", () => {
  it("one active tool, back to idle after commit", () => {
    const h = fixture();
    expect(h.router.activeTool).toBeUndefined();
    h.down({ x: 20, y: 10 });
    expect(h.router.activeTool).toBe("select-move");
    expect(h.log.captures).toEqual([1]);
    h.move({ x: 30, y: 10 });
    h.move({ x: 60, y: 10 });
    // A second pointer cannot start another gesture.
    h.down({ x: 220, y: 10 }, { pointerId: 2 });
    expect(h.router.activeTool).toBe("select-move");
    expect(h.router.activePointer).toBe(1);
    h.up({ x: 60, y: 10 });
    expect(h.router.activeTool).toBeUndefined();
    expect(h.log.releases).toEqual([1]);
    expect(h.log.commits).toHaveLength(1);
    expect(cornerOf(h, "a")).toEqual({
      x: 40,
      y: 0,
    });
  });

  it("foreign pointer IDs are ignored while a gesture runs", () => {
    const h = fixture();
    h.down({ x: 20, y: 10 });
    h.move({ x: 90, y: 10 }, { pointerId: 2 });
    h.up({ x: 90, y: 10 }, { pointerId: 2 });
    expect(h.router.activeTool).toBe("select-move");
    expect(h.log.previews).toEqual([]);
    expect(h.log.commits).toEqual([]);
  });

  it("every cancellation source ends the gesture without a commit", () => {
    for (const reason of [
      "pointercancel",
      "lost-capture",
      "escape",
      "blur",
      "hidden",
      "dispose",
    ] as const) {
      const h = fixture();
      const rev = h.model.reader.revision();
      h.down({ x: 20, y: 10 });
      h.move({ x: 80, y: 10 });
      h.send({ type: "cancel", reason });
      expect(h.router.activeTool).toBeUndefined();
      expect(h.log.previews.at(-1)).toBeNull();
      expect(h.log.releases).toEqual([1]);
      expect(h.log.commits).toEqual([]);
      expect(h.model.reader.revision()).toBe(rev);
    }
  });

  it("a context menu cancels a pressed gesture: no select, no commit", () => {
    // Select-move: a press inside a two-node selection would select only `a` on release.
    const h = fixture();
    const keys = [nodeKey(nodeId("a")), nodeKey(nodeId("b"))];
    h.selection.replace(keys);
    h.down({ x: 20, y: 10 });
    h.send({ type: "cancel", reason: "context-menu" });
    h.up({ x: 20, y: 10 });
    expect(h.router.activeTool).toBeUndefined();
    expect(h.selection.keys()).toEqual(keys);
    expect(h.log.releases).toEqual([1]);
    expect(h.log.commits).toEqual([]);
    // Connect, from b's left port: pressed, not yet dragging.
    h.down({ x: 200, y: 10 });
    expect(h.router.activeTool).toBe("connect");
    h.send({ type: "cancel", reason: "context-menu" });
    h.up({ x: 20, y: 10 });
    expect(h.router.activeTool).toBeUndefined();
    expect(h.log.releases).toEqual([1, 1]);
    expect(h.log.commits).toEqual([]);
  });

  it("Escape cancels the active gesture", () => {
    const h = fixture();
    h.down({ x: 20, y: 10 });
    h.move({ x: 80, y: 10 });
    const r = h.key("Escape");
    expect(r.handled).toBe(true);
    expect(h.router.activeTool).toBeUndefined();
    expect(h.log.commits).toEqual([]);
  });

  it("right-button presses are not claimed (context menu keeps working)", () => {
    const h = fixture();
    const onNode = h.down({ x: 20, y: 10 }, { button: 2 });
    const onEmpty = h.down({ x: 500, y: 500 }, { button: 2 });
    expect(onNode.handled).toBe(false);
    expect(onEmpty.handled).toBe(false);
    expect(h.router.activeTool).toBeUndefined();
    expect(h.log.captures).toEqual([]);
  });

  it("precedence: Space plus drag pans instead of selecting", () => {
    const h = fixture();
    h.key(" ");
    h.down({ x: 20, y: 10 });
    expect(h.router.activeTool).toBe("pan");
    h.key(" ", "key-up");
    expect(h.router.spaceHeld).toBe(false);
    h.up({ x: 20, y: 10 });
    h.down({ x: 20, y: 10 });
    expect(h.router.activeTool).toBe("select-move");
  });

  it("a plain empty-canvas press pans; Shift or Mod starts the marquee; middle button pans", () => {
    const h = fixture();
    h.down({ x: 500, y: 500 });
    expect(h.router.activeTool).toBe("empty-pan");
    h.up({ x: 500, y: 500 });
    h.down({ x: 500, y: 500 }, { modifiers: { shift: true } });
    expect(h.router.activeTool).toBe("marquee");
    h.up({ x: 500, y: 500 });
    h.down({ x: 500, y: 500 }, { modifiers: { mod: true } });
    expect(h.router.activeTool).toBe("marquee");
    h.up({ x: 500, y: 500 });
    h.down({ x: 20, y: 10 }, { button: 1 });
    expect(h.router.activeTool).toBe("pan");
  });
});

describe("the router ends a gesture whose entities changed", () => {
  const drag = () => {
    const h = fixture();
    h.down({ x: 20, y: 10 });
    h.move({ x: 60, y: 10 });
    return h;
  };

  it("an unrelated change keeps the gesture and its commit", () => {
    const h = drag();
    h.change({ removed: [], changed: ["b"], origin: "external" });
    h.model.execute({ kind: "deleteEntities", nodes: [nodeId("b")] });
    expect(h.router.activeTool).toBe("select-move");
    expect(h.cancellations).toEqual([]);
    h.up({ x: 60, y: 10 });
    expect(h.log.commits).toHaveLength(1);
  });

  it("removal of an involved entity cancels from any origin and commits nothing", () => {
    for (const origin of ["local", "undo", "redo", "external"] as const) {
      const h = drag();
      h.change({ removed: ["a"], changed: ["a"], origin });
      expect(h.router.activeTool).toBeUndefined();
      expect(h.cancellations).toEqual([
        { reason: "entity-removed", ids: ["a"] },
      ]);
      expect(h.log.commits).toEqual([]);
      expect(h.log.previews.at(-1)).toBeNull();
      expect(h.log.releases).toEqual([1]);
    }
  });

  it("a real removal from the model cancels the same way", () => {
    const h = drag();
    h.model.execute({ kind: "deleteEntities", nodes: [nodeId("a")] });
    expect(h.router.activeTool).toBeUndefined();
    expect(h.cancellations).toEqual([{ reason: "entity-removed", ids: ["a"] }]);
  });

  it("a change of an involved entity cancels whatever its origin, naming an external one", () => {
    for (const [origin, reason] of [
      ["external", "external-change"],
      ["local", "entity-changed"],
      ["undo", "entity-changed"],
      ["redo", "entity-changed"],
    ] as const) {
      const h = drag();
      h.change({ removed: [], changed: ["a"], origin });
      expect(h.router.activeTool).toBeUndefined();
      expect(h.cancellations).toEqual([{ reason, ids: ["a"] }]);
      expect(h.log.commits).toEqual([]);
    }
  });

  it("a change committed by the gesture itself never cancels it", () => {
    const h = drag();
    h.up({ x: 60, y: 10 });
    expect(h.log.commits).toHaveLength(1);
    expect(h.cancellations).toEqual([]);
  });

  it("a pan involves nothing: changes during it leave it running", () => {
    const h = fixture();
    h.down({ x: 500, y: 500 });
    expect(h.router.activeTool).toBe("empty-pan");
    h.change({ removed: ["a"], changed: ["a"], origin: "external" });
    expect(h.router.activeTool).toBe("empty-pan");
    expect(h.cancellations).toEqual([]);
  });
});

describe("the verdict input", () => {
  it("a verdict leaves a move, a pan, a marquee and an idle router as they are", () => {
    const h = fixture();
    expect(h.send({ type: "verdict" }).handled).toBe(false);
    h.down({ x: 20, y: 10 });
    h.move({ x: 60, y: 10 });
    const before = h.log.previews.length;
    h.send({ type: "verdict" });
    expect(h.router.activeTool).toBe("select-move");
    expect(h.log.previews).toHaveLength(before);
    h.up({ x: 60, y: 10 });
    expect(h.log.commits).toHaveLength(1);

    h.down({ x: 500, y: 500 });
    h.send({ type: "verdict" });
    expect(h.router.activeTool).toBe("empty-pan");
    h.up({ x: 500, y: 500 });
    h.down({ x: 500, y: 500 }, { modifiers: { shift: true } });
    h.send({ type: "verdict" });
    expect(h.router.activeTool).toBe("marquee");
  });
});

describe("resize and connect", () => {
  /** Node `a` has a port on its bottom-right corner, right under the handle. */
  const cornerPort = () => {
    const registry = createNodeTypeRegistry();
    registry.register({
      type: "t",
      label: "T",
      defaultSize: { width: 40, height: 20 },
      capabilities: { resize: true },
    });
    const h = createToolHarness({
      modelOptions: { registry },
      nodes: [
        {
          id: "a",
          x: 20,
          y: 10,
          ports: [{ id: "aC", placement: { x: 1, y: 1 } }],
        },
        cornerNode("b", 200, 0),
      ],
    });
    h.selection.replace([nodeKey(nodeId("a"))]);
    return h;
  };

  it("Resize and connect are exclusive: the handle resizes, the rest of the port connects", () => {
    const h = cornerPort();
    // Inside the 8 px square: the port's capture circle also covers this point.
    h.down({ x: 37, y: 17 });
    expect(h.router.activeTool).toBe("resize");
    h.move({ x: 50, y: 30 });
    h.up({ x: 50, y: 30 });
    expect(h.log.commits.map((c) => c.kind)).toEqual(["resizeNode"]);

    const g = cornerPort();
    // Outside the square, still within the port's capture radius.
    g.down({ x: 43, y: 23 });
    expect(g.router.activeTool).toBe("connect");
    g.move({ x: 100, y: 60 });
    g.send({ type: "cancel", reason: "escape" });
    expect(g.log.commits).toEqual([]);
  });
});

describe("which gestures auto-pan", () => {
  it("node, connection, marquee and resize drags do; their idle and pressed states do not", () => {
    const h = createToolHarness({
      modelOptions: {
        capabilityPolicy: {
          decide: (a) => (a === "resize" ? true : undefined),
        },
      },
      nodes: [cornerNode("a", 0, 0), cornerNode("b", 200, 0)],
    });
    expect(h.router.autoPanning()).toBe(false);
    // select-move
    h.down({ x: 20, y: 10 });
    expect(h.router.autoPanning()).toBe(false);
    h.move({ x: 60, y: 10 });
    expect(h.router.autoPanning()).toBe(true);
    h.up({ x: 60, y: 10 });
    expect(h.router.autoPanning()).toBe(false);
    // connect, from b's left port at (200, 10)
    h.down({ x: 200, y: 10 });
    expect(h.router.activeTool).toBe("connect");
    h.move({ x: 150, y: 80 });
    expect(h.router.autoPanning()).toBe(true);
    h.key("Escape");
    // marquee (Shift on empty canvas)
    h.down({ x: 100, y: 200 }, { modifiers: { shift: true } });
    expect(h.router.activeTool).toBe("marquee");
    expect(h.router.autoPanning()).toBe(false);
    h.move({ x: 150, y: 260 }, { modifiers: { shift: true } });
    expect(h.router.autoPanning()).toBe(true);
    h.up({ x: 150, y: 260 }, { modifiers: { shift: true } });
    // resize: a is selected alone after the move above; its handle is at the corner
    h.selection.replace([nodeKey(nodeId("a"))]);
    const corner = h.scene.node(nodeId("a"))?.bodyBounds;
    if (!corner) throw new Error("no node");
    const at = { x: corner.x + corner.w - 2, y: corner.y + corner.h - 2 };
    h.down(at);
    expect(h.router.activeTool).toBe("resize");
    h.move({ x: at.x + 20, y: at.y + 20 });
    expect(h.router.autoPanning()).toBe(true);
    h.up({ x: at.x + 20, y: at.y + 20 });
    expect(h.router.autoPanning()).toBe(false);
  });

  it("Pan gestures do not auto-pan: middle button, Space and empty-canvas drags", () => {
    const h = fixture();
    h.down({ x: 500, y: 500 }, { button: 1 });
    h.move({ x: 600, y: 600 }, { button: 1 });
    expect(h.router.activeTool).toBe("pan");
    expect(h.router.autoPanning()).toBe(false);
    h.up({ x: 600, y: 600 }, { button: 1 });
    h.down({ x: 500, y: 500 });
    h.move({ x: 600, y: 600 });
    expect(h.router.activeTool).toBe("empty-pan");
    expect(h.router.autoPanning()).toBe(false);
    h.up({ x: 600, y: 600 });
  });
});
