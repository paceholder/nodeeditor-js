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
});
