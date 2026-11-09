/// <reference types="@vitest/browser-playwright" />
import { describe, expect, it } from "vitest";
import { nodeId } from "../core/index.js";
import { buildModel, twoPortNode } from "../core/space/scene/scene-fixtures.js";
import { cleanupScope, frames, makeHost, selNode } from "./browser-support.js";
import { key } from "./interact/input/input-test-support.js";
import { mountView } from "./mount-view.js";

const cleanup = cleanupScope();

describe("one step per held key", () => {
  it("holding an arrow key moves the node one step and adds one history entry", async () => {
    const model = buildModel([twoPortNode("a", 100, 100)]);
    const view = mountView(makeHost(400, 300), { model });
    cleanup(() => view.dispose());
    await frames();
    view.selection.replace([selNode("a")]);
    view.element.focus();
    const first = key(view.element, "ArrowRight");
    const repeats = Array.from({ length: 10 }, () =>
      key(view.element, "ArrowRight", { repeat: true }),
    );
    key(view.element, "ArrowRight", {}, "keyup");
    expect(model.reader.getNode(nodeId("a"))?.position).toEqual({
      x: 101,
      y: 100,
    });
    // The repeats are still consumed, so the page does not scroll.
    expect(first.defaultPrevented).toBe(true);
    expect(repeats.every((e) => e.defaultPrevented)).toBe(true);
    // One history entry: a single undo restores the start and no move entry is left.
    expect(model.historyState().undoLabel).toMatch(/move|nudge/i);
    model.undo();
    expect(model.reader.getNode(nodeId("a"))?.position).toEqual({
      x: 100,
      y: 100,
    });
    expect(model.historyState().undoLabel ?? "").not.toMatch(/move|nudge/i);
  });
});
