import { describe, expect, it } from "vitest";
import { type GroupId, nodeId } from "../../../core/index.js";
import {
  cornerNode,
  createToolHarness,
  type HarnessOptions,
} from "../../test-support/tool-harness.js";
import { clipboardModel } from "../clipboard/clipboard-fixtures.js";
import { createClipboardService } from "../clipboard/clipboard-service.js";
import {
  connectionKey,
  groupKey,
  nodeKey,
} from "../selection/selection-model.js";
import { COMMAND_IDS, registerBuiltinCommands } from "./builtin-commands.js";
import { createCommandRegistry } from "./command-registry.js";
import { createKeymap, type KeyLike } from "./keymap.js";
import { createViewCommands } from "./view-commands.js";

const N = nodeId;

/** The same three nodes in a model whose node type is registered, so they can be pasted. */
const pastable = (): HarnessOptions => ({
  model: clipboardModel(
    [cornerNode("a", 0, 0), cornerNode("b", 100, 0), cornerNode("c", 300, 0)],
    [["c1", "a", "aR", "b", "bL"]],
  ),
});

function setup(opts: HarnessOptions = {}, editor = true) {
  const h = createToolHarness({
    nodes: [
      cornerNode("a", 0, 0),
      cornerNode("b", 100, 0),
      cornerNode("c", 300, 0),
    ],
    connections: [["c1", "a", "aR", "b", "bL"]],
    ...opts,
  });
  const view = createViewCommands({
    reader: h.model.reader,
    scene: h.scene,
    selection: h.selection,
    viewport: {
      get: () => ({ zoom: 1, panX: 0, panY: 0 }),
      set: (v) => ({ ok: true, value: v }),
    },
    size: () => ({ width: 800, height: 600 }),
  });
  const edited: GroupId[] = [];
  const commands = createCommandRegistry(() => ({
    model: h.model,
    reader: h.model.reader,
    selection: h.selection,
    view,
    ...(editor
      ? {
          editGroupTitle: (group: GroupId) => {
            edited.push(group);
            return true;
          },
        }
      : {}),
  }));
  const clipboard = createClipboardService({
    reader: h.model.reader,
    model: h.model,
    selection: h.selection,
    pointer: () => undefined,
    system: undefined,
  });
  registerBuiltinCommands(commands, clipboard);
  const group = (ids: readonly string[]): GroupId => {
    const made = h.model.groupNodes(ids.map(N));
    if (made.status !== "accepted") throw new Error("group failed");
    return made.changed.groups[0] as GroupId;
  };
  const members = (id: GroupId) =>
    h.model.reader.groupMembers(id).map((n) => n.id);
  return { h, commands, clipboard, edited, group, members };
}

describe("group and ungroup shortcuts: the commands", () => {
  it("group.create puts every selected node into one new group, selects it and opens its title editor, as one history entry", () => {
    const { h, commands, edited, members } = setup();
    h.selection.replace([nodeKey(N("a")), nodeKey(N("b")), nodeKey(N("c"))]);
    const before = h.model.historyState().undoLabel;
    expect(commands.availability(COMMAND_IDS.group).available).toBe(true);
    expect(commands.run(COMMAND_IDS.group)).toEqual({
      ok: true,
      value: { changed: true },
    });
    const [created] = h.model.reader.groups();
    if (!created) throw new Error("no group");
    expect(members(created.id)).toEqual([N("a"), N("b"), N("c")]);
    expect(h.selection.keys()).toEqual([groupKey(created.id)]);
    expect(edited).toEqual([created.id]);
    expect(h.model.historyState().undoLabel).toBe("Group");
    h.model.undo();
    expect(h.model.reader.groups()).toEqual([]);
    expect(h.model.historyState().undoLabel).toBe(before);
  });

  it("group.create gives the same patch as the model command (unified commands)", () => {
    const viaShortcut = setup();
    viaShortcut.h.selection.replace([nodeKey(N("a")), nodeKey(N("b"))]);
    viaShortcut.commands.run(COMMAND_IDS.group, { title: "Stage" });
    const viaApi = setup();
    viaApi.h.model.groupNodes([N("a"), N("b")], { title: "Stage" });
    expect(viaShortcut.h.model.reader.state().groups).toEqual(
      viaApi.h.model.reader.state().groups,
    );
    expect(viaShortcut.h.model.reader.state().nodes).toEqual(
      viaApi.h.model.reader.state().nodes,
    );
  });

  it("with only a connection selected, group.create reports unavailable and creates nothing", () => {
    const { h, commands } = setup();
    h.selection.replace([
      connectionKey(h.model.reader.connections()[0]?.id as never),
    ]);
    const a = commands.availability(COMMAND_IDS.group);
    expect(!a.available && a.rejection.code).toBe("nothing-to-do");
    expect(commands.run(COMMAND_IDS.group).ok).toBe(false);
    expect(h.model.reader.groups()).toEqual([]);
  });

  it("group.ungroup from one selected member removes the group, keeps its nodes, and one undo restores it", () => {
    const { h, commands, group, members } = setup();
    const id = group(["a", "b"]);
    h.selection.replace([nodeKey(N("a"))]);
    expect(commands.run(COMMAND_IDS.ungroup).ok).toBe(true);
    expect(h.model.reader.groups()).toEqual([]);
    expect(h.model.reader.nodes()).toHaveLength(3);
    h.model.undo();
    expect(members(id)).toEqual([N("a"), N("b")]);
  });

  it("group.ungroup removes every selected group and the groups of selected nodes as one committed edit", () => {
    const { h, commands, group } = setup();
    const first = group(["a", "b"]);
    group(["c"]);
    h.selection.replace([groupKey(first), nodeKey(N("c"))]);
    const patches: number[] = [];
    h.model.on("change", () => patches.push(1));
    commands.run(COMMAND_IDS.ungroup);
    expect(h.model.reader.groups()).toEqual([]);
    expect(patches).toHaveLength(1);
  });

  it("with no group affected, group.ungroup reports unavailable", () => {
    const { h, commands } = setup();
    h.selection.replace([nodeKey(N("a"))]);
    const a = commands.availability(COMMAND_IDS.ungroup);
    expect(!a.available && a.rejection.code).toBe("nothing-to-do");
  });

  it("both commands are refused on a read-only model with the capability reason", () => {
    const seeded = setup();
    seeded.group(["a", "b"]);
    const { nodes, ports, connections, groups } = seeded.h.model.reader.state();
    const ro = setup({
      nodes: [],
      connections: [],
      modelOptions: { readOnly: true },
    });
    ro.h.model.replaceDocument({
      nodes,
      ports,
      connections,
      groups,
      idCursor: seeded.h.model.idCursor(),
    });
    ro.h.selection.replace([nodeKey(N("a")), nodeKey(N("c"))]);
    for (const id of [COMMAND_IDS.group, COMMAND_IDS.ungroup]) {
      const a = ro.commands.availability(id);
      expect(!a.available && a.rejection.code).toBe("capability-denied");
    }
  });
});

describe("group title is shown and editable: the commands", () => {
  it("group.rename with a title renames the one selected group as one undoable edit", () => {
    const { h, commands, group } = setup();
    const id = group(["a", "b"]);
    h.selection.replace([groupKey(id)]);
    expect(commands.run(COMMAND_IDS.renameGroup, { title: "Inlet" }).ok).toBe(
      true,
    );
    expect(h.model.reader.getGroup(id)?.title).toBe("Inlet");
    h.model.undo();
    expect(h.model.reader.getGroup(id)?.title).toBe("Group");
  });

  it("group.rename without a title opens the editor on the selected group and changes nothing", () => {
    const { h, commands, edited, group } = setup();
    const id = group(["a", "b"]);
    h.selection.replace([groupKey(id)]);
    const before = h.model.historyState().undoLabel;
    expect(commands.run(COMMAND_IDS.renameGroup)).toEqual({
      ok: true,
      value: { changed: false },
    });
    expect(edited).toEqual([id]);
    expect(h.model.historyState().undoLabel).toBe(before);
  });

  it("group.rename needs exactly one selected group", () => {
    const { h, commands, group } = setup();
    const first = group(["a"]);
    const second = group(["b"]);
    h.selection.replace([nodeKey(N("a"))]);
    expect(commands.availability(COMMAND_IDS.renameGroup).available).toBe(
      false,
    );
    h.selection.replace([groupKey(first), groupKey(second)]);
    expect(commands.availability(COMMAND_IDS.renameGroup).available).toBe(
      false,
    );
    h.selection.replace([groupKey(first), nodeKey(N("c"))]);
    expect(commands.availability(COMMAND_IDS.renameGroup).available).toBe(true);
  });

  it("a title over the length limit is rejected with a reason", () => {
    const { h, commands, group } = setup();
    const id = group(["a"]);
    h.selection.replace([groupKey(id)]);
    const r = commands.run(COMMAND_IDS.renameGroup, { title: "x".repeat(201) });
    expect(!r.ok && r.rejection.code).toBe("out-of-range");
  });
});

describe("selection commands with groups", () => {
  it("edit.delete on a selected group removes only the frame; with its nodes selected too it removes both", () => {
    const { h, commands, group } = setup();
    const id = group(["a", "b"]);
    h.selection.replace([groupKey(id)]);
    commands.run(COMMAND_IDS.delete);
    expect(h.model.reader.groups()).toEqual([]);
    expect(h.model.reader.nodes()).toHaveLength(3);
    h.model.undo();
    h.selection.replace([groupKey(id), nodeKey(N("a")), nodeKey(N("b"))]);
    commands.run(COMMAND_IDS.delete);
    expect(h.model.reader.groups()).toEqual([]);
    expect(h.model.reader.nodes().map((n) => n.id)).toEqual([N("c")]);
  });

  it("nodes.nudge on a selected group moves all its members, and on one member of a locked group moves the whole group", () => {
    const { h, commands, group } = setup();
    const id = group(["a", "b"]);
    h.selection.replace([groupKey(id)]);
    commands.run(COMMAND_IDS.nudge, { dx: 10, dy: 0 });
    expect(h.model.reader.getNode(N("a"))?.position.x).toBe(30);
    expect(h.model.reader.getNode(N("b"))?.position.x).toBe(130);
    h.model.setGroupLocked(id, true);
    h.selection.replace([nodeKey(N("a"))]);
    expect(commands.run(COMMAND_IDS.nudge, { dx: 10, dy: 0 }).ok).toBe(true);
    expect(h.model.reader.getNode(N("b"))?.position.x).toBe(140);
  });

  it("a keyboard move into another group's frame changes no membership (membership changes only by command or by a drop)", () => {
    const { h, commands, group, members } = setup();
    const id = group(["a", "b"]);
    h.selection.replace([nodeKey(N("c"))]);
    commands.run(COMMAND_IDS.nudge, { dx: -200, dy: 0 });
    expect(members(id)).toEqual([N("a"), N("b")]);
    expect(h.model.reader.getNode(N("c"))?.group).toBeUndefined();
  });

  it("select all includes groups, and copy then paste of a selected group gives a new group that becomes the selection", () => {
    const { h, commands, group, members } = setup(pastable());
    const id = group(["a", "b"]);
    commands.run(COMMAND_IDS.selectAll);
    expect(h.selection.groupIds()).toEqual([id]);
    h.selection.replace([groupKey(id)]);
    expect(commands.run(COMMAND_IDS.copy).ok).toBe(true);
    expect(commands.run(COMMAND_IDS.paste).ok).toBe(true);
    const copy = h.model.reader.groups().find((g) => g.id !== id);
    if (!copy) throw new Error("no copy");
    expect(members(copy.id)).toHaveLength(2);
    expect(h.selection.groupIds()).toEqual([copy.id]);
    expect(members(id)).toEqual([N("a"), N("b")]);
  });

  it("cut of a selected group removes the group with its members, and duplicate copies it", () => {
    const { h, commands, group } = setup(pastable());
    const id = group(["a", "b"]);
    h.selection.replace([groupKey(id)]);
    expect(commands.run(COMMAND_IDS.duplicate).ok).toBe(true);
    expect(h.model.reader.groups()).toHaveLength(2);
    h.selection.replace([groupKey(id)]);
    expect(commands.run(COMMAND_IDS.cut).ok).toBe(true);
    expect(h.model.reader.getGroup(id)).toBeUndefined();
    expect(h.model.reader.getNode(N("a"))).toBeUndefined();
  });
});

describe("group and ungroup shortcuts: the default keymap", () => {
  const key = (k: string, mods: Partial<KeyLike> = {}): KeyLike => ({
    key: k,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...mods,
  });
  const mac = createKeymap("mac");
  const other = createKeymap("other");

  it("the primary modifier with G groups and with Shift+G ungroups, on both platforms", () => {
    expect(other.resolve(key("g", { ctrlKey: true }), 1)?.command).toBe(
      COMMAND_IDS.group,
    );
    expect(mac.resolve(key("g", { metaKey: true }), 1)?.command).toBe(
      COMMAND_IDS.group,
    );
    expect(
      other.resolve(key("G", { ctrlKey: true, shiftKey: true }), 1)?.command,
    ).toBe(COMMAND_IDS.ungroup);
    expect(
      mac.resolve(key("G", { metaKey: true, shiftKey: true }), 1)?.command,
    ).toBe(COMMAND_IDS.ungroup);
    expect(other.resolve(key("g"), 1)).toBeUndefined();
  });

  it("F2 renames, and none of the three runs again while the key is held", () => {
    expect(other.resolve(key("F2"), 1)?.command).toBe(COMMAND_IDS.renameGroup);
    for (const event of [
      key("g", { ctrlKey: true }),
      key("G", { ctrlKey: true, shiftKey: true }),
      key("F2"),
    ]) {
      expect(other.resolve(event, 1)?.repeat).toBe(false);
    }
  });

  it("works on a layout whose G key produces no Latin letter", () => {
    expect(
      other.resolve(key("п", { code: "KeyG", ctrlKey: true }), 1)?.command,
    ).toBe(COMMAND_IDS.group);
  });
});
