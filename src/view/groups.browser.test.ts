/// <reference types="@vitest/browser-playwright" />
import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import {
  exportSnapshot,
  type GraphModel,
  type GroupId,
  loadSnapshot,
  nodeId,
} from "../core/index.js";
import { twoPortNode } from "../core/space/scene/scene-fixtures.js";
import { cleanupScope, frames, makeHost, selNode } from "./browser-support.js";
import { clipboardModel } from "./interact/clipboard/clipboard-fixtures.js";
import { mouse } from "./interact/input/input-test-support.js";
import { mountView, type ViewOptions } from "./mount-view.js";

const cleanup = cleanupScope();
const MOD = /mac/i.test(navigator.platform) ? "Meta" : "Control";
const chord = (k: string) => userEvent.keyboard(`{${MOD}>}${k}{/${MOD}}`);
const N = nodeId;

/**
 * Three 40 x 20 nodes centred at (100,100), (200,100) and (400,100). With a and b grouped
 * the frame spans x 64..236 and y 50..126; its title strip ends at y 74 and its lock
 * icon is centred at (224, 62).
 */
function setup(options: Partial<ViewOptions> = {}) {
  const model = clipboardModel(
    [
      twoPortNode("a", 100, 100),
      twoPortNode("b", 200, 100),
      twoPortNode("c", 400, 100),
    ],
    [],
  );
  const host = makeHost(600, 400);
  const view = mountView(host, { model, ...options });
  cleanup(() => view.dispose());
  view.viewport.set({ zoom: 1, panX: 0, panY: 0 });
  view.element.focus();
  const errors: unknown[] = [];
  view.on("paint-error", (e) => errors.push(e.error));
  return { model, view, errors, m: mouse(view) };
}

function group(model: GraphModel, ids: readonly string[]): GroupId {
  const made = model.groupNodes(ids.map(N));
  if (made.status !== "accepted") throw new Error("group failed");
  return made.changed.groups[0] as GroupId;
}

const TITLE = [120, 62] as const;
const LOCK = [224, 62] as const;
const members = (model: GraphModel, id: GroupId) =>
  model.reader.groupMembers(id).map((n) => n.id);
const editorOf = (view: { element: HTMLElement }) =>
  view.element.querySelector<HTMLInputElement>(
    'input[aria-label="Group title"]',
  );
const x = (model: GraphModel, id: string) =>
  model.reader.getNode(N(id))?.position.x;

describe("flat visual groups in the browser", () => {
  it("the group shortcut groups three selected nodes and opens the title editor; typing a name and Enter names the group", async () => {
    const { model, view, errors } = setup();
    view.selection.replace([selNode("a"), selNode("b"), selNode("c")]);
    await chord("g");
    const [created] = model.reader.groups();
    if (!created) throw new Error("no group");
    expect(members(model, created.id)).toEqual([N("a"), N("b"), N("c")]);
    expect(view.selection.groups()).toEqual([created.id]);
    const field = editorOf(view);
    expect(field).not.toBeNull();
    expect(document.activeElement).toBe(field);
    await userEvent.keyboard("Inlet stage{Enter}");
    expect(model.reader.getGroup(created.id)?.title).toBe("Inlet stage");
    expect(editorOf(view)).toBeNull();
    expect(document.activeElement).toBe(view.element);
    await frames();
    expect(errors).toEqual([]);
    // Two entries: the rename, then the grouping.
    await chord("z");
    expect(model.reader.getGroup(created.id)?.title).toBe("Group");
    await chord("z");
    expect(model.reader.groups()).toEqual([]);
  });

  it("the ungroup shortcut removes the group of a selected member", async () => {
    const { model, view } = setup();
    group(model, ["a", "b"]);
    view.selection.replace([selNode("a")]);
    await userEvent.keyboard(`{${MOD}>}{Shift>}g{/Shift}{/${MOD}}`);
    expect(model.reader.groups()).toEqual([]);
    expect(model.reader.nodes()).toHaveLength(3);
  });

  it("dragging the frame by its title strip moves every member, and a drag from its blank interior pans", async () => {
    const { model, view, m, errors } = setup();
    const id = group(model, ["a", "b"]);
    await frames();
    m.drag(TITLE, [TITLE[0] + 40, TITLE[1]]);
    expect(x(model, "a")).toBe(140);
    expect(x(model, "b")).toBe(240);
    expect(view.selection.groups()).toEqual([id]);
    await chord("z");
    expect(x(model, "a")).toBe(100);
    m.drag([150, 100], [180, 100]);
    expect(view.viewport.get().panX).toBeGreaterThan(0);
    expect(x(model, "a")).toBe(100);
    await frames();
    expect(errors).toEqual([]);
  });
});

describe("drop to join and drag out to leave in the browser", () => {
  it("a node dropped on the frame joins and a member dragged clear leaves, each undone by one undo", async () => {
    const { model, m, errors } = setup();
    const id = group(model, ["a", "b"]);
    await frames();
    m.drag([400, 100], [250, 100]);
    expect(members(model, id)).toEqual([N("a"), N("b"), N("c")]);
    await frames();
    await chord("z");
    expect(members(model, id)).toEqual([N("a"), N("b")]);
    expect(x(model, "c")).toBe(400);
    m.drag([200, 100], [450, 300]);
    expect(members(model, id)).toEqual([N("a")]);
    await chord("z");
    expect(members(model, id)).toEqual([N("a"), N("b")]);
    expect(x(model, "b")).toBe(200);
    await frames();
    expect(errors).toEqual([]);
  });
});

describe("group lock in the browser", () => {
  it("a click on the padlock locks the group, and dragging one member then moves both", async () => {
    const { model, m } = setup();
    const id = group(model, ["a", "b"]);
    await frames();
    m.down(...LOCK);
    m.up(...LOCK);
    expect(model.reader.getGroup(id)?.locked).toBe(true);
    m.drag([100, 100], [130, 100]);
    expect(x(model, "a")).toBe(130);
    expect(x(model, "b")).toBe(230);
    expect(members(model, id)).toEqual([N("a"), N("b")]);
  });
});

describe("group title is shown and editable in the browser", () => {
  async function openByDoubleClick() {
    const s = setup();
    const id = group(s.model, ["a", "b"]);
    await frames();
    s.m.down(...TITLE);
    s.m.up(...TITLE);
    s.m.down(...TITLE);
    s.m.up(...TITLE);
    const field = editorOf(s.view);
    if (!field) throw new Error("the editor did not open");
    return { ...s, id, field };
  }

  it("a double-click on the title opens the editor over the title with the text selected; Enter commits one rename", async () => {
    const { model, view, id, field } = await openByDoubleClick();
    expect(field.value).toBe("Group");
    expect(field.selectionEnd).toBe(5);
    const rect = field.getBoundingClientRect();
    const origin = view.element.getBoundingClientRect();
    expect(rect.left - origin.left).toBeCloseTo(64, 0);
    expect(rect.top - origin.top).toBeCloseTo(50, 0);
    // No frame of its own: focus shows as the caret and the selected text.
    const look = getComputedStyle(field);
    expect(look.outlineStyle).toBe("none");
    expect(look.borderTopWidth).toBe("0px");
    expect(look.caretColor).not.toBe(look.color);
    expect(view.element.ownerDocument.activeElement).toBe(field);
    await userEvent.keyboard("Pumps{Enter}");
    expect(model.reader.getGroup(id)?.title).toBe("Pumps");
    expect(model.historyState().undoLabel).toBe("Rename group");
    await chord("z");
    expect(model.reader.getGroup(id)?.title).toBe("Group");
  });

  it("Escape closes the editor without a change and without a history entry", async () => {
    const { model, view, id } = await openByDoubleClick();
    const before = model.historyState().undoLabel;
    await userEvent.keyboard("Discarded{Escape}");
    expect(editorOf(view)).toBeNull();
    expect(model.reader.getGroup(id)?.title).toBe("Group");
    expect(model.historyState().undoLabel).toBe(before);
    expect(view.selection.groups()).toEqual([id]);
  });

  it("letters and Delete typed in the editor edit the text and run no graph command", async () => {
    const { model, view, field } = await openByDoubleClick();
    view.selection.add([selNode("a")]);
    await userEvent.keyboard("rm{Backspace}{Delete}");
    expect(field.value).toBe("r");
    expect(model.reader.getNode(N("a"))?.rotation).toBe(0);
    expect(model.reader.getNode(N("a"))?.mirrored).toBe(false);
    expect(model.reader.nodes()).toHaveLength(3);
  });

  it("an unchanged title adds no history entry, and moving focus out commits", async () => {
    const first = await openByDoubleClick();
    const before = first.model.historyState().undoLabel;
    await userEvent.keyboard("{Enter}");
    expect(first.model.historyState().undoLabel).toBe(before);
    const second = await openByDoubleClick();
    await userEvent.keyboard("Tanks");
    second.field.blur();
    expect(second.model.reader.getGroup(second.id)?.title).toBe("Tanks");
    expect(editorOf(second.view)).toBeNull();
  });

  it("a press on the canvas closes the editor and commits the text before the drag it starts", async () => {
    const { model, view, m, id } = await openByDoubleClick();
    await userEvent.keyboard("Pumps");
    m.drag([200, 100], [450, 300]);
    expect(editorOf(view)).toBeNull();
    expect(model.reader.getGroup(id)?.title).toBe("Pumps");
    expect(members(model, id)).toEqual([N("a")]);
  });

  it("the editor closes when its group is removed", async () => {
    const { model, view, id } = await openByDoubleClick();
    model.ungroup([id]);
    expect(editorOf(view)).toBeNull();
    expect(model.reader.groups()).toEqual([]);
  });

  it("F2 opens the editor on the one selected group", async () => {
    const { model, view } = setup();
    const id = group(model, ["a", "b"]);
    view.selection.replace([{ kind: "group", id }]);
    await userEvent.keyboard("{F2}");
    expect(editorOf(view)).not.toBeNull();
    await userEvent.keyboard("Named{Enter}");
    expect(model.reader.getGroup(id)?.title).toBe("Named");
  });

  it("with the built-in editor off, the double-click raises an event with the title strip's rectangle and opens no field", async () => {
    const { model, view, m } = setup({
      input: { toolOptions: { groups: { titleEditor: false } } },
    });
    const id = group(model, ["a", "b"]);
    await frames();
    const seen: unknown[] = [];
    view.on("group-title-edit", (e) => seen.push(e));
    m.down(...TITLE);
    m.up(...TITLE);
    m.down(...TITLE);
    m.up(...TITLE);
    expect(editorOf(view)).toBeNull();
    const origin = view.element.getBoundingClientRect();
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      group: id,
      title: "Group",
      rect: { left: origin.left + 64, top: origin.top + 50, height: 24 },
    });
    // The first click selected the group, so the host commits with the rename command.
    expect(view.selection.groups()).toEqual([id]);
    expect(view.commands.run("group.rename", { title: "Host named" }).ok).toBe(
      true,
    );
    expect(model.reader.getGroup(id)?.title).toBe("Host named");
  });
});

describe("groups survive save and reload", () => {
  it("a locked, named group with its members comes back from an exported snapshot", async () => {
    const { model } = setup();
    const id = group(model, ["a", "b"]);
    model.renameGroup(id, "Kept");
    model.setGroupLocked(id, true);
    const fresh = clipboardModel([], []);
    expect(loadSnapshot(fresh, exportSnapshot(model)).ok).toBe(true);
    expect(fresh.reader.getGroup(id)).toEqual({
      id,
      title: "Kept",
      locked: true,
    });
    expect(members(fresh, id)).toEqual([N("a"), N("b")]);
    const host = makeHost(600, 400);
    const view = mountView(host, { model: fresh });
    cleanup(() => view.dispose());
    const errors: unknown[] = [];
    view.on("paint-error", (e) => errors.push(e.error));
    await frames();
    expect(errors).toEqual([]);
  });
});
