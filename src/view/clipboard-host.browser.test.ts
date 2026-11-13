/// <reference types="@vitest/browser-playwright" />
import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { ok, type Point } from "../core/index.js";
import { cleanupScope, makeHost, selNode } from "./browser-support.js";
import { clipboardModel } from "./interact/clipboard/clipboard-fixtures.js";
import type { CommandContext } from "./interact/commands/command-registry.js";
import { clientOf } from "./interact/input/input-test-support.js";
import { mountView } from "./mount-view.js";

const cleanup = cleanupScope();
const MOD = /mac/i.test(navigator.platform) ? "Meta" : "Control";
const chord = (k: string) => userEvent.keyboard(`{${MOD}>}${k}{/${MOD}}`);
const tick = () => new Promise((r) => setTimeout(r, 20));

function setup() {
  const model = clipboardModel();
  const view = mountView(makeHost(600, 400), { model });
  cleanup(() => view.dispose());
  view.element.focus();
  return { model, view };
}

type View = ReturnType<typeof setup>["view"];

interface Call {
  readonly args: unknown;
  readonly pointer: Point<"world"> | undefined;
  readonly selected: readonly string[];
}

/** Replace `id` with a command that only records its calls. */
function recorder(view: View, id: string, allowWhenLocked = false) {
  const calls: Call[] = [];
  const remove = view.commands.register({
    id,
    labelKey: `command.${id}`,
    allowWhenLocked,
    availability: () => ({ available: true }),
    run(args: unknown, ctx: CommandContext) {
      calls.push({
        args,
        pointer: ctx.pointer,
        selected: ctx.selection.nodeIds(),
      });
      return ok({ changed: false });
    },
  });
  return { calls, remove };
}

function pointer(view: View, type: string, wx = 0, wy = 0) {
  const at = clientOf(view, wx, wy);
  view.element.dispatchEvent(
    new PointerEvent(type, {
      pointerType: "mouse",
      clientX: at.x,
      clientY: at.y,
      bubbles: true,
    }),
  );
}

function clip(view: View, type: "copy" | "cut" | "paste", text?: string) {
  const data = new DataTransfer();
  if (text !== undefined) data.setData("text/plain", text);
  const event = new ClipboardEvent(type, {
    clipboardData: data,
    bubbles: true,
    cancelable: true,
    composed: true,
  });
  view.element.dispatchEvent(event);
  return { event, data };
}

describe("pointer position in the command context", () => {
  it("a replaced paste run by the paste shortcut sees the pointer's world position", async () => {
    const { view } = setup();
    const paste = recorder(view, "edit.paste");
    pointer(view, "pointermove", 300, 200);
    await chord("v");
    await tick();
    expect(paste.calls).toHaveLength(1);
    const at = paste.calls[0]?.pointer;
    expect(at?.x).toBeCloseTo(300);
    expect(at?.y).toBeCloseTo(200);
  });

  it("a replaced duplicate sees no pointer after the pointer has left the view", async () => {
    const { view } = setup();
    const duplicate = recorder(view, "edit.duplicate");
    pointer(view, "pointermove", 300, 200);
    pointer(view, "pointerleave");
    await chord("d");
    expect(duplicate.calls).toHaveLength(1);
    expect(duplicate.calls[0]?.pointer).toBeUndefined();
  });
});

describe("host handled clipboard commands", () => {
  it("paste handed to the host: the native event runs it once with the text and the library stays silent", () => {
    const { model, view } = setup();
    const reports: unknown[] = [];
    view.clipboard.on("paste", (o) => reports.push(o));
    const paste = recorder(view, "edit.paste");
    clip(view, "paste", "anything");
    expect(paste.calls.map((c) => c.args)).toEqual([{ text: "anything" }]);
    expect(model.reader.nodes()).toHaveLength(2);
    expect(model.historyState().canUndo).toBe(false);
    expect(reports).toEqual([]);
  });

  it("duplicate handed to the host: the shortcut runs it once with the selection readable and adds no node", async () => {
    const { model, view } = setup();
    view.selection.replace([selNode("a")]);
    const duplicate = recorder(view, "edit.duplicate");
    await chord("d");
    expect(duplicate.calls.map((c) => c.selected)).toEqual([["a"]]);
    expect(model.reader.nodes()).toHaveLength(2);
  });

  it("cut handed to the host deletes nothing and gets the event's text sink", () => {
    const { model, view } = setup();
    view.selection.replace([selNode("a")]);
    const cut = recorder(view, "edit.cut");
    clip(view, "cut");
    expect(cut.calls).toHaveLength(1);
    const args = cut.calls[0]?.args as { sink?: unknown } | undefined;
    expect(typeof args?.sink).toBe("function");
    expect(model.reader.nodes()).toHaveLength(2);
    expect(model.historyState().canUndo).toBe(false);
  });

  it("a menu running the paste command hands its position to the host and pastes nothing", () => {
    const { model, view } = setup();
    const paste = recorder(view, "edit.paste");
    const at = { x: 40, y: 50 } as Point<"world">;
    expect(view.commands.run("edit.paste", { at }).ok).toBe(true);
    expect(paste.calls.map((c) => c.args)).toEqual([{ at }]);
    expect(model.reader.nodes()).toHaveLength(2);
  });

  it("removing a replacement does not restore the built-in: a paste then runs nothing", () => {
    const { model, view } = setup();
    view.selection.replace([selNode("a")]);
    const text = clip(view, "copy").data.getData("text/plain");
    const paste = recorder(view, "edit.paste");
    paste.remove();
    clip(view, "paste", text);
    expect(paste.calls).toEqual([]);
    expect(model.reader.nodes()).toHaveLength(2);
    const run = view.commands.run("edit.paste");
    expect(!run.ok && run.rejection.message).toBe(
      'Unknown command "edit.paste"',
    );
  });

  it("a replacement respects the view lock: a native paste does not run it", () => {
    const { view } = setup();
    const paste = recorder(view, "edit.paste");
    view.setLocked(true);
    clip(view, "paste", "anything");
    expect(paste.calls).toEqual([]);
    const run = view.commands.run("edit.paste");
    expect(!run.ok && run.rejection.message).toBe("The view is locked");
  });
});
