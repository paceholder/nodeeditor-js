/// <reference types="@vitest/browser-playwright" />
import { describe, expect, it } from "vitest";
import { buildModel, twoPortNode } from "../core/space/scene/scene-fixtures.js";
import { cleanupScope, frames, makeHost } from "./browser-support.js";
import { clientOf, wheel } from "./interact/input/input-test-support.js";
import { mountView } from "./mount-view.js";
import type { ViewOptions } from "./view-types.js";

const cleanup = cleanupScope();

function setup(over: Partial<ViewOptions> = {}) {
  const model = buildModel([twoPortNode("a", 100, 100)]);
  const view = mountView(makeHost(400, 300), {
    model,
    zoomLimits: { min: 0.5, max: 2 },
    initialViewport: { zoom: 2, panX: 0, panY: 0 },
    ...over,
  });
  cleanup(() => view.dispose());
  return view;
}

describe("control-wheel zoom over the canvas", () => {
  it("a Control-wheel at the maximum zoom is consumed so the page does not zoom", async () => {
    const view = setup();
    await frames();
    const pinch = wheel(view, 50, 50, -8, { ctrl: true });
    expect(pinch.defaultPrevented).toBe(true);
    expect(view.viewport.get().zoom).toBe(2);
    // A plain wheel at the limit still lets the page scroll.
    expect(wheel(view, 50, 50, -8).defaultPrevented).toBe(false);
    // Pinching the other way zooms out.
    wheel(view, 50, 50, 8, { ctrl: true });
    expect(view.viewport.get().zoom).toBeLessThan(2);
  });
});

describe("trackpad pan mode", () => {
  it("two-finger scrolling pans both ways and keeps the zoom", async () => {
    const view = setup({
      initialViewport: { zoom: 1, panX: 0, panY: 0 },
      input: { toolOptions: { wheel: "pan" } },
    });
    await frames();
    const at = clientOf(view, 50, 50);
    const event = new WheelEvent("wheel", {
      clientX: at.x,
      clientY: at.y,
      deltaX: 30,
      deltaY: 20,
      bubbles: true,
      cancelable: true,
    });
    view.element.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(view.viewport.get()).toEqual({ zoom: 1, panX: -30, panY: -20 });
  });
});
