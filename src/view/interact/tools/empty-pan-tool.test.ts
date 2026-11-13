import { describe, expect, it } from "vitest";
import { nodeId, viewportToWorld } from "../../../core/index.js";
import {
  cornerNode,
  createToolHarness,
} from "../../test-support/tool-harness.js";
import { nodeKey } from "../selection/selection-model.js";
import type { ToolOptionsInput } from "./thresholds.js";
import { type Modifiers, NO_MODIFIERS } from "./tool-types.js";

type Harness = ReturnType<typeof createToolHarness>;

/** Pointer input at a fixed screen position, so panning does not move the pointer. */
const at =
  (type: "pointer-down" | "pointer-move" | "pointer-up") =>
  (h: Harness, x: number, y: number, mods: Partial<Modifiers> = {}) =>
    h.send({
      type,
      pointerId: 1,
      button: 0,
      viewport: { x, y },
      world: viewportToWorld(h.viewport(), { x, y }),
      modifiers: { ...NO_MODIFIERS, ...mods },
      time: 0,
    });
const down = at("pointer-down");
const move = at("pointer-move");
const up = at("pointer-up");

const fixture = (options: ToolOptionsInput = {}) =>
  createToolHarness({ nodes: [cornerNode("a", 0, 0)], options });

describe("empty-canvas pan", () => {
  it("a plain drag on empty canvas pans and leaves model and selection alone", () => {
    const h = fixture();
    const rev = h.model.reader.revision();
    h.selection.replace([nodeKey(nodeId("a"))]);
    down(h, 300, 300);
    expect(h.router.activeTool).toBe("empty-pan");
    move(h, 302, 301);
    // Below the drag threshold nothing pans yet.
    expect(h.viewport()).toMatchObject({ panX: 0, panY: 0 });
    move(h, 320, 290);
    move(h, 340, 280);
    up(h, 340, 280);
    expect(h.viewport()).toMatchObject({ panX: 40, panY: -20 });
    expect(h.model.reader.revision()).toBe(rev);
    expect(h.selection.keys()).toEqual(["n:a"]);
    expect(h.log.cursors).toEqual(["grabbing", "default"]);
    expect(h.router.activeTool).toBeUndefined();
  });

  it("a click on empty canvas still clears the selection", () => {
    const h = fixture();
    h.selection.replace([nodeKey(nodeId("a"))]);
    down(h, 300, 300);
    move(h, 301, 301);
    up(h, 301, 301);
    expect(h.selection.keys()).toEqual([]);
    expect(h.viewport()).toMatchObject({ panX: 0, panY: 0 });
  });

  it("Shift or Mod on empty canvas starts the marquee instead", () => {
    const h = fixture();
    down(h, -10, -10, { shift: true });
    expect(h.router.activeTool).toBe("marquee");
    move(h, 50, 50, { shift: true });
    up(h, 50, 50, { shift: true });
    expect(h.selection.keys()).toEqual(["n:a"]);
    expect(h.viewport()).toMatchObject({ panX: 0, panY: 0 });
  });

  it("a press on a node still selects and moves it", () => {
    const h = fixture();
    down(h, 20, 10);
    expect(h.router.activeTool).toBe("select-move");
  });

  it("cancel keeps the pan already applied and ends the gesture", () => {
    const h = fixture();
    down(h, 300, 300);
    move(h, 320, 300);
    h.send({ type: "cancel", reason: "escape" });
    expect(h.viewport()).toMatchObject({ panX: 20, panY: 0 });
    expect(h.router.activeTool).toBeUndefined();
  });

  it("emptyDrag marquee restores the plain-drag marquee", () => {
    const h = fixture({ emptyDrag: "marquee" });
    down(h, 300, 300);
    expect(h.router.activeTool).toBe("marquee");
  });
});
