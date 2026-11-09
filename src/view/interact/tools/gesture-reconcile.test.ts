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
