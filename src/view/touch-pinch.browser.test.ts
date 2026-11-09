/// <reference types="@vitest/browser-playwright" />
import { describe, expect, it } from "vitest";
import { nodeId } from "../core/index.js";
import { buildModel, twoPortNode } from "../core/space/scene/scene-fixtures.js";
import { cleanupScope, frames, makeHost } from "./browser-support.js";
import { mountView } from "./mount-view.js";
import type { ViewHandle } from "./view-types.js";

const cleanup = cleanupScope();

/**
 * A finger with its own pointer ID, driven at viewport points (CSS pixels from the root's
 * corner), so its motion does not depend on the zoom it causes.
 */
function finger(view: ViewHandle, pointerId: number) {
  const send = (type: string, vx: number, vy: number, buttons: number) => {
    const r = view.element.getBoundingClientRect();
    const at = { x: r.left + vx, y: r.top + vy };
    view.element.dispatchEvent(
      new PointerEvent(type, {
        pointerId,
        pointerType: "touch",
        isPrimary: pointerId === 1,
        clientX: at.x,
        clientY: at.y,
        button: type === "pointermove" ? -1 : 0,
        buttons,
        bubbles: true,
        cancelable: true,
        composed: true,
      }),
    );
  };
  return {
    down: (x: number, y: number) => send("pointerdown", x, y, 1),
    move: (x: number, y: number) => send("pointermove", x, y, 1),
    up: (x: number, y: number) => send("pointerup", x, y, 0),
  };
}

describe("touch pinch zoom", () => {
  it("a second touch during a node drag cancels it and the two touches zoom", async () => {
    const model = buildModel([twoPortNode("a", 100, 100)]);
    const view = mountView(makeHost(400, 300), {
      model,
      initialViewport: { zoom: 1, panX: 0, panY: 0 },
    });
    cleanup(() => view.dispose());
    await frames();
    const revision = model.reader.revision();
    const cancelled: string[] = [];
    view.on("gesture-cancelled", (e) => void cancelled.push(e.reason));
    const one = finger(view, 1);
    const two = finger(view, 2);
    one.down(100, 100);
    one.move(120, 100);
    one.move(140, 100);
    two.down(240, 100);
    // Spread to twice the distance: 100 -> 200 world units at zoom 1.
    two.move(290, 100);
    one.move(90, 100);
    one.up(90, 100);
    two.up(290, 100);
    await frames();
    // The finger distance went from 100 to 200 CSS pixels.
    expect(view.viewport.get().zoom).toBeCloseTo(2, 6);
    expect(cancelled).toEqual([]);
    expect(model.reader.getNode(nodeId("a"))?.position).toEqual({
      x: 100,
      y: 100,
    });
    expect(model.reader.revision()).toBe(revision);
  });
});
