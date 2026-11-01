/// <reference types="@vitest/browser-playwright" />
import { describe, expect, it } from "vitest";
import { connectionId, nodeId } from "../core/index.js";
import { buildModel, twoPortNode } from "../core/space/scene/scene-fixtures.js";
import { cleanupScope, makeHost } from "./browser-support.js";
import type { ContextMenuEvent } from "./interact/context-menu/context-menu-types.js";
import {
  contextMenu,
  key,
  touch,
} from "./interact/input/input-test-support.js";
import { mountView } from "./mount-view.js";

const cleanup = cleanupScope();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** a centred at (100, 100) and b at (300, 100), 40x20, joined a.aR to b.bL. */
function setup(opts: { listen?: boolean; platform?: "mac" | "other" } = {}) {
  const model = buildModel(
    [twoPortNode("a", 100, 100), twoPortNode("b", 300, 100)],
    [["c1", "a", "aR", "b", "bL"]],
  );
  const view = mountView(makeHost(500, 300), {
    model,
    input: {
      platform: opts.platform ?? "other",
      toolOptions: { longPressMs: 60 },
    },
  });
  cleanup(() => view.dispose());
  const events: ContextMenuEvent[] = [];
  if (opts.listen !== false) view.on("context-menu", (e) => events.push(e));
  return { model, view, events };
}

const A = "n:a";
const B = "n:b";

describe("UX-01, INT-11 keyboard invocation", () => {
  it("Keyboard menu key: the primary connection, at its bounds, selection kept, one event", () => {
    const { view, events } = setup();
    view.selection.replace(["c:c1"]);
    view.element.focus();
    const e = key(view.element, "ContextMenu");
    expect(e.defaultPrevented).toBe(true);
    // Windows sends a native contextmenu after the key; it raises nothing more.
    const native = contextMenu(view, 400, 250);
    key(view.element, "ContextMenu", {}, "keyup");
    expect(native.defaultPrevented).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0]?.target).toEqual({
      kind: "connection",
      connection: connectionId("c1"),
    });
    expect(events[0]?.invocation).toBe("keyboard");
    expect(events[0]?.hits).toEqual([]);
    expect(events[0]?.world.x).toBeCloseTo(200);
    expect(view.selection.keys()).toEqual(["c:c1"]);
  });

  it("Context actions from the keyboard: Shift+F10 on a selected node", async () => {
    const { view, events } = setup();
    view.selection.replace([B]);
    view.element.focus();
    key(view.element, "F10", { shift: true });
    contextMenu(view, 10, 10);
    key(view.element, "F10", { shift: true }, "keyup");
    expect(events).toHaveLength(1);
    expect(events[0]?.target).toEqual({ kind: "node", node: nodeId("b") });
    expect(events[0]?.world).toEqual({ x: 300, y: 100 });
    // After the key-up and one task, a right-click raises its own event again.
    await sleep(10);
    contextMenu(view, 10, 10);
    expect(events).toHaveLength(2);
  });
});

describe("INT-11c touch long-press", () => {
  it("Touch long-press: one event, the release neither selects again nor moves", async () => {
    const { model, view, events } = setup();
    const rev = model.reader.revision();
    view.selection.replace([A]);
    const t = touch(view);
    t.down(300, 100);
    await sleep(120);
    expect(events).toHaveLength(1);
    expect(events[0]?.invocation).toBe("touch");
    expect(events[0]?.target).toEqual({ kind: "node", node: nodeId("b") });
    expect(view.selection.keys()).toEqual([B]);
    // Chrome on Android also sends a native contextmenu for the touch.
    expect(t.native(300, 100).defaultPrevented).toBe(true);
    t.move(340, 100);
    t.up(340, 100);
    expect(events).toHaveLength(1);
    expect(view.selection.keys()).toEqual([B]);
    expect(model.reader.revision()).toBe(rev);
  });

  it("Touch drag before the long-press pans and raises nothing", async () => {
    const { view, events } = setup();
    const t = touch(view);
    t.down(250, 250);
    t.move(260, 250);
    t.move(280, 250);
    await sleep(120);
    t.up(280, 250);
    expect(events).toEqual([]);
    // Each move is mapped through the already panned view, so the pan exceeds 30.
    expect(view.viewport.get().panX).toBeGreaterThanOrEqual(30);
  });

  it("Long-press turned off: no event, releasing selects as before", async () => {
    const { view, events } = setup();
    view.setToolOptions({ longPressMs: false });
    const t = touch(view);
    t.down(300, 100);
    await sleep(120);
    t.up(300, 100);
    expect(events).toEqual([]);
    expect(view.selection.keys()).toEqual([B]);
  });
});
