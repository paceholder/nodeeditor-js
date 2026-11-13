import { describe, expect, it } from "vitest";
import { groupId, nodeId } from "../../base/ids/ids.js";
import { mkGroup, mkNode } from "../model/test-helpers.js";
import { invertPatch } from "./invert.js";
import { seeded } from "./test-setup.js";
import type { Patch, PatchOp } from "./types.js";

const g1 = groupId("g1");
const n1 = nodeId("n1");
const n2 = nodeId("n2");

const join = (id: typeof n1, to: typeof g1 | undefined, from?: typeof g1) =>
  ({
    op: "update",
    entity: "node",
    id,
    fields: {
      group: {
        ...(from === undefined ? {} : { old: from }),
        ...(to === undefined ? {} : { new: to }),
      },
    },
  }) as PatchOp;

const groupBoth: Patch = {
  ops: [
    { op: "add", entity: "group", record: mkGroup("g1", { title: "Pair" }) },
    join(n1, g1),
    join(n2, g1),
  ],
};

describe("group patches (groups are stored in the model document)", () => {
  it("adds a group with its members in one atomic patch and reports what changed", () => {
    const { reader, apply } = seeded();
    const result = apply(groupBoth);
    if (!result.ok) throw new Error("expected ok");
    expect(reader.groupMembers(g1).map((n) => n.id)).toEqual(["n1", "n2"]);
    expect(result.value.changed.groups).toEqual(["g1"]);
    expect(result.value.changed.nodes).toEqual(["n1", "n2"]);
    expect(result.value.patch.ops[0]).toMatchObject({ seq: 8 });
  });

  it("updates title and lock, and refuses a stale old value", () => {
    const { reader, apply } = seeded();
    apply(groupBoth);
    const rename = apply({
      ops: [
        {
          op: "update",
          entity: "group",
          id: g1,
          fields: {
            title: { old: "Pair", new: "Renamed" },
            locked: { old: false, new: true },
          },
        },
      ],
    });
    expect(rename.ok).toBe(true);
    expect(reader.getGroup(g1)).toMatchObject({
      title: "Renamed",
      locked: true,
    });
    const stale = apply({
      ops: [
        {
          op: "update",
          entity: "group",
          id: g1,
          fields: { title: { old: "Pair", new: "Again" } },
        },
      ],
    });
    expect(!stale.ok && stale.rejection.code).toBe("conflict");
  });

  it("refuses a group ID that another entity uses", () => {
    const { apply } = seeded();
    const r = apply({
      ops: [
        { op: "add", entity: "group", record: mkGroup("n1") },
        join(n2, groupId("n1")),
      ],
    });
    expect(!r.ok && r.rejection.code).toBe("duplicate-id");
  });
});

describe("a node belongs to at most one group", () => {
  it("rejects a patch that would empty a group, naming the group, and changes nothing", () => {
    const { reader, apply } = seeded();
    apply({
      ops: [
        { op: "add", entity: "group", record: mkGroup("g1") },
        join(n1, g1),
      ],
    });
    const before = JSON.stringify(reader.state());
    const r = apply({ ops: [join(n1, undefined, g1)] });
    expect(!r.ok && r.rejection.code).toBe("dangling-reference");
    expect(!r.ok && r.rejection.entities).toContain("g1");
    expect(JSON.stringify(reader.state())).toBe(before);
  });

  it("rejects adding a group that no node names", () => {
    const { apply } = seeded();
    const r = apply({
      ops: [{ op: "add", entity: "group", record: mkGroup("g1") }],
    });
    expect(!r.ok && r.rejection.code).toBe("dangling-reference");
  });

  it("rejects a node that names a group that does not exist", () => {
    const { apply } = seeded();
    const r = apply({ ops: [join(n1, g1)] });
    expect(!r.ok && r.rejection.code).toBe("dangling-reference");
    const added = apply({
      ops: [{ op: "add", entity: "node", record: mkNode("n9", { group: g1 }) }],
    });
    expect(!added.ok && added.rejection.code).toBe("dangling-reference");
  });

  it("rejects removing a group that a node still names", () => {
    const { reader, apply } = seeded();
    apply(groupBoth);
    const record = reader.getGroup(g1);
    const seq = reader.seqOf(g1);
    if (!record || seq === undefined) throw new Error("fixture");
    const r = apply({ ops: [{ op: "remove", entity: "group", record, seq }] });
    expect(!r.ok && r.rejection.code).toBe("dangling-reference");
  });

  it("accepts removing the last member together with the group", () => {
    const { reader, apply } = seeded();
    apply(groupBoth);
    const record = reader.getGroup(g1);
    const seq = reader.seqOf(g1);
    if (!record || seq === undefined) throw new Error("fixture");
    const r = apply({
      ops: [
        join(n1, undefined, g1),
        join(n2, undefined, g1),
        { op: "remove", entity: "group", record, seq },
      ],
    });
    expect(r.ok).toBe(true);
    expect(reader.groups()).toEqual([]);
  });
});

describe("inverse patches restore groups exactly", () => {
  it("applying a group patch and then its inverse restores records and order", () => {
    const { reader, apply } = seeded();
    const shown = () => JSON.stringify({ ...reader.state(), revision: 0 });
    const before = shown();
    const applied = apply(groupBoth);
    if (!applied.ok) throw new Error("expected ok");
    const undone = apply(invertPatch(applied.value.patch));
    expect(undone.ok).toBe(true);
    expect(shown()).toBe(before);
    const redone = apply(
      invertPatch(undone.ok ? undone.value.patch : { ops: [] }),
    );
    expect(redone.ok).toBe(true);
    expect(reader.seqOf(g1)).toBe(8);
    expect(reader.groupMembers(g1)).toHaveLength(2);
  });
});
