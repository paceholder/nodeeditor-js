import { describe, expect, it } from "vitest";
import {
  cornerNode,
  cornerOf,
  createToolHarness,
} from "../../test-support/tool-harness.js";

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

  it("INT-05a empty canvas goes to the marquee tool; middle button pans", () => {
    const h = fixture();
    h.down({ x: 500, y: 500 });
    expect(h.router.activeTool).toBe("marquee");
    h.up({ x: 500, y: 500 });
    h.down({ x: 20, y: 10 }, { button: 1 });
    expect(h.router.activeTool).toBe("pan");
  });
});
