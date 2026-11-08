/// <reference types="@vitest/browser-playwright" />
import { describe, expect, it } from "vitest";
import { nodeId } from "../core/index.js";
import { buildModel, twoPortNode } from "../core/space/scene/scene-fixtures.js";
import { cleanupScope, frames, makeHost } from "./browser-support.js";
import { key, mouse, wheel } from "./interact/input/input-test-support.js";
import { mountView } from "./mount-view.js";

const cleanup = cleanupScope();

function setup(locked = true) {
  const model = buildModel([
    twoPortNode("a", 100, 100, { w: 60, h: 40 }),
    twoPortNode("b", 300, 100, { w: 60, h: 40 }),
  ]);
  const view = mountView(makeHost(500, 300), {
    model,
    locked,
    input: { platform: "other" },
  });
  cleanup(() => view.dispose());
  const position = () => model.reader.getNode(nodeId("a"))?.position;
  return { model, view, position, pointer: mouse(view) };
}

describe("view lock gestures", () => {
  it("a locked view moves no node, connects nothing and deletes nothing", async () => {
    const { model, view, position, pointer } = setup();
    await frames();
    const start = position();
    const connections = model.reader.connections().length;
    const revision = model.reader.revision();
    pointer.drag([100, 100], [150, 140]);
    // From the right port of a to the left port of b.
    pointer.drag([130, 100], [270, 100]);
    view.selection.replace(["n:a"]);
    key(view.element, "Delete");
    await frames();
    expect(position()).toEqual(start);
    expect(model.reader.connections()).toHaveLength(connections);
    expect(model.reader.nodes()).toHaveLength(2);
    expect(model.reader.revision()).toBe(revision);
  });

  it("a locked view still selects, pans, zooms and hovers", async () => {
    const { view, pointer } = setup();
    await frames();
    pointer.down(100, 100);
    pointer.up(100, 100);
    expect(view.selection.keys()).toContain("n:a");
    const before = view.viewport.get();
    pointer.drag([200, 250], [240, 270]);
    await frames();
    expect(view.viewport.get().panX).not.toBe(before.panX);
    wheel(view, 250, 150, -100);
    await frames();
    expect(view.viewport.get().zoom).toBeGreaterThan(before.zoom);
    pointer.move(300, 100);
    await frames();
    expect(view.hover.get()).toEqual({ kind: "node", node: "b" });
  });

  it("locking at runtime reports the change, and unlocking restores editing", async () => {
    const { model, view, position, pointer } = setup(false);
    await frames();
    const events: boolean[] = [];
    view.on("lock", (e) => events.push(e.locked));
    expect(view.locked).toBe(false);
    view.setLocked(true);
    view.setLocked(true);
    expect(view.locked).toBe(true);
    const start = position();
    pointer.drag([100, 100], [150, 140]);
    await frames();
    expect(position()).toEqual(start);
    view.setLocked(false);
    pointer.drag([100, 100], [150, 140]);
    await frames();
    expect(position()).not.toEqual(start);
    expect(events).toEqual([true, false]);
    expect(model.historyState().canUndo).toBe(true);
  });

  it("locking during a drag ends the gesture without committing", async () => {
    const { view, position, pointer } = setup(false);
    await frames();
    const start = position();
    pointer.down(100, 100);
    pointer.move(130, 120);
    view.setLocked(true);
    pointer.move(160, 140);
    pointer.up(160, 140);
    await frames();
    expect(position()).toEqual(start);
  });
});
