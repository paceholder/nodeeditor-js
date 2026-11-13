/// <reference types="@vitest/browser-playwright" />
import { describe, expect, it } from "vitest";
import { nodeId } from "../core/index.js";
import { buildModel, twoPortNode } from "../core/space/scene/scene-fixtures.js";
import { cleanupScope, makeHost, selNode } from "./browser-support.js";
import { DEFAULT_KEYMAP } from "./interact/commands/keymap.js";
import { mountView } from "./mount-view.js";

const cleanup = cleanupScope();

describe("view commands API", () => {
  it("view.fitAll and history.undo run through commands.run", () => {
    const model = buildModel([
      twoPortNode("a", 100, 100),
      twoPortNode("b", 300, 100),
    ]);
    const view = mountView(makeHost(500, 300), { model });
    cleanup(() => view.dispose());

    expect(view.commands.run("view.fitAll")).toEqual({
      ok: true,
      value: { changed: true },
    });
    expect(view.viewport.get()).not.toEqual({ zoom: 1, panX: 0, panY: 0 });

    model.moveNodes([{ node: nodeId("a"), position: { x: 140, y: 100 } }]);
    expect(view.commands.availability("history.undo").available).toBe(true);
    expect(view.commands.run("history.undo").ok).toBe(true);
    expect(model.reader.getNode(nodeId("a"))?.position).toEqual({
      x: 100,
      y: 100,
    });
    expect(view.commands.list().map((c) => c.id)).toContain("history.redo");
  });

  it("a view over a read-only model refuses edits with a reason and still navigates", () => {
    const full = buildModel([twoPortNode("a", 100, 100)]);
    const readOnly = { reader: full.reader, on: full.on };
    const view = mountView(makeHost(500, 300), { model: readOnly });
    cleanup(() => view.dispose());
    const undo = view.commands.run("history.undo");
    expect(undo.ok).toBe(false);
    expect(view.commands.run("view.fitAll").ok).toBe(true);
    view.selection.replace([selNode("a")]);
    expect(view.commands.run("edit.delete").ok).toBe(false);
    expect(full.reader.nodes()).toHaveLength(1);
  });
});

describe("clipboard events follow the keymap: the command API is not keyboard input", () => {
  it("a view without a copy binding still copies through view.commands.run", () => {
    const model = buildModel([twoPortNode("a", 100, 100)]);
    const keymap = DEFAULT_KEYMAP.filter((b) => b.command !== "edit.copy");
    const view = mountView(makeHost(500, 300), { model, input: { keymap } });
    cleanup(() => view.dispose());
    view.selection.replace([selNode("a")]);
    let written = "";
    const sink = (text: string) => {
      written = text;
    };
    expect(view.commands.run("edit.copy", { sink }).ok).toBe(true);
    expect(written).toContain("@paceholder/nodeeditor-js/fragment");
  });
});
