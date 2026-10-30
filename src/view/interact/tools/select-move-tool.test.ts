import { describe, expect, it } from "vitest";
import { type NodeId, nodeId } from "../../../core/index.js";
import {
  cornerNode,
  cornerOf,
  createToolHarness,
} from "../../test-support/tool-harness.js";
import { connectionKey, nodeKey } from "../selection/selection-model.js";

const N = (id: string): NodeId => nodeId(id);

const three = () =>
  createToolHarness({
    nodes: [
      cornerNode("a", 0, 0),
      cornerNode("b", 3, 100),
      cornerNode("c", 200, 0),
    ],
  });

function pos(h: ReturnType<typeof three>, id: string) {
  return cornerOf(h, id);
}

describe("select/move tool: selection", () => {
  it("INT-02, INT-05 a click below the threshold selects without committing a move", () => {
    const h = three();
    h.down({ x: 20, y: 10 });
    h.move({ x: 21, y: 11 });
    h.up({ x: 21, y: 11 });
    expect(h.selection.keys()).toEqual([nodeKey(N("a"))]);
    expect(h.log.commits).toEqual([]);
    expect(h.log.previews).toEqual([]);
    expect(pos(h, "a")).toEqual({ x: 0, y: 0 });
  });

  it("INT-02, INT-05 a node and a connection can be selected together with Shift", () => {
    const h = createToolHarness({
      nodes: [cornerNode("a", 0, 0), cornerNode("b", 200, 0)],
      connections: [["c1", "a", "aR", "b", "bL"]],
    });
    h.down({ x: 20, y: 10 });
    h.up({ x: 20, y: 10 });
    // Midpoint of the straight-looking connection between aR (40,10) and bL (200,10).
    h.down({ x: 120, y: 10 }, { modifiers: { shift: true } });
    h.up({ x: 120, y: 10 }, { modifiers: { shift: true } });
    expect(h.selection.keys()).toEqual([
      nodeKey(N("a")),
      connectionKey(h.model.reader.connections()[0]?.id as never),
    ]);
  });

  it("INT-02 Mod toggles and clicking inside a multi-selection narrows it on release", () => {
    const h = three();
    h.selection.replace([nodeKey(N("a")), nodeKey(N("c"))]);
    // Plain click on an already-selected item keeps the group for a drag...
    h.down({ x: 20, y: 10 });
    expect(h.selection.size).toBe(2);
    // ...and narrows to it when released without a drag.
    h.up({ x: 20, y: 10 });
    expect(h.selection.keys()).toEqual([nodeKey(N("a"))]);
    h.down({ x: 20, y: 10 }, { modifiers: { mod: true } });
    h.up({ x: 20, y: 10 }, { modifiers: { mod: true } });
    expect(h.selection.size).toBe(0);
    h.down({ x: 20, y: 10 }, { modifiers: { mod: true } });
    h.up({ x: 20, y: 10 }, { modifiers: { mod: true } });
    expect(h.selection.keys()).toEqual([nodeKey(N("a"))]);
  });

  it("INT-02 pressing an unselected node while others are selected replaces the selection", () => {
    const h = three();
    h.selection.replace([nodeKey(N("a")), nodeKey(N("b"))]);
    h.down({ x: 220, y: 10 });
    h.up({ x: 220, y: 10 });
    expect(h.selection.keys()).toEqual([nodeKey(N("c"))]);
  });
});

describe("select/move tool: move", () => {
  it("INT-03, INT-08 three nodes dragged 40 units move together in one committed command", () => {
    const h = three();
    h.selection.replace([nodeKey(N("a")), nodeKey(N("b")), nodeKey(N("c"))]);
    const before = h.model.reader.revision();
    h.down({ x: 20, y: 10 });
    for (let i = 1; i <= 200; i++) h.move({ x: 20 + (40 * i) / 200, y: 10 });
    // Moves inside the drag threshold produce no preview; the rest each produce one.
    expect(h.log.previews.length).toBeGreaterThan(150);
    // Previews never reach the model (D6).
    expect(h.model.reader.revision()).toBe(before);
    h.up({ x: 60, y: 10 });
    expect(h.log.commits).toHaveLength(1);
    expect(h.model.reader.revision()).toBe(before + 1);
    expect(pos(h, "a")).toEqual({ x: 40, y: 0 });
    expect(pos(h, "b")).toEqual({ x: 43, y: 100 });
    expect(pos(h, "c")).toEqual({ x: 240, y: 0 });
    // One history entry (the move) restores all three.
    h.model.undo();
    expect(pos(h, "a")).toEqual({ x: 0, y: 0 });
    expect(pos(h, "c")).toEqual({ x: 200, y: 0 });
  });

  it("INT-03 dragging an unselected node selects and moves just that node", () => {
    const h = three();
    h.selection.replace([nodeKey(N("c"))]);
    h.down({ x: 20, y: 10 });
    h.move({ x: 50, y: 10 });
    h.up({ x: 50, y: 10 });
    expect(h.selection.keys()).toEqual([nodeKey(N("a"))]);
    expect(pos(h, "a")).toEqual({ x: 30, y: 0 });
    expect(pos(h, "c")).toEqual({ x: 200, y: 0 });
  });

  it("INT-03 grid snapping moves the pressed node onto the grid; Alt suppresses it", () => {
    const h = createToolHarness({
      nodes: [cornerNode("a", 0, 0), cornerNode("b", 3, 100)],
      options: { gridStep: 10 },
    });
    h.selection.replace([nodeKey(N("a")), nodeKey(N("b"))]);
    h.down({ x: 20, y: 10 });
    h.move({ x: 63, y: 10 });
    h.up({ x: 63, y: 10 });
    expect(pos(h, "a")).toEqual({ x: 40, y: 0 });
    // Relative positions preserved: b follows by the same offset.
    expect(pos(h, "b")).toEqual({ x: 43, y: 100 });

    h.down({ x: 60, y: 10 });
    h.move({ x: 66, y: 10 }, { modifiers: { alt: true } });
    h.up({ x: 66, y: 10 }, { modifiers: { alt: true } });
    expect(pos(h, "a")).toEqual({ x: 46, y: 0 });
  });

  it("INT-03 a zero offset after snapping commits nothing", () => {
    const h = createToolHarness({
      nodes: [cornerNode("a", 0, 0)],
      options: { gridStep: 10 },
    });
    h.down({ x: 20, y: 10 });
    h.move({ x: 24, y: 10 });
    h.up({ x: 24, y: 10 });
    expect(h.log.commits).toEqual([]);
    expect(h.log.previews.at(-1)).toBeNull();
  });

  it("INT-05 cancel or a removed node mid-drag commits nothing", () => {
    const h = three();
    h.down({ x: 20, y: 10 });
    h.move({ x: 80, y: 10 });
    h.send({ type: "entities-removed", ids: ["c"] });
    expect(h.router.activeTool).toBe("select-move");
    h.send({ type: "entities-removed", ids: ["a"] });
    expect(h.router.activeTool).toBeUndefined();
    expect(h.log.commits).toEqual([]);
    expect(pos(h, "a")).toEqual({ x: 0, y: 0 });
  });

  it("INT-03, MOD-11 a mixed selection previews the locked node as not moving and commits only the rest", () => {
    const h = createToolHarness({
      nodes: [
        cornerNode("a", 0, 0),
        cornerNode("b", 100, 0),
        cornerNode("c", 200, 0),
      ],
      modelOptions: {
        capabilityPolicy: {
          decide: (action, node) =>
            action === "move" && node.id === "c" ? false : undefined,
        },
      },
    });
    h.selection.replace([nodeKey(N("a")), nodeKey(N("b")), nodeKey(N("c"))]);
    h.down({ x: 20, y: 10 });
    h.move({ x: 60, y: 10 });
    const preview = h.log.previews.at(-1);
    expect(preview).toMatchObject({
      kind: "move",
      offset: { x: 40, y: 0 },
      moving: ["a", "b"],
      locked: ["c"],
    });
    h.up({ x: 60, y: 10 });
    expect(h.log.commits).toHaveLength(1);
    expect(h.log.commits[0]).toMatchObject({
      kind: "moveNodes",
      moves: [{ node: "a" }, { node: "b" }],
    });
    expect(pos(h, "a")).toEqual({ x: 40, y: 0 });
    expect(pos(h, "c")).toEqual({ x: 200, y: 0 });
  });

  it("MOD-11 a locked-only selection previews no movement and commits nothing", () => {
    const h = createToolHarness({
      nodes: [cornerNode("a", 0, 0)],
      modelOptions: {
        capabilityPolicy: {
          decide: (action) => (action === "move" ? false : undefined),
        },
      },
    });
    h.down({ x: 20, y: 10 });
    h.move({ x: 60, y: 10 });
    expect(h.log.previews.at(-1)).toMatchObject({ moving: [], locked: ["a"] });
    h.up({ x: 60, y: 10 });
    expect(h.log.commits).toEqual([]);
  });

  it("INT-02 pressing a connection never starts a move", () => {
    const h = createToolHarness({
      nodes: [cornerNode("a", 0, 0), cornerNode("b", 200, 0)],
      connections: [["c1", "a", "aR", "b", "bL"]],
    });
    h.down({ x: 120, y: 10 });
    h.move({ x: 160, y: 60 });
    h.up({ x: 160, y: 60 });
    expect(h.log.commits).toEqual([]);
    expect(h.selection.size).toBe(1);
  });
});
