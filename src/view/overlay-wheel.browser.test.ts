/// <reference types="@vitest/browser-playwright" />
import { describe, expect, it } from "vitest";
import { nodeId } from "../core/index.js";
import { buildModel, twoPortNode } from "../core/space/scene/scene-fixtures.js";
import { cleanupScope, frames, makeHost } from "./browser-support.js";
import { clientOf } from "./interact/input/input-test-support.js";
import { mountView } from "./mount-view.js";

const cleanup = cleanupScope();

function setup() {
  const model = buildModel([twoPortNode("a", 100, 100, { w: 60, h: 40 })]);
  const view = mountView(makeHost(400, 300), { model });
  cleanup(() => view.dispose());
  const content = document.createElement("div");
  content.style.cssText = "width:80px;height:40px;";
  view.overlay.attach(content, { kind: "node", node: nodeId("a") });
  return { view, content };
}

/** A wheel turn dispatched on `target` at a world point. */
function turn(
  target: EventTarget,
  view: ReturnType<typeof setup>["view"],
  wx: number,
  wy: number,
): WheelEvent {
  const at = clientOf(view, wx, wy);
  const event = new WheelEvent("wheel", {
    clientX: at.x,
    clientY: at.y,
    deltaY: -100,
    bubbles: true,
    cancelable: true,
    composed: true,
  });
  target.dispatchEvent(event);
  return event;
}

describe("overlay wheel", () => {
  it("Wheel over overlay content: the canvas does not zoom", async () => {
    const { view, content } = setup();
    await frames();
    const before = view.viewport.get();
    const event = turn(content, view, 110, 110);
    await frames();
    expect(view.viewport.get()).toEqual(before);
    expect(event.defaultPrevented).toBe(false);
  });

  it("Wheel over the empty overlay layer: the canvas zooms", async () => {
    const { view } = setup();
    await frames();
    const before = view.viewport.get().zoom;
    const event = turn(view.overlayElement, view, 300, 250);
    await frames();
    expect(view.viewport.get().zoom).toBeGreaterThan(before);
    expect(event.defaultPrevented).toBe(true);
  });
});
