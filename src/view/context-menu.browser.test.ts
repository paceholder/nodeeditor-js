/// <reference types="@vitest/browser-playwright" />
import { describe, expect, it } from "vitest";
import { connectionId, nodeId, portId } from "../core/index.js";
import { buildModel, twoPortNode } from "../core/space/scene/scene-fixtures.js";
import { cleanupScope, frames, makeHost } from "./browser-support.js";
import type { ContextMenuEvent } from "./interact/context-menu/context-menu-types.js";
import {
  clientOf,
  key,
  mouse,
  pointer,
} from "./interact/input/input-test-support.js";
import { mountView, type ViewHandle } from "./mount-view.js";

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

/** A native `contextmenu` at a world point, as a right-click or Ctrl+click sends. */
function contextMenu(
  view: ViewHandle,
  wx: number,
  wy: number,
  init: PointerEventInit = {},
  target: EventTarget = view.element,
): PointerEvent {
  const at = clientOf(view, wx, wy);
  const event = new PointerEvent("contextmenu", {
    clientX: at.x,
    clientY: at.y,
    button: 2,
    pointerType: "mouse",
    bubbles: true,
    cancelable: true,
    composed: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

/** A finger at world points (pointer 7). */
function touch(view: ViewHandle) {
  const init = { pointerId: 7, pointerType: "touch", isPrimary: true };
  const at = (x: number, y: number) => clientOf(view, x, y);
  return {
    down: (x: number, y: number) =>
      pointer(view.element, "pointerdown", at(x, y), { ...init, button: 0 }),
    move: (x: number, y: number) =>
      pointer(view.element, "pointermove", at(x, y), init),
    up: (x: number, y: number) =>
      pointer(view.element, "pointerup", at(x, y), init),
    native: (x: number, y: number) => contextMenu(view, x, y, init),
  };
}

const A = "n:a";
const B = "n:b";

describe("context-menu event from the pointer", () => {
  it("Right-click an unselected node: it becomes the selection, no browser menu", () => {
    const { view, events } = setup();
    view.selection.replace([A]);
    const e = contextMenu(view, 300, 100);
    expect(e.defaultPrevented).toBe(true);
    expect(view.selection.keys()).toEqual([B]);
    expect(events).toHaveLength(1);
    expect(events[0]?.target).toEqual({ kind: "node", node: nodeId("b") });
    expect(events[0]?.selection).toEqual({
      nodes: [nodeId("b")],
      connections: [],
    });
    expect(events[0]?.invocation).toBe("mouse");
  });

  it("Right-click inside a multi-selection keeps it", () => {
    const { view, events } = setup();
    view.selection.replace([A, B]);
    contextMenu(view, 300, 100, { shiftKey: true });
    expect(view.selection.keys()).toEqual([A, B]);
    expect(events[0]?.modifiers.shift).toBe(true);
  });

  it("Right-click a port: port target with hits and positions", () => {
    const { view, events } = setup();
    contextMenu(view, 120, 100);
    const e = events[0];
    expect(e?.target).toEqual({
      kind: "port",
      node: nodeId("a"),
      port: portId("aR"),
    });
    expect(e?.hits[0]).toEqual({
      kind: "port",
      nodeId: nodeId("a"),
      portId: portId("aR"),
    });
    expect(e?.world).toEqual({ x: 120, y: 100 });
    expect(e?.viewport).toEqual({ x: 120, y: 100 });
    expect(e?.client).toEqual(clientOf(view, 120, 100));
    expect(view.selection.keys()).toEqual([A]);
  });

  it("Right-click a connection selects it", () => {
    const { view, events } = setup();
    contextMenu(view, 200, 100);
    expect(events[0]?.target).toEqual({
      kind: "connection",
      connection: connectionId("c1"),
    });
    expect(view.selection.keys()).toEqual(["c:c1"]);
  });

  it("Right-click empty canvas leaves the selection", () => {
    const { view, events } = setup();
    view.selection.replace([A]);
    contextMenu(view, 250, 250);
    expect(events[0]?.target).toEqual({ kind: "canvas" });
    expect(events[0]?.world).toEqual({ x: 250, y: 250 });
    expect(view.selection.keys()).toEqual([A]);
  });

  it("No listener keeps the browser menu and the selection", () => {
    const { view } = setup({ listen: false });
    view.selection.replace([A]);
    const e = contextMenu(view, 300, 100);
    expect(e.defaultPrevented).toBe(false);
    expect(view.selection.keys()).toEqual([A]);
  });

  it("Context menu outside the tool: unsubscribing restores the browser menu", () => {
    const { view } = setup({ listen: false });
    const off = view.on("context-menu", () => {});
    expect(contextMenu(view, 300, 100).defaultPrevented).toBe(true);
    off();
    expect(contextMenu(view, 300, 100).defaultPrevented).toBe(false);
  });
});

describe("context-menu scoping and gestures", () => {
  it("Right press starts no gesture", () => {
    const { model, view } = setup();
    const rev = model.reader.revision();
    const before = view.viewport.get();
    const m = mouse(view);
    m.down(100, 100, {}, 2);
    m.move(150, 100);
    m.up(150, 100, {}, 2);
    expect(model.reader.getNode(nodeId("a"))?.position).toEqual({
      x: 100,
      y: 100,
    });
    expect(view.viewport.get()).toEqual(before);
    expect(model.reader.revision()).toBe(rev);
  });

  it("Ctrl+click on macOS cancels the press: no select-on-release, no move, one event", () => {
    const { model, view, events } = setup({ platform: "mac" });
    const rev = model.reader.revision();
    view.selection.replace([A, B]);
    const m = mouse(view);
    m.down(100, 100, { ctrl: true });
    contextMenu(view, 100, 100, { ctrlKey: true, button: 0 });
    m.move(140, 100, { ctrl: true });
    m.up(140, 100, { ctrl: true });
    expect(events).toHaveLength(1);
    expect(events[0]?.target).toEqual({ kind: "node", node: nodeId("a") });
    expect(view.selection.keys()).toEqual([A, B]);
    expect(model.reader.revision()).toBe(rev);
  });

  it("No event during a drag; the drag commits one move", () => {
    const { model, view, events } = setup();
    const m = mouse(view);
    m.down(100, 100);
    m.move(130, 100);
    m.move(150, 100);
    const e = contextMenu(view, 150, 100);
    m.up(150, 100);
    expect(e.defaultPrevented).toBe(true);
    expect(events).toEqual([]);
    expect(model.reader.getNode(nodeId("a"))?.position).toEqual({
      x: 150,
      y: 100,
    });
    expect(model.historyState().undoLabel).toBeDefined();
  });

  it("Context menu on overlay content: no event, the browser default applies", async () => {
    const { view, events } = setup();
    const button = document.createElement("button");
    button.style.cssText = "width:40px;height:20px;";
    view.overlay.attach(button, { kind: "viewport", point: { x: 0, y: 0 } });
    await frames(2);
    const e = contextMenu(view, 10, 10, {}, button);
    expect(e.defaultPrevented).toBe(false);
    expect(events).toEqual([]);
  });

  it("Menu key in a text field: no event, the field keeps the key", async () => {
    const { view, events } = setup();
    view.selection.replace([A]);
    const field = document.createElement("input");
    view.overlay.attach(field, { kind: "node", node: nodeId("a") });
    await frames(2);
    field.focus();
    const e = key(field, "F10", { shift: true });
    expect(e.defaultPrevented).toBe(false);
    expect(events).toEqual([]);
  });
});

describe("keyboard invocation", () => {
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

describe("touch long-press", () => {
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

describe("menu items and lifetime", () => {
  it("Menu item runs a command: delete as one history entry, undone by the shortcut", () => {
    const { model, view } = setup();
    const before = model.historyState().undoLabel;
    view.on("context-menu", () => view.commands.run("edit.delete"));
    contextMenu(view, 300, 100);
    expect(model.reader.getNode(nodeId("b"))).toBeUndefined();
    expect(model.historyState().undoLabel).toBe("Delete");
    view.element.focus();
    key(view.element, "z", { ctrl: true });
    expect(model.reader.getNode(nodeId("b"))).toBeDefined();
    expect(model.historyState().undoLabel).toBe(before);
  });

  it("dispose leaves no listener and no long-press timer", async () => {
    const { view, events } = setup();
    touch(view).down(300, 100);
    view.dispose();
    await sleep(120);
    expect(events).toEqual([]);
    expect(contextMenu(view, 300, 100).defaultPrevented).toBe(false);
  });
});
