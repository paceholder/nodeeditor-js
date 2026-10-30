/// <reference types="@vitest/browser-playwright" />
import { describe, expect, it } from "vitest";
import { MAX_ZOOM, nodeId } from "../../../core/index.js";
import {
  buildModel,
  twoPortNode,
} from "../../../core/space/scene/scene-fixtures.js";
import { cleanupScope, frames, makeHost } from "../../browser-support.js";
import { mountView } from "../../mount-view.js";
import { key, mouse, wheel } from "./input-test-support.js";

const cleanup = cleanupScope();

function editor(x = 100) {
  const model = buildModel([
    twoPortNode("a", x, 100),
    twoPortNode("b", 300, 100),
  ]);
  const host = makeHost(500, 300);
  const view = mountView(host, {
    model,
    // Enter is bound only so IME handling can be observed.
    input: {
      platform: "other",
      keymap: [
        { chord: "Delete", command: "edit.delete" },
        { chord: "Enter", command: "edit.delete" },
      ],
    },
  });
  cleanup(() => view.dispose());
  return { model, host, view };
}

const has = (m: ReturnType<typeof editor>["model"], id: string) =>
  m.reader.getNode(nodeId(id)) !== undefined;

describe("input scope", () => {
  it("INT-06 Delete inside an overlay text field edits text and deletes no nodes", async () => {
    const { model, view } = editor();
    view.selection.replace(["n:a"]);
    const field = document.createElement("input");
    field.style.cssText = "pointer-events:auto;width:80px;";
    view.overlay.attach(field, { kind: "node", node: nodeId("a") });
    await frames(2);
    field.focus();
    const inField = key(field, "Delete");
    expect(has(model, "a")).toBe(true);
    expect(inField.defaultPrevented).toBe(false);
    // The same key on the canvas root does delete the selection.
    key(view.element, "Delete");
    expect(has(model, "a")).toBe(false);
  });

  it("INT-06 pointer presses inside overlay content start no gesture", async () => {
    const { model, view } = editor();
    const field = document.createElement("input");
    field.style.cssText = "pointer-events:auto;width:80px;";
    view.overlay.attach(field, { kind: "node", node: nodeId("a") });
    await frames(2);
    const down = mouse(view, field).down(100, 100);
    expect(down.defaultPrevented).toBe(false);
    expect(view.selection.size).toBe(0);
    expect(has(model, "a")).toBe(true);
  });

  it("INT-06 Enter during IME composition fires no graph shortcut", () => {
    const { model, view } = editor();
    view.selection.replace(["n:a"]);
    key(view.element, "Enter", { composing: true });
    expect(has(model, "a")).toBe(true);
    key(view.element, "Enter");
    expect(has(model, "a")).toBe(false);
  });

  it("INT-06 two mounted editors only react to the focused one", () => {
    const one = editor();
    const two = editor();
    one.view.selection.replace(["n:a"]);
    two.view.selection.replace(["n:a"]);
    two.view.element.focus();
    // Keyboard events go to the focused element only, as in a real browser.
    key(document.activeElement ?? document.body, "Delete");
    expect(has(one.model, "a")).toBe(true);
    expect(has(two.model, "a")).toBe(false);
    one.view.element.focus();
    key(document.activeElement ?? document.body, "Delete");
    expect(has(one.model, "a")).toBe(false);
  });

  it("INT-06 pressing the canvas focuses it so shortcuts follow the pointer", () => {
    const one = editor();
    mouse(one.view).down(400, 250);
    expect(document.activeElement).toBe(one.view.element);
  });

  it("INT-06 the wheel zooms and consumes the event, but scrolls the page at the zoom limit", () => {
    const { view } = editor();
    const zoomed = wheel(view, 100, 100, -200);
    expect(zoomed.defaultPrevented).toBe(true);
    expect(view.viewport.get().zoom).toBeGreaterThan(1);
    view.viewport.set({ zoom: MAX_ZOOM, panX: 0, panY: 0 });
    const atLimit = wheel(view, 100, 100, -200);
    expect(atLimit.defaultPrevented).toBe(false);
    expect(view.viewport.get().zoom).toBe(MAX_ZOOM);
  });

  it("INT-06 the scroll-page option leaves the wheel alone without the modifier", () => {
    const model = buildModel([twoPortNode("a", 100, 100)]);
    const view = mountView(makeHost(400, 300), {
      model,
      input: { toolOptions: { wheel: "scroll-page-unless-modifier" } },
    });
    cleanup(() => view.dispose());
    const plain = wheel(view, 100, 100, -200);
    expect(plain.defaultPrevented).toBe(false);
    expect(view.viewport.get().zoom).toBe(1);
  });
});
