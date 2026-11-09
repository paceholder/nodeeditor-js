/// <reference types="@vitest/browser-playwright" />
import { describe, expect, it } from "vitest";
import { cleanupScope, makeHost, selNode } from "../../browser-support.js";
import { mountView } from "../../mount-view.js";
import { clipboardModel } from "./clipboard-fixtures.js";

const cleanup = cleanupScope();

function setup() {
  const model = clipboardModel();
  const host = makeHost(500, 300);
  const view = mountView(host, { model });
  cleanup(() => view.dispose());
  view.element.focus();
  return { model, view };
}

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

/**
 * Presses the platform's Mod+`key` on the view root. A synthetic key-down never makes the
 * browser fire a clipboard event, so the test fires it itself.
 */
function chord(root: HTMLElement, key: string) {
  const mac = /mac/i.test(navigator.platform);
  root.dispatchEvent(
    new KeyboardEvent("keydown", {
      key,
      metaKey: mac,
      ctrlKey: !mac,
      bubbles: true,
      cancelable: true,
    }),
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("native clipboard events", () => {
  it("a copy event writes the fragment; a paste event pastes it", () => {
    const { model, view } = setup();
    view.selection.replace([selNode("a"), selNode("b")]);
    const copy = clip(view.element, "copy");
    expect(copy.event.defaultPrevented).toBe(true);
    const text = copy.data.getData("text/plain");
    expect(text).toContain("@paceholder/nodeeditor-js/fragment");
    const paste = clip(view.element, "paste", text);
    expect(paste.event.defaultPrevented).toBe(true);
    expect(model.reader.nodes()).toHaveLength(4);
    expect(view.selection.nodes()).toHaveLength(2);
    expect(view.selection.connections()).toHaveLength(1);
  });

  it("a paste event with foreign text pastes nothing and reports why", () => {
    const { model, view } = setup();
    view.selection.replace([selNode("a")]);
    clip(view.element, "copy");
    const reasons: string[] = [];
    view.clipboard.on("paste", (o) => {
      if (!o.ok) reasons.push(o.rejection.code);
    });
    expect(() => clip(view.element, "paste", "hello")).not.toThrow();
    expect(model.reader.nodes()).toHaveLength(2);
    expect(reasons).toEqual(["not-a-fragment"]);
  });

  it("a cut event removes the selection in one entry", () => {
    const { model, view } = setup();
    view.selection.replace([selNode("a"), selNode("b")]);
    const cut = clip(view.element, "cut");
    expect(cut.data.getData("text/plain")).toContain(
      "@paceholder/nodeeditor-js/fragment",
    );
    expect(model.reader.nodes()).toHaveLength(0);
    expect(model.historyState().undoLabel).toBe("Delete");
  });

  it("a copy from a focused overlay text field leaves the graph alone", () => {
    const { model, view } = setup();
    view.selection.replace([selNode("a")]);
    const field = document.createElement("input");
    field.value = "label";
    const handle = view.overlay.attach(field, {
      kind: "world",
      point: { x: 0, y: 0 } as never,
    });
    cleanup(() => handle.dispose());
    field.focus();
    const copy = clip(field, "copy");
    expect(copy.event.defaultPrevented).toBe(false);
    expect(copy.data.getData("text/plain")).toBe("");
    const paste = clip(field, "paste", "x");
    expect(paste.event.defaultPrevented).toBe(false);
    expect(model.reader.nodes()).toHaveLength(2);
  });

  it("events while focus is elsewhere are ignored", () => {
    const { model, view } = setup();
    view.selection.replace([selNode("a")]);
    view.element.blur();
    const copy = clip(document.body, "copy");
    expect(copy.event.defaultPrevented).toBe(false);
    expect(model.reader.nodes()).toHaveLength(2);
  });

  it("a paste chord alone pastes nothing; its event pastes once", async () => {
    const { model, view } = setup();
    view.selection.replace([selNode("a")]);
    const text = clip(view.element, "copy").data.getData("text/plain");
    chord(view.element, "v");
    await sleep(50);
    expect(model.reader.nodes()).toHaveLength(2);
    clip(view.element, "paste", text);
    await sleep(50);
    expect(model.reader.nodes()).toHaveLength(3);
  });
});
