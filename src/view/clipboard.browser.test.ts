/// <reference types="@vitest/browser-playwright" />
import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { nodeId } from "../core/index.js";
import { cleanupScope, makeHost } from "./browser-support.js";
import { clipboardModel } from "./interact/clipboard/clipboard-fixtures.js";
import { clientOf } from "./interact/input/input-test-support.js";
import { nodeKey } from "./interact/selection/selection-model.js";
import { mountView } from "./mount-view.js";

const cleanup = cleanupScope();
const MOD = /mac/i.test(navigator.platform) ? "Meta" : "Control";
const chord = (k: string) => userEvent.keyboard(`{${MOD}>}${k}{/${MOD}}`);
const tick = () => new Promise((r) => setTimeout(r, 20));

function setup() {
  const model = clipboardModel();
  const host = makeHost(600, 400);
  const view = mountView(host, { model });
  cleanup(() => view.dispose());
  view.element.focus();
  return { model, view };
}

function hover(view: ReturnType<typeof setup>["view"], wx: number, wy: number) {
  const at = clientOf(view, wx, wy);
  view.element.dispatchEvent(
    new PointerEvent("pointermove", {
      pointerType: "mouse",
      clientX: at.x,
      clientY: at.y,
      bubbles: true,
    }),
  );
}

describe("clipboard shortcuts end to end", () => {
  it("UX-01, EDT-03 Copy and paste shortcuts: centred at the pointer, selected, one entry", async () => {
    const { model, view } = setup();
    view.selection.replace([nodeKey(nodeId("a")), nodeKey(nodeId("b"))]);
    await chord("c");
    await tick();
    hover(view, 300, 200);
    const before = model.reader.nodes().length;
    await chord("v");
    await tick();
    const added = model.reader.nodes().slice(before);
    expect(added).toHaveLength(2);
    // a at 0 and b at 100 (40 wide): bounding box centre 50, so x = 250 and 350.
    expect(added.map((n) => n.position)).toEqual([
      { x: 250, y: 200 },
      { x: 350, y: 200 },
    ]);
    expect(view.selection.nodeIds()).toEqual(added.map((n) => n.id));
    expect(view.selection.connectionIds()).toHaveLength(1);
    expect(model.historyState().undoLabel).toBe("Paste");
    await chord("z");
    expect(model.reader.nodes()).toHaveLength(before);
  });

  it("UX-01 Duplicate shortcut: one step away, selected", async () => {
    const { model, view } = setup();
    view.selection.replace([nodeKey(nodeId("b"))]);
    await chord("d");
    const copy = model.reader.nodes().at(-1);
    expect(copy?.position).toEqual({ x: 120, y: 20 });
    expect(view.selection.nodeIds()).toEqual([copy?.id]);
  });

  it("EDT-06, INT-08 Cut is one history entry; undo restores original IDs", async () => {
    const { model, view } = setup();
    view.selection.replace([nodeKey(nodeId("a")), nodeKey(nodeId("b"))]);
    await chord("x");
    await tick();
    expect(model.reader.nodes()).toHaveLength(0);
    expect(model.historyState().undoLabel).toBe("Delete");
    await chord("z");
    expect(model.reader.nodes().map((n) => n.id)).toEqual(["a", "b"]);
    expect(model.historyState().canUndo).toBe(false);
    await chord("v");
    await tick();
    expect(model.reader.nodes()).toHaveLength(4);
  });

  it("LIFE-01 dispose removes the clipboard listeners", async () => {
    const { model, view } = setup();
    view.selection.replace([nodeKey(nodeId("a"))]);
    view.dispose();
    const data = new DataTransfer();
    const event = new ClipboardEvent("copy", {
      clipboardData: data,
      bubbles: true,
      cancelable: true,
    });
    document.body.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(data.getData("text/plain")).toBe("");
    expect(model.reader.nodes()).toHaveLength(2);
    await tick();
  });
});
