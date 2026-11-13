import { describe, expect, it } from "vitest";
import { type GroupId, type NodeId, nodeId } from "../../../core/index.js";
import {
  cornerNode,
  cornerOf,
  createToolHarness,
  type ToolHarness,
} from "../../test-support/tool-harness.js";
import { groupKey, nodeKey } from "../selection/selection-model.js";
import type { ToolOptionsInput } from "./thresholds.js";

const N = (id: string): NodeId => nodeId(id);

function group(h: ToolHarness, ids: readonly string[], locked = false) {
  const made = h.model.groupNodes(ids.map(N));
  if (made.status !== "accepted") throw new Error("group failed");
  const id = made.changed.groups[0] as GroupId;
  if (locked) h.model.setGroupLocked(id, true);
  return id;
}

const members = (h: ToolHarness, id: GroupId) =>
  h.model.reader.groupMembers(id).map((n) => n.id);

/**
 * a and b side by side in one group; c and d free. Nodes are 40 x 20 with their top-left
 * corner at the given point, so the group's frame spans x -16..156 and y -40..36, with
 * the title strip above y -16 and the lock icon around (144, -28).
 */
function setup(options: ToolOptionsInput = {}, locked = false) {
  const h = createToolHarness({
    nodes: [
      cornerNode("a", 0, 0),
      cornerNode("b", 100, 0),
      cornerNode("c", 300, 0),
      cornerNode("d", 300, 200),
    ],
    options,
  });
  const id = group(h, ["a", "b"], locked);
  return { h, id };
}

const TITLE = { x: 70, y: -30 };
const LOCK = { x: 144, y: -28 };
const BLANK_INSIDE = { x: 70, y: 10 };

/** Press at `from`, drag to `to` in two steps and release. */
function drag(
  h: ToolHarness,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  h.down(from);
  h.move({ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 });
  h.move(to);
  h.up(to);
}

describe("group selection and movement", () => {
  it("a click on the title strip selects the group and not its members", () => {
    const { h, id } = setup();
    h.down(TITLE);
    h.up(TITLE);
    expect(h.selection.keys()).toEqual([groupKey(id)]);
    expect(h.log.commits).toEqual([]);
  });

  it("a click on the border selects the group; Shift adds it to selected nodes", () => {
    const { h, id } = setup();
    h.selection.replace([nodeKey(N("c"))]);
    h.down({ x: 70, y: 36 }, { modifiers: { shift: true } });
    h.up({ x: 70, y: 36 }, { modifiers: { shift: true } });
    expect(h.selection.keys()).toEqual([nodeKey(N("c")), groupKey(id)]);
  });

  it("a press on a node inside the frame picks the node, not the group", () => {
    const { h } = setup();
    h.down({ x: 20, y: 10 });
    h.up({ x: 20, y: 10 });
    expect(h.selection.keys()).toEqual([nodeKey(N("a"))]);
  });

  it("dragging the frame by its title strip moves all members by the same offset in one command, and one undo moves them back", () => {
    const { h } = setup();
    drag(h, TITLE, { x: TITLE.x + 40, y: TITLE.y });
    expect(h.log.commits).toHaveLength(1);
    expect(h.log.commits[0]).toMatchObject({ kind: "moveNodes" });
    expect(cornerOf(h, "a")).toEqual({ x: 40, y: 0 });
    expect(cornerOf(h, "b")).toEqual({ x: 140, y: 0 });
    expect(cornerOf(h, "c")).toEqual({ x: 300, y: 0 });
    h.model.undo();
    expect(cornerOf(h, "a")).toEqual({ x: 0, y: 0 });
    expect(cornerOf(h, "b")).toEqual({ x: 100, y: 0 });
  });

  it("a drag from a blank spot inside the frame pans like empty canvas and moves no node", () => {
    const { h } = setup();
    drag(h, BLANK_INSIDE, { x: BLANK_INSIDE.x + 50, y: BLANK_INSIDE.y });
    expect(h.log.commits).toEqual([]);
    expect(h.viewport().panX).toBeGreaterThan(0);
    expect(h.selection.size).toBe(0);
  });

  it("a marquee that covers the whole frame selects the group with its nodes", () => {
    const { h, id } = setup();
    h.down({ x: -30, y: -60 }, { modifiers: { shift: true } });
    h.move({ x: 200, y: 60 }, { modifiers: { shift: true } });
    h.up({ x: 200, y: 60 }, { modifiers: { shift: true } });
    expect(h.selection.keys()).toEqual([
      nodeKey(N("a")),
      nodeKey(N("b")),
      groupKey(id),
    ]);
  });

  it("with group interaction turned off a press on a title strip is a press on empty canvas", () => {
    const { h } = setup({ groups: false });
    drag(h, TITLE, { x: TITLE.x + 30, y: TITLE.y });
    expect(h.selection.size).toBe(0);
    expect(h.log.commits).toEqual([]);
    expect(h.viewport().panX).toBeGreaterThan(0);
  });

  it("the selection drops a group that is removed", () => {
    const { h, id } = setup();
    h.selection.replace([groupKey(id)]);
    h.model.ungroup([id]);
    expect(h.selection.size).toBe(0);
  });
});

describe("group lock", () => {
  it("dragging one member of a locked group moves every member by the same offset in one command", () => {
    const { h } = setup({}, true);
    drag(h, { x: 20, y: 10 }, { x: 60, y: 10 });
    expect(h.log.commits).toHaveLength(1);
    expect(h.log.submits[0]?.status).toBe("accepted");
    expect(cornerOf(h, "a")).toEqual({ x: 40, y: 0 });
    expect(cornerOf(h, "b")).toEqual({ x: 140, y: 0 });
  });

  it("a free node dropped on a locked group moves and does not join", () => {
    const { h, id } = setup({}, true);
    drag(h, { x: 320, y: 10 }, { x: 120, y: 10 });
    expect(cornerOf(h, "c")).toEqual({ x: 100, y: 0 });
    expect(members(h, id)).toEqual([N("a"), N("b")]);
  });

  it("a locked group whose member may not move stays in place as a whole", () => {
    const { h } = setup({}, true);
    h.model.submit({
      ops: [
        {
          op: "update",
          entity: "node",
          id: N("b"),
          fields: { capabilities: { new: { move: false } } },
        },
      ],
    });
    drag(h, { x: 20, y: 10 }, { x: 60, y: 10 });
    expect(h.log.commits).toEqual([]);
    expect(cornerOf(h, "a")).toEqual({ x: 0, y: 0 });
    const preview = h.log.previews.find((p) => p?.kind === "move");
    expect(preview).toMatchObject({ moving: [] });
    expect(
      [...(preview?.kind === "move" ? preview.locked : [])].sort(),
    ).toEqual([N("a"), N("b")]);
  });

  it("a click on the padlock locks the group as one undoable edit", () => {
    const { h, id } = setup();
    h.down(LOCK);
    h.up(LOCK);
    expect(h.log.commits).toEqual([
      { kind: "setGroupLocked", group: id, locked: true },
    ]);
    expect(h.model.reader.getGroup(id)?.locked).toBe(true);
    expect(h.selection.size).toBe(0);
    h.model.undo();
    expect(h.model.reader.getGroup(id)?.locked).toBe(false);
    h.down(LOCK);
    h.up(LOCK);
    h.down(LOCK);
    h.up(LOCK);
    expect(h.model.reader.getGroup(id)?.locked).toBe(false);
  });

  it("a press on the padlock that is dragged away toggles nothing", () => {
    const { h, id } = setup();
    h.down(LOCK);
    h.move({ x: LOCK.x + 30, y: LOCK.y });
    h.up({ x: LOCK.x + 30, y: LOCK.y });
    expect(h.log.commits).toEqual([]);
    expect(h.model.reader.getGroup(id)?.locked).toBe(false);
  });

  it("a double-click on the frame does not toggle the lock", () => {
    const { h, id } = setup();
    for (const at of [TITLE, { x: 70, y: 36 }]) {
      h.down(at);
      h.up(at);
      h.down(at);
      h.up(at);
    }
    expect(h.model.reader.getGroup(id)?.locked).toBe(false);
    expect(h.log.commits).toEqual([]);
  });
});

describe("group title is shown and editable: the pointer part", () => {
  it("a double-click on the title strip asks for the title editor; a single click only selects", () => {
    const { h, id } = setup();
    h.down(TITLE);
    h.up(TITLE);
    expect(h.log.titleEdits).toEqual([]);
    h.down(TITLE);
    h.up(TITLE);
    expect(h.log.titleEdits).toEqual([id]);
    expect(h.selection.keys()).toEqual([groupKey(id)]);
  });

  it("two presses far apart on the strip are two clicks, not a double-click", () => {
    const { h } = setup();
    h.down(TITLE);
    h.up(TITLE);
    h.down({ x: TITLE.x - 40, y: TITLE.y });
    h.up({ x: TITLE.x - 40, y: TITLE.y });
    expect(h.log.titleEdits).toEqual([]);
  });
});

describe("drop to join and drag out to leave", () => {
  it("a free node dropped overlapping a group's frame joins it, and one undo returns it to its place outside the group", () => {
    const { h, id } = setup();
    drag(h, { x: 320, y: 10 }, { x: 120, y: 30 });
    expect(h.log.commits).toHaveLength(1);
    expect(h.log.commits[0]).toMatchObject({
      kind: "moveNodes",
      membership: [{ node: N("c"), group: id }],
    });
    expect(members(h, id)).toEqual([N("a"), N("b"), N("c")]);
    const frame = h.scene.group(id)?.frame;
    expect(frame && frame.y + frame.h).toBe(56);
    h.model.undo();
    expect(members(h, id)).toEqual([N("a"), N("b")]);
    expect(cornerOf(h, "c")).toEqual({ x: 300, y: 0 });
    expect(h.model.reader.getNode(N("c"))?.group).toBeUndefined();
  });

  it("while a free node is dragged over a frame the preview shows the frame around it, marked as joining, and the document is unchanged", () => {
    const { h, id } = setup();
    h.down({ x: 320, y: 10 });
    h.move({ x: 200, y: 10 });
    h.move({ x: 120, y: 30 });
    expect(h.log.previews.at(-1)).toMatchObject({
      kind: "move",
      groups: [{ group: id, members: [N("a"), N("b"), N("c")], joining: true }],
    });
    expect(members(h, id)).toEqual([N("a"), N("b")]);
    expect(h.log.commits).toEqual([]);
  });

  it("a member dropped clear of its group's frame leaves, and one undo restores position and membership", () => {
    const { h, id } = setup();
    drag(h, { x: 120, y: 10 }, { x: 520, y: 310 });
    expect(members(h, id)).toEqual([N("a")]);
    expect(h.model.reader.getNode(N("b"))?.group).toBeUndefined();
    expect(h.scene.group(id)?.frame.w).toBe(72);
    h.model.undo();
    expect(members(h, id)).toEqual([N("a"), N("b")]);
    expect(cornerOf(h, "b")).toEqual({ x: 100, y: 0 });
  });

  it("a move that still overlaps the group's frame keeps the member, and the frame adjusts", () => {
    const { h, id } = setup();
    drag(h, { x: 120, y: 10 }, { x: 130, y: 10 });
    expect(h.log.commits[0]).not.toHaveProperty("membership");
    expect(members(h, id)).toEqual([N("a"), N("b")]);
    expect(h.scene.group(id)?.frame.w).toBe(182);
  });

  it("a member can leave one group and join another in the same drop", () => {
    const { h, id } = setup();
    const other = group(h, ["d"]);
    // d's frame spans x 284..356 and y 160..236.
    drag(h, { x: 120, y: 10 }, { x: 320, y: 200 });
    expect(members(h, id)).toEqual([N("a")]);
    expect(members(h, other)).toEqual([N("b"), N("d")]);
    expect(h.log.commits).toHaveLength(1);
  });

  it("a node overlapping two frames joins the one under the pointer, else the first in document order", () => {
    const build = () => {
      const h = createToolHarness({
        nodes: [
          cornerNode("a", 0, 0),
          cornerNode("b", 60, 0),
          cornerNode("c", 300, 0),
        ],
      });
      // Frames: first x -16..56, second x 44..116; both y -40..36.
      return { h, first: group(h, ["a"]), second: group(h, ["b"]) };
    };
    const centre = build();
    // Grabbed by its centre and dropped with the pointer below both frames.
    drag(centre.h, { x: 320, y: 10 }, { x: 50, y: 42 });
    expect(members(centre.h, centre.first)).toEqual([N("a"), N("c")]);
    const corner = build();
    // Grabbed right of its centre and dropped with the pointer inside the second frame.
    drag(corner.h, { x: 325, y: 3 }, { x: 60, y: 31 });
    expect(members(corner.h, corner.second)).toEqual([N("b"), N("c")]);
    expect(members(corner.h, corner.first)).toEqual([N("a")]);
  });

  it("when every member moves, nobody leaves the group", () => {
    const { h, id } = setup();
    drag(h, TITLE, { x: TITLE.x + 900, y: TITLE.y + 900 });
    expect(members(h, id)).toEqual([N("a"), N("b")]);
    expect(h.log.commits[0]).not.toHaveProperty("membership");
  });

  it("Escape during the drag returns the node and changes no membership", () => {
    const { h, id } = setup();
    h.down({ x: 320, y: 10 });
    h.move({ x: 200, y: 10 });
    h.move({ x: 120, y: 30 });
    h.send({ type: "cancel", reason: "escape" });
    h.up({ x: 120, y: 30 });
    expect(h.log.commits).toEqual([]);
    expect(h.log.previews.at(-1)).toBeNull();
    expect(members(h, id)).toEqual([N("a"), N("b")]);
    expect(cornerOf(h, "c")).toEqual({ x: 300, y: 0 });
  });

  it("with drag membership off the node moves and the group's membership is unchanged, while frames still follow their members", () => {
    const { h, id } = setup({ groups: { dragMembership: false } });
    drag(h, { x: 320, y: 10 }, { x: 120, y: 30 });
    expect(cornerOf(h, "c")).toEqual({ x: 100, y: 20 });
    expect(members(h, id)).toEqual([N("a"), N("b")]);
    drag(h, { x: 120, y: 10 }, { x: 520, y: 310 });
    expect(members(h, id)).toEqual([N("a"), N("b")]);
    const shown = h.log.previews.filter((p) => p !== null).at(-1);
    expect(shown).toMatchObject({
      groups: [{ group: id, joining: false }],
    });
  });

  it("two hundred pointer moves over a frame still commit exactly one command", () => {
    const { h, id } = setup();
    h.down({ x: 320, y: 10 });
    for (let i = 1; i <= 200; i++) h.move({ x: 320 - i, y: 10 + i / 10 });
    h.up({ x: 120, y: 30 });
    expect(h.log.commits).toHaveLength(1);
    expect(members(h, id)).toEqual([N("a"), N("b"), N("c")]);
    expect(h.model.historyState().undoLabel).toBe("Move");
  });
});
