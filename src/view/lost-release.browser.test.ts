/// <reference types="@vitest/browser-playwright" />
import { describe, expect, it } from "vitest";
import { nodeId } from "../core/index.js";
import { buildModel, twoPortNode } from "../core/space/scene/scene-fixtures.js";
import { cleanupScope, frames, makeHost } from "./browser-support.js";
import { contextMenu, mouse } from "./interact/input/input-test-support.js";
import { mountView } from "./mount-view.js";

const cleanup = cleanupScope();

function setup() {
  const model = buildModel([twoPortNode("a", 100, 100)]);
  const view = mountView(makeHost(400, 300), {
    model,
    initialViewport: { zoom: 1, panX: 0, panY: 0 },
  });
  cleanup(() => view.dispose());
  const position = () => model.reader.getNode(nodeId("a"))?.position;
  return { model, view, position };
}

describe("lost pointer release", () => {
  it("a contextmenu event cancels an undragged press even without a menu listener", async () => {
    const { model, view, position } = setup();
    await frames();
    const revision = model.reader.revision();
    const m = mouse(view);
    // macOS Control-click: the press, then the native menu event.
    m.down(100, 100, { ctrl: true });
    const event = contextMenu(view, 100, 100, { ctrlKey: true });
    // Without a listener the browser's own menu is left alone.
    expect(event.defaultPrevented).toBe(false);
    // Even if the button still reads as held, the press is over.
    m.move(160, 140);
    m.move(200, 160);
    m.up(200, 160);
    expect(position()).toEqual({ x: 100, y: 100 });
    expect(model.reader.revision()).toBe(revision);
  });

  it("a contextmenu during a drag past the threshold leaves the drag running", async () => {
    const { view, position } = setup();
    await frames();
    const m = mouse(view);
    m.down(100, 100);
    m.move(130, 100);
    m.move(160, 100);
    contextMenu(view, 160, 100);
    m.move(180, 100);
    m.up(180, 100);
    expect(position()).toEqual({ x: 180, y: 100 });
  });
});
