import { describe, expect, it } from "vitest";
import { nodeId } from "../../../core/index.js";
import { paintMarquee } from "../../render/paint/previews/marquee-painter.js";
import {
  cornerNode,
  createToolHarness,
} from "../../test-support/tool-harness.js";
import { fakeContext, testFrame } from "../../test-support.js";
import { nodeKey } from "../selection/selection-model.js";
import type { ToolPreview } from "./tool-types.js";

const fixture = () =>
  createToolHarness({
    nodes: [
      cornerNode("a", 0, 0),
      cornerNode("b", 100, 0),
      cornerNode("c", 200, 0),
    ],
    connections: [["c1", "a", "aR", "b", "bL"]],
  });

const nodesOf = (h: ReturnType<typeof fixture>) =>
  h.selection.nodeIds().map(String);

describe("marquee tool", () => {
  it("INT-02 left-to-right selects only fully covered entities", () => {
    const h = fixture();
    h.down({ x: -10, y: -10 });
    h.move({ x: 130, y: 50 });
    expect(h.log.previews.at(-1)).toMatchObject({
      kind: "marquee",
      mode: "contain",
    });
    h.up({ x: 130, y: 50 });
    // b is only partly covered; the connection between a and b is fully inside.
    expect(nodesOf(h)).toEqual(["a"]);
    expect(h.selection.connectionIds().map(String)).toEqual(["c1"]);
    expect(h.log.previews.at(-1)).toBeNull();
    expect(h.log.commits).toEqual([]);
  });

  it("INT-02 right-to-left also selects partially covered entities", () => {
    const h = fixture();
    h.down({ x: 130, y: 50 });
    h.move({ x: -10, y: -10 });
    expect(h.log.previews.at(-1)).toMatchObject({ mode: "intersect" });
    h.up({ x: -10, y: -10 });
    expect(nodesOf(h)).toEqual(["a", "b"]);
  });

  it("INT-02 the marquee option overrides the direction convention", () => {
    const h = createToolHarness({
      nodes: [cornerNode("a", 0, 0), cornerNode("b", 100, 0)],
      options: { marquee: "intersect" },
    });
    h.down({ x: -10, y: -10 });
    h.move({ x: 130, y: 50 });
    h.up({ x: 130, y: 50 });
    expect(nodesOf(h)).toEqual(["a", "b"]);
  });

  it("INT-02 Shift adds, Mod toggles, and a plain marquee replaces", () => {
    const h = fixture();
    h.selection.replace([nodeKey(nodeId("c"))]);
    h.down({ x: -10, y: -10 }, { modifiers: { shift: true } });
    h.move({ x: 50, y: 50 }, { modifiers: { shift: true } });
    h.up({ x: 50, y: 50 }, { modifiers: { shift: true } });
    expect(nodesOf(h)).toEqual(["c", "a"]);
    h.down({ x: -10, y: -10 }, { modifiers: { mod: true } });
    h.move({ x: 50, y: 50 }, { modifiers: { mod: true } });
    h.up({ x: 50, y: 50 }, { modifiers: { mod: true } });
    expect(nodesOf(h)).toEqual(["c"]);
    h.down({ x: -10, y: -10 });
    h.move({ x: 50, y: 50 });
    h.up({ x: 50, y: 50 });
    expect(nodesOf(h)).toEqual(["a"]);
  });

  it("INT-02 clicking empty canvas clears; with Shift it keeps the selection", () => {
    const h = fixture();
    h.selection.replace([nodeKey(nodeId("a"))]);
    h.down({ x: 500, y: 500 }, { modifiers: { shift: true } });
    h.up({ x: 500, y: 500 }, { modifiers: { shift: true } });
    expect(h.selection.size).toBe(1);
    h.down({ x: 500, y: 500 });
    h.up({ x: 500, y: 500 });
    expect(h.selection.size).toBe(0);
  });

  it("INT-05 cancelling a marquee leaves the selection alone", () => {
    const h = fixture();
    h.selection.replace([nodeKey(nodeId("c"))]);
    h.down({ x: -10, y: -10 });
    h.move({ x: 50, y: 50 });
    h.send({ type: "cancel", reason: "escape" });
    expect(nodesOf(h)).toEqual(["c"]);
    expect(h.log.previews.at(-1)).toBeNull();
  });

  it("UX-02 containment paints a solid outline and intersection a dashed one", () => {
    const dashes = (mode: "contain" | "intersect"): number[][] => {
      const seen: number[][] = [];
      const { ctx } = fakeContext();
      const spy = new Proxy(ctx, {
        get(t, name: string) {
          if (name === "setLineDash") {
            return (d: number[]) => void seen.push(d);
          }
          return Reflect.get(t, name) as unknown;
        },
      });
      const preview: ToolPreview = {
        kind: "marquee",
        rect: { x: 0, y: 0, w: 50, h: 40 },
        mode,
      };
      paintMarquee(spy, testFrame(), preview);
      return seen;
    };
    expect(dashes("contain").at(0)).toEqual([]);
    expect(dashes("intersect").at(0)?.length).toBeGreaterThan(0);
  });
});
