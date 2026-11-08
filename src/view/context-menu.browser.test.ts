/// <reference types="@vitest/browser-playwright" />
import { describe, expect, it } from "vitest";
import { connectionId, nodeId, portId } from "../core/index.js";
import { buildModel, twoPortNode } from "../core/space/scene/scene-fixtures.js";
import { cleanupScope, frames, makeHost, selNode } from "./browser-support.js";
import type { ContextMenuEvent } from "./interact/context-menu/context-menu-types.js";
import {
  clientOf,
  contextMenu,
  key,
  mouse,
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

const A = selNode("a");
const B = selNode("b");

describe("context-menu event from the pointer", () => {
  it("Right-click an unselected node: it becomes the selection, no browser menu", () => {
    const { view, events } = setup();
    view.selection.replace([A]);
    const e = contextMenu(view, 300, 100);
    expect(e.defaultPrevented).toBe(true);
    expect(view.selection.nodes()).toEqual([B.id]);
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
    expect(view.selection.nodes()).toEqual([A.id, B.id]);
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
    expect(view.selection.nodes()).toEqual([A.id]);
  });

  it("Right-click a connection selects it", () => {
    const { view, events } = setup();
    contextMenu(view, 200, 100);
    expect(events[0]?.target).toEqual({
      kind: "connection",
      connection: connectionId("c1"),
    });
    expect(view.selection.connections()).toEqual([connectionId("c1")]);
  });

  it("Right-click empty canvas leaves the selection", () => {
    const { view, events } = setup();
    view.selection.replace([A]);
    contextMenu(view, 250, 250);
    expect(events[0]?.target).toEqual({ kind: "canvas" });
    expect(events[0]?.world).toEqual({ x: 250, y: 250 });
    expect(view.selection.nodes()).toEqual([A.id]);
  });

  it("No listener keeps the browser menu and the selection", () => {
    const { view } = setup({ listen: false });
    view.selection.replace([A]);
    const e = contextMenu(view, 300, 100);
    expect(e.defaultPrevented).toBe(false);
    expect(view.selection.nodes()).toEqual([A.id]);
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
    expect(view.selection.nodes()).toEqual([A.id, B.id]);
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
