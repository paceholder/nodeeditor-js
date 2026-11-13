import { describe, expect, it } from "vitest";
import type { GroupId, NodeId } from "../../base/ids/ids.js";
import type { GraphModel } from "../../graph-model.js";
import { make, makeModel } from "./test-kit.js";

function group(model: GraphModel, nodes: readonly NodeId[]) {
  const result = model.groupNodes(nodes);
  if (result.status !== "accepted") throw new Error("group failed");
  return result.changed.groups[0] as GroupId;
}

const shown = (model: GraphModel) =>
  JSON.stringify({ ...model.reader.state(), revision: 0 });

function three() {
  const model = makeModel();
  const a = make(model, "source").node;
  const b = make(model, "sink", 100, 0).node;
  const c = make(model, "source", 200, 0).node;
  return { model, a, b, c };
}

describe("one history entry per gesture: a move with membership", () => {
  it("moves a node and joins it to a group in one patch, and one undo restores both", () => {
    const { model, a, b, c } = three();
    const id = group(model, [a, b]);
    const before = shown(model);
    const patches: number[] = [];
    model.on("change", () => patches.push(1));
    const result = model.execute({
      kind: "moveNodes",
      moves: [{ node: c, position: { x: 50, y: 10 } }],
      membership: [{ node: c, group: id }],
    });
    expect(result.status).toBe("accepted");
    expect(patches).toHaveLength(1);
    expect(model.reader.getNode(c)).toMatchObject({
      position: { x: 50, y: 10 },
      group: id,
    });
    model.undo();
    expect(shown(model)).toBe(before);
  });

  it("frees a node with a null group and removes a group left empty in the same patch", () => {
    const { model, a, b } = three();
    const id = group(model, [a]);
    const result = model.execute({
      kind: "moveNodes",
      moves: [{ node: a, position: { x: 500, y: 0 } }],
      membership: [
        { node: a, group: null },
        { node: b, group: null },
      ],
    });
    expect(result.status).toBe("accepted");
    expect(model.reader.getGroup(id)).toBeUndefined();
    model.undo();
    expect(model.reader.groupMembers(id).map((n) => n.id)).toEqual([a]);
    expect(model.reader.getNode(a)?.position).toEqual({ x: 0, y: 0 });
  });

  it("rejects a membership entry for a missing node or group", () => {
    const { model, a } = three();
    const node = model.execute({
      kind: "moveNodes",
      moves: [],
      membership: [{ node: "nope" as NodeId, group: null }],
    });
    expect(node.status === "rejected" && node.rejection.code).toBe(
      "unknown-entity",
    );
    const missing = model.execute({
      kind: "moveNodes",
      moves: [],
      membership: [{ node: a, group: "g99" as GroupId }],
    });
    expect(missing.status === "rejected" && missing.rejection.code).toBe(
      "unknown-entity",
    );
  });
});

describe("group lock", () => {
  it("rejects a move of only some members of a locked group with a reason naming the lock", () => {
    const { model, a, b } = three();
    const id = group(model, [a, b]);
    model.setGroupLocked(id, true);
    const partial = model.moveNodes([{ node: a, position: { x: 5, y: 5 } }]);
    expect(partial.status === "rejected" && partial.rejection.code).toBe(
      "group-locked",
    );
    expect(partial.status === "rejected" && partial.rejection.entities).toEqual(
      [id],
    );
    expect(model.reader.getNode(a)?.position).toEqual({ x: 0, y: 0 });
  });

  it("moves a locked group when every member is listed, and an unlocked group member alone", () => {
    const { model, a, b } = three();
    const id = group(model, [a, b]);
    model.setGroupLocked(id, true);
    const whole = model.moveNodes([
      { node: a, position: { x: 40, y: 0 } },
      { node: b, position: { x: 140, y: 0 } },
    ]);
    expect(whole.status).toBe("accepted");
    model.setGroupLocked(id, false);
    expect(
      model.moveNodes([{ node: a, position: { x: 0, y: 0 } }]).status,
    ).toBe("accepted");
  });

  it("rejects joining or leaving a locked group through a move", () => {
    const { model, a, b, c } = three();
    const id = group(model, [a, b]);
    model.setGroupLocked(id, true);
    const joins = model.execute({
      kind: "moveNodes",
      moves: [{ node: c, position: { x: 50, y: 0 } }],
      membership: [{ node: c, group: id }],
    });
    expect(joins.status === "rejected" && joins.rejection.code).toBe(
      "group-locked",
    );
    expect(model.reader.getNode(c)?.position).toEqual({ x: 200, y: 0 });
  });
});

describe("atomic delete with groups", () => {
  it("deleting every member removes the nodes and the group in one patch; one undo restores all with their IDs", () => {
    const { model, a, b, c } = three();
    const id = group(model, [a, b]);
    const before = shown(model);
    const patches: number[] = [];
    model.on("change", () => patches.push(1));
    expect(model.deleteEntities({ nodes: [a, b] }).status).toBe("accepted");
    expect(patches).toHaveLength(1);
    expect(model.reader.getGroup(id)).toBeUndefined();
    expect(model.reader.nodes().map((n) => n.id)).toEqual([c]);
    model.undo();
    expect(shown(model)).toBe(before);
  });

  it("deleting one member keeps the group with the others", () => {
    const { model, a, b } = three();
    const id = group(model, [a, b]);
    model.deleteEntities({ nodes: [a] });
    expect(model.reader.groupMembers(id).map((n) => n.id)).toEqual([b]);
  });

  it("deleting a group alone removes only the frame and keeps its nodes (flat visual groups)", () => {
    const { model, a, b } = three();
    const id = group(model, [a, b]);
    expect(model.deleteEntities({ groups: [id] }).status).toBe("accepted");
    expect(model.reader.groups()).toEqual([]);
    expect(model.reader.nodes()).toHaveLength(3);
    expect(model.reader.getNode(a)?.group).toBeUndefined();
    expect(model.historyState().undoLabel).toBe("Ungroup");
  });

  it("deleting a group together with one of its members frees the survivor", () => {
    const { model, a, b } = three();
    const id = group(model, [a, b]);
    expect(model.deleteEntities({ nodes: [a], groups: [id] }).status).toBe(
      "accepted",
    );
    expect(model.reader.getNode(b)?.group).toBeUndefined();
    expect(model.reader.groups()).toEqual([]);
  });

  it("deleting a member of a locked group is allowed", () => {
    const { model, a, b } = three();
    const id = group(model, [a, b]);
    model.setGroupLocked(id, true);
    expect(model.deleteEntities({ nodes: [a] }).status).toBe("accepted");
    expect(model.reader.groupMembers(id)).toHaveLength(1);
  });
});
