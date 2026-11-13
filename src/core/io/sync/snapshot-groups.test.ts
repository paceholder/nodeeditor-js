import { describe, expect, it } from "vitest";
import { groupId, nodeId } from "../../base/ids/ids.js";
import { hostSnapshot, seededModel, watch } from "./test-kit.js";

const g1 = groupId("G1");

/** The host's snapshot with A and B in one group. */
const withGroup = (title = "Hosted") => ({
  ...hostSnapshot((s) => {
    s.nodes = s.nodes.map((n) => ({ ...n, group: "G1" }));
  }),
  groups: [{ id: "G1", title }],
});

describe("groups in the snapshot: a host that pushes snapshots", () => {
  it("a pushed snapshot in which two nodes name a new group adds the group, with no local undo entry", () => {
    const { model } = seededModel();
    const seen = watch(model);
    const pushed = model.pushSnapshot(withGroup());
    expect(pushed.status).toBe("applied");
    expect(model.reader.getGroup(g1)).toEqual({
      id: "G1",
      title: "Hosted",
      locked: false,
    });
    expect(model.reader.groupMembers(g1).map((n) => n.id)).toEqual(["A", "B"]);
    expect(model.historyState().canUndo).toBe(false);
    expect(seen.changes.at(-1)?.origin).toBe("external");
    expect(seen.changes.at(-1)?.changed.groups).toEqual(["G1"]);
  });

  it("a later push renames the group, and a push without it removes it", () => {
    const { model } = seededModel();
    model.pushSnapshot(withGroup());
    model.pushSnapshot(withGroup("Renamed"));
    expect(model.reader.getGroup(g1)?.title).toBe("Renamed");
    model.pushSnapshot(hostSnapshot());
    expect(model.reader.groups()).toEqual([]);
    expect(model.reader.getNode(nodeId("A"))?.group).toBeUndefined();
  });

  it("a local group edit is shown at once and submitted to the host as one patch", () => {
    const { model, host } = seededModel();
    const result = model.groupNodes([nodeId("A"), nodeId("B")], {
      title: "Mine",
    });
    expect(result.status).toBe("pending");
    expect(model.reader.groups().map((g) => g.title)).toEqual(["Mine"]);
    expect(host.calls).toHaveLength(1);
    expect(host.calls[0]?.patch.ops.map((o) => `${o.op}:${o.entity}`)).toEqual([
      "add:group",
      "update:node",
      "update:node",
    ]);
  });

  it("refuses a pushed snapshot whose node names a missing group and keeps the shown state", () => {
    const { model } = seededModel();
    const broken = { ...withGroup(), groups: [] };
    const pushed = model.pushSnapshot(broken);
    expect(pushed.status).toBe("refused");
    expect(model.reader.groups()).toEqual([]);
    expect(model.reader.nodes()).toHaveLength(2);
  });
});
