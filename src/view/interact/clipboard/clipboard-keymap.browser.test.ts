/// <reference types="@vitest/browser-playwright" />
import { describe, expect, it } from "vitest";
import { cleanupScope, makeHost, selNode } from "../../browser-support.js";
import { mountView } from "../../mount-view.js";
import { COMMAND_IDS } from "../commands/builtin-commands.js";
import { DEFAULT_KEYMAP, type KeyBinding } from "../commands/keymap.js";
import { clipboardModel } from "./clipboard-fixtures.js";

const cleanup = cleanupScope();

/** A focused view over nodes a and b (joined by c1) with `keymap`. */
function setup(keymap: readonly KeyBinding[] = DEFAULT_KEYMAP) {
  const model = clipboardModel();
  const host = makeHost(500, 300);
  const view = mountView(host, { model, input: { keymap } });
  cleanup(() => view.dispose());
  view.element.focus();
  return { model, view };
}

const without = (...commands: string[]): readonly KeyBinding[] =>
  DEFAULT_KEYMAP.filter((b) => !commands.includes(b.command));

function clip(
  target: EventTarget,
  type: "copy" | "cut" | "paste",
  text?: string,
) {
  const data = new DataTransfer();
  if (text !== undefined) data.setData("text/plain", text);
  const event = new ClipboardEvent(type, {
    clipboardData: data,
    bubbles: true,
    cancelable: true,
    composed: true,
  });
  target.dispatchEvent(event);
  return { event, data };
}

describe("clipboard events follow the keymap", () => {
  it("unbound cut keeps the selection: a native cut event deletes nothing and keeps its default", () => {
    const { model, view } = setup(without(COMMAND_IDS.cut));
    view.selection.replace([selNode("a")]);
    const cut = clip(view.element, "cut");
    expect(model.reader.nodes()).toHaveLength(2);
    expect(model.historyState().canUndo).toBe(false);
    expect(cut.event.defaultPrevented).toBe(false);
    expect(cut.data.getData("text/plain")).toBe("");
  });

  it("unbound copy and paste run nothing", () => {
    const fragment = (() => {
      const { view } = setup();
      view.selection.replace([selNode("a")]);
      return clip(view.element, "copy").data.getData("text/plain");
    })();
    const { model, view } = setup(without(COMMAND_IDS.copy, COMMAND_IDS.paste));
    view.selection.replace([selNode("a")]);
    const copy = clip(view.element, "copy");
    expect(copy.data.getData("text/plain")).toBe("");
    expect(copy.event.defaultPrevented).toBe(false);
    const paste = clip(view.element, "paste", fragment);
    expect(paste.event.defaultPrevented).toBe(false);
    expect(model.reader.nodes()).toHaveLength(2);
    expect(model.historyState().canUndo).toBe(false);
  });

  it("the other clipboard commands stay when only cut is unbound", () => {
    const { model, view } = setup(without(COMMAND_IDS.cut));
    view.selection.replace([selNode("a"), selNode("b")]);
    const text = clip(view.element, "copy").data.getData("text/plain");
    expect(text).toContain("@paceholder/nodeeditor-js/fragment");
    clip(view.element, "paste", text);
    expect(model.reader.nodes()).toHaveLength(4);
    expect(model.historyState().undoLabel).toBe("Paste");
  });

  it("with the default keymap a cut event removes the node as one entry and writes its fragment", () => {
    const { model, view } = setup();
    view.selection.replace([selNode("a")]);
    const cut = clip(view.element, "cut");
    expect(model.reader.nodes()).toHaveLength(1);
    expect(model.historyState().undoLabel).toBe("Delete");
    expect(cut.data.getData("text/plain")).toContain(
      "@paceholder/nodeeditor-js/fragment",
    );
  });
});

describe("native clipboard bindings are only for copy, cut and paste", () => {
  it("a native mark on an undo binding is ignored: the key-down runs undo and is default-prevented", () => {
    const keymap = [
      ...without(COMMAND_IDS.undo),
      { chord: "Mod+Z", command: COMMAND_IDS.undo, native: true },
    ];
    const { model, view } = setup(keymap);
    view.selection.replace([selNode("a")]);
    view.commands.run(COMMAND_IDS.delete);
    expect(model.reader.nodes()).toHaveLength(1);
    const mac = /mac/i.test(navigator.platform);
    const key = new KeyboardEvent("keydown", {
      key: "z",
      metaKey: mac,
      ctrlKey: !mac,
      bubbles: true,
      cancelable: true,
    });
    view.element.dispatchEvent(key);
    expect(key.defaultPrevented).toBe(true);
    expect(model.reader.nodes()).toHaveLength(2);
  });
});
