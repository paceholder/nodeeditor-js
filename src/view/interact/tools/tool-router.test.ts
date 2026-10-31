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
  it("INT-05a one active tool, back to idle after commit", () => {
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

  it("INT-05 foreign pointer IDs are ignored while a gesture runs", () => {
    const h = fixture();
    h.down({ x: 20, y: 10 });
    h.move({ x: 90, y: 10 }, { pointerId: 2 });
    h.up({ x: 90, y: 10 }, { pointerId: 2 });
    expect(h.router.activeTool).toBe("select-move");
    expect(h.log.previews).toEqual([]);
    expect(h.log.commits).toEqual([]);
  });

  it("INT-05 every cancellation source ends the gesture without a commit", () => {
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

  it("INT-05 Escape cancels the active gesture", () => {
    const h = fixture();
    h.down({ x: 20, y: 10 });
    h.move({ x: 80, y: 10 });
    const r = h.key("Escape");
    expect(r.handled).toBe(true);
    expect(h.router.activeTool).toBeUndefined();
    expect(h.log.commits).toEqual([]);
  });

  it("INT-04 right-button presses are not claimed (context menu keeps working)", () => {
    const h = fixture();
    const onNode = h.down({ x: 20, y: 10 }, { button: 2 });
    const onEmpty = h.down({ x: 500, y: 500 }, { button: 2 });
    expect(onNode.handled).toBe(false);
    expect(onEmpty.handled).toBe(false);
    expect(h.router.activeTool).toBeUndefined();
    expect(h.log.captures).toEqual([]);
  });

  it("INT-01 precedence: Space plus drag pans instead of selecting", () => {
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

  it("INT-05a a plain empty-canvas press pans; Shift or Mod starts the marquee; middle button pans", () => {
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

describe("INT-10, INT-04 resize and connect", () => {
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
