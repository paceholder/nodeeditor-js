/// <reference types="@vitest/browser-playwright" />
import { describe, expect, it } from "vitest";
import { viewportToWorld } from "../core/index.js";
import { buildModel, twoPortNode } from "../core/space/scene/scene-fixtures.js";
import { cleanupScope, frames, makeHost } from "./browser-support.js";
import type { ViewOptions } from "./mount-view.js";
import { mountView } from "./mount-view.js";

const cleanup = cleanupScope();

const spread = () =>
  buildModel([
    twoPortNode("a", 0, 0),
    twoPortNode("b", 2000, 1200),
    twoPortNode("c", -500, 900),
  ]);

function mounted(options: Partial<ViewOptions>) {
  const host = makeHost(500, 300);
  const view = mountView(host, { model: spread(), ...options });
  cleanup(() => view.dispose());
  return view;
}

describe("initial fit", () => {
  it("Fit on first load: all nodes visible with the padding, once", async () => {
    const view = mounted({ initialFit: { paddingPx: 20 } });
    let changes = 0;
    view.on("viewport", () => changes++);
    await frames();
    const v = view.viewport.get();
    expect(v.zoom).toBeLessThan(1);
    // The spread content ends up inside the container minus the padding.
    const topLeft = viewportToWorld(v, { x: 20, y: 20 });
    const bottomRight = viewportToWorld(v, { x: 480, y: 280 });
    expect(topLeft.x).toBeLessThanOrEqual(-500);
    expect(bottomRight.x).toBeGreaterThanOrEqual(2000);
    expect(topLeft.y).toBeLessThanOrEqual(0);
    expect(bottomRight.y).toBeGreaterThanOrEqual(1200);
    // Fit happened once: a later resize of the host does not refit.
    const fitted = view.viewport.get();
    view.element.parentElement?.style.setProperty("width", "400px");
    await frames();
    expect(view.viewport.get()).toEqual(fitted);
    expect(changes).toBe(1);
  });

  it("Fit on first load: skipped with an initial viewport", async () => {
    const initialViewport = { zoom: 1, panX: 7, panY: 9 };
    const view = mounted({ initialFit: true, initialViewport });
    await frames();
    expect(view.viewport.get()).toEqual(initialViewport);
  });

  it("Fit on first load: without the option the viewport stays at the default", async () => {
    const view = mounted({});
    await frames();
    expect(view.viewport.get()).toEqual({ zoom: 1, panX: 0, panY: 0 });
  });
});
