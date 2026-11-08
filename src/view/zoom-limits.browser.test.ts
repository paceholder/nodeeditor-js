/// <reference types="@vitest/browser-playwright" />
import { describe, expect, it } from "vitest";
import { buildModel, twoPortNode } from "../core/space/scene/scene-fixtures.js";
import { cleanupScope, frames, makeHost } from "./browser-support.js";
import { wheel } from "./interact/input/input-test-support.js";
import { mountView } from "./mount-view.js";

const cleanup = cleanupScope();

function mounted(nodes: ReturnType<typeof twoPortNode>[]) {
  const model = buildModel(nodes);
  const view = mountView(makeHost(500, 300), {
    model,
    zoomLimits: { min: 0.1, max: 2 },
  });
  cleanup(() => view.dispose());
  return view;
}

describe("view zoom limits", () => {
  it("Zoom limits: wheel far in and far out never leaves 0.1 to 2", async () => {
    const view = mounted([twoPortNode("a", 100, 100)]);
    await frames();
    for (let i = 0; i < 40; i++) wheel(view, 100, 100, -400);
    expect(view.viewport.get().zoom).toBe(2);
    for (let i = 0; i < 80; i++) wheel(view, 100, 100, 400);
    expect(view.viewport.get().zoom).toBe(0.1);
    // At a limit the wheel is not consumed, so the page may scroll.
    expect(wheel(view, 100, 100, 400).defaultPrevented).toBe(false);
  });

  it("Zoom limits: a trackpad pinch (a wheel with the control key) stays inside the limits too", async () => {
    const view = mounted([twoPortNode("a", 100, 100)]);
    await frames();
    for (let i = 0; i < 40; i++) wheel(view, 100, 100, -400, { ctrl: true });
    expect(view.viewport.get().zoom).toBe(2);
    for (let i = 0; i < 80; i++) wheel(view, 100, 100, 400, { ctrl: true });
    expect(view.viewport.get().zoom).toBe(0.1);
  });

  it("Zoom limits: fit never zooms in past the maximum", async () => {
    const view = mounted([twoPortNode("a", 100, 100, { w: 20, h: 20 })]);
    await frames();
    view.commands.run("view.fitAll");
    expect(view.viewport.get().zoom).toBeLessThanOrEqual(2);
    expect(view.viewport.get().zoom).toBeGreaterThan(0);
  });

  it("Zoom limits: fit never zooms out past the minimum", async () => {
    const view = mounted([
      twoPortNode("a", 0, 0),
      twoPortNode("b", 100000, 100000),
    ]);
    await frames();
    view.commands.run("view.fitAll");
    expect(view.viewport.get().zoom).toBe(0.1);
  });

  it("limits can change at runtime: wheel, set and fit follow, and a zoom outside is pulled in", async () => {
    const view = mounted([twoPortNode("a", 100, 100, { w: 20, h: 20 })]);
    await frames();
    view.viewport.set({ zoom: 1.5, panX: 0, panY: 0 });
    await frames();
    let notified = 0;
    view.on("viewport", () => notified++);
    view.setZoomLimits({ min: 0.5, max: 1 });
    expect(view.zoomLimits()).toEqual({ min: 0.5, max: 1 });
    expect(view.viewport.get().zoom).toBe(1);
    await frames();
    expect(notified).toBe(1);
    for (let i = 0; i < 40; i++) wheel(view, 100, 100, -400);
    expect(view.viewport.get().zoom).toBe(1);
    view.commands.run("view.fitAll");
    expect(view.viewport.get().zoom).toBeLessThanOrEqual(1);
    view.setZoomLimits({ min: 0.25, max: 4 });
    view.viewport.set({ zoom: 3, panX: 0, panY: 0 });
    expect(view.viewport.get().zoom).toBe(3);
    view.setZoomLimits();
    expect(view.zoomLimits().max).toBeGreaterThanOrEqual(4);
  });

  it("unusable limits throw and leave the old ones in place", async () => {
    const view = mounted([twoPortNode("a", 100, 100)]);
    expect(() => view.setZoomLimits({ min: 2, max: 1 })).toThrow(RangeError);
    expect(view.zoomLimits()).toEqual({ min: 0.1, max: 2 });
  });
});
