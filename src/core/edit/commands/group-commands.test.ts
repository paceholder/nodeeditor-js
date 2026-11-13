import { describe, expect, it } from "vitest";
import type { GroupId, NodeId } from "../../base/ids/ids.js";
import type { GraphModel } from "../../graph-model.js";
import { end, make, makeModel } from "./test-kit.js";

/** Group the nodes and return the new group's ID. */
function group(model: GraphModel, nodes: readonly NodeId[], title?: string) {
  const result = model.groupNodes(nodes, title === undefined ? {} : { title });
  if (result.status !== "accepted") throw new Error("group failed");
  return result.changed.groups[0] as GroupId;
}

const shown = (model: GraphModel) =>
  JSON.stringify({ ...model.reader.state(), revision: 0 });

const members = (model: GraphModel, id: GroupId) =>
  model.reader.groupMembers(id).map((n) => n.id);

function three() {
  const model = makeModel();
  const a = make(model, "source");
  const b = make(model, "sink", 100, 0);
  const c = make(model, "source", 200, 0);
  model.connect(end(a), end(b));
  return { model, a: a.node, b: b.node, c: c.node };
}

describe("flat visual groups", () => {
  it("creates a named group with a new stable ID and exactly the listed members; one undo removes it", () => {
    const { model, a, b, c } = three();
    const before = shown(model);
    const id = group(model, [a, b, c], "Stage one");
    expect(model.reader.getGroup(id)).toEqual({
      id,
      title: "Stage one",
      locked: false,
    });
    expect(members(model, id)).toEqual([a, b, c]);
    expect(model.undo().status).toBe("accepted");
    expect(shown(model)).toBe(before);
    expect(model.redo().status).toBe("accepted");
    expect(model.reader.getGroup(id)?.title).toBe("Stage one");
  });

  it("titles a group Group when no title is given and never reuses a group ID", () => {
    const { model, a, b } = three();
    const first = group(model, [a]);
    expect(model.reader.getGroup(first)?.title).toBe("Group");
    model.ungroup([first]);
    expect(group(model, [b])).not.toBe(first);
  });

  it("ungroup removes the group and keeps the nodes, their positions and connections", () => {
    const { model, a, b } = three();
    const id = group(model, [a, b]);
    const nodes = model.reader.nodes().map((n) => n.position);
    expect(model.ungroup([id]).status).toBe("accepted");
    expect(model.reader.groups()).toEqual([]);
    expect(model.reader.nodes().map((n) => n.position)).toEqual(nodes);
    expect(model.reader.nodes().every((n) => n.group === undefined)).toBe(true);
    expect(model.reader.connections()).toHaveLength(1);
    model.undo();
    expect(members(model, id)).toEqual([a, b]);
  });

  it("grouping nodes taken from another group moves them and one undo restores both groups", () => {
    const { model, a, b, c } = three();
    const d = make(model, "sink", 300, 0).node;
    const first = group(model, [a, b, c]);
    const before = shown(model);
    const second = group(model, [a, b, d]);
    expect(members(model, first)).toEqual([c]);
    expect(members(model, second)).toEqual([a, b, d]);
    model.undo();
    expect(shown(model)).toBe(before);
  });

  it("grouping every member of a group into a new one removes the emptied group", () => {
    const { model, a, b } = three();
    const first = group(model, [a, b]);
    const second = group(model, [a, b]);
    expect(model.reader.getGroup(first)).toBeUndefined();
    expect(model.reader.groups().map((g) => g.id)).toEqual([second]);
  });

  it("reports nothing to do for an empty list and an unknown entity for a missing node", () => {
    const { model } = three();
    const none = model.groupNodes([]);
    expect(none.status === "rejected" && none.rejection.code).toBe(
      "nothing-to-do",
    );
    const missing = model.groupNodes(["nope" as NodeId]);
    expect(missing.status === "rejected" && missing.rejection.code).toBe(
      "unknown-entity",
    );
    expect(model.can({ kind: "groupNodes", nodes: [] }).available).toBe(false);
  });
});

describe("membership changes only by command or by a drop", () => {
  it("add-to-group makes the node a member and is undoable", () => {
    const { model, a, b, c } = three();
    const id = group(model, [a, b]);
    expect(model.addToGroup(id, [c]).status).toBe("accepted");
    expect(members(model, id)).toEqual([a, b, c]);
    model.undo();
    expect(members(model, id)).toEqual([a, b]);
  });

  it("remove-from-group frees the node, keeps the others and leaves its position", () => {
    const { model, a, b, c } = three();
    const id = group(model, [a, b, c]);
    const position = model.reader.getNode(b)?.position;
    expect(model.removeFromGroup([b]).status).toBe("accepted");
    expect(members(model, id)).toEqual([a, c]);
    expect(model.reader.getNode(b)?.group).toBeUndefined();
    expect(model.reader.getNode(b)?.position).toEqual(position);
  });

  it("a keyboard-style move into another group's area changes no membership", () => {
    const { model, a, b, c } = three();
    const id = group(model, [a, b]);
    model.moveNodes([{ node: c, position: { x: 50, y: 0 } }]);
    expect(members(model, id)).toEqual([a, b]);
    expect(model.reader.getNode(c)?.group).toBeUndefined();
  });
});

describe("a node belongs to at most one group", () => {
  it("removing the last member removes the group, and undo restores it with its ID, title and lock", () => {
    const { model, a } = three();
    const id = group(model, [a], "Solo");
    expect(model.removeFromGroup([a]).status).toBe("accepted");
    expect(model.reader.getGroup(id)).toBeUndefined();
    expect(model.reader.getNode(a)?.group).toBeUndefined();
    model.undo();
    expect(model.reader.getGroup(id)).toEqual({
      id,
      title: "Solo",
      locked: false,
    });
    expect(members(model, id)).toEqual([a]);
  });

  it("add-to-group that drains another group removes the drained group in the same edit", () => {
    const { model, a, b } = three();
    const first = group(model, [a]);
    const second = group(model, [b]);
    const entries: number[] = [];
    model.on("change", (e) => entries.push(e.patch.ops.length));
    expect(model.addToGroup(second, [a]).status).toBe("accepted");
    expect(model.reader.getGroup(first)).toBeUndefined();
    expect(entries).toEqual([2]);
  });
});

describe("group title and lock by command", () => {
  it("renames a group as one undoable edit and adds no history entry for the same title", () => {
    const { model, a } = three();
    const id = group(model, [a], "Old");
    expect(model.renameGroup(id, "New").status).toBe("accepted");
    expect(model.reader.getGroup(id)?.title).toBe("New");
    const label = model.historyState().undoLabel;
    expect(label).toBe("Rename group");
    model.undo();
    expect(model.reader.getGroup(id)?.title).toBe("Old");
    const before = model.historyState().undoLabel;
    expect(model.renameGroup(id, "Old").status).toBe("accepted");
    expect(model.historyState().undoLabel).toBe(before);
  });

  it("rejects a title over the length limit with a reason", () => {
    const { model, a } = three();
    const id = group(model, [a]);
    const long = model.renameGroup(id, "x".repeat(201));
    expect(long.status === "rejected" && long.rejection.code).toBe(
      "out-of-range",
    );
    const created = model.groupNodes([a], { title: "x".repeat(201) });
    expect(created.status === "rejected" && created.rejection.code).toBe(
      "out-of-range",
    );
  });

  it("locks and unlocks a group as undoable edits; a new group starts unlocked", () => {
    const { model, a } = three();
    const id = group(model, [a]);
    expect(model.reader.getGroup(id)?.locked).toBe(false);
    model.setGroupLocked(id, true);
    expect(model.reader.getGroup(id)?.locked).toBe(true);
    model.undo();
    expect(model.reader.getGroup(id)?.locked).toBe(false);
  });

  it("a locked group accepts and releases no node by command, but can be renamed, unlocked and ungrouped", () => {
    const { model, a, b, c } = three();
    const id = group(model, [a, b]);
    model.setGroupLocked(id, true);
    for (const result of [
      model.addToGroup(id, [c]),
      model.removeFromGroup([a]),
      model.groupNodes([a, c]),
    ]) {
      expect(result.status === "rejected" && result.rejection.code).toBe(
        "group-locked",
      );
      expect(result.status === "rejected" && result.rejection.entities).toEqual(
        [id],
      );
    }
    expect(members(model, id)).toEqual([a, b]);
    expect(model.renameGroup(id, "Still editable").status).toBe("accepted");
    expect(model.ungroup([id]).status).toBe("accepted");
    expect(model.reader.groups()).toEqual([]);
  });
});

describe("capabilities and read-only mode", () => {
  it("every group command is unavailable in read-only mode", () => {
    const seed = three();
    const id = group(seed.model, [seed.a]);
    const { nodes, ports, connections, groups } = seed.model.reader.state();
    const model = makeModel({ readOnly: true });
    model.replaceDocument({
      nodes,
      ports,
      connections,
      groups,
      idCursor: seed.model.idCursor(),
    });
    expect(model.reader.groupMembers(id)).toHaveLength(1);
    for (const command of [
      { kind: "groupNodes", nodes: [seed.b] },
      { kind: "ungroup", groups: [id] },
      { kind: "addToGroup", group: id, nodes: [seed.b] },
      { kind: "removeFromGroup", nodes: [seed.a] },
      { kind: "renameGroup", group: id, title: "x" },
      { kind: "setGroupLocked", group: id, locked: true },
    ] as const) {
      const availability = model.can(command);
      expect(!availability.available && availability.rejection.code).toBe(
        "capability-denied",
      );
      const result = model.execute(command);
      expect(result.status === "rejected" && result.rejection.code).toBe(
        "capability-denied",
      );
    }
  });
});
