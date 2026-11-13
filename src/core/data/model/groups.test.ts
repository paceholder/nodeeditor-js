import { describe, expect, it } from "vitest";
import { groupId, nodeId } from "../../base/ids/ids.js";
import { MisuseError } from "../../base/result.js";
import { createGraphReader } from "./reader.js";
import { createGraphStore } from "./store.js";
import { mkGroup, mkNode } from "./test-helpers.js";
import { validateGroupRecord } from "./validate-group.js";
import { validateNodeRecord } from "./validate-records.js";

const g1 = groupId("g1");
const g2 = groupId("g2");

function build() {
  const store = createGraphStore();
  store.batch((tx) => {
    tx.putGroup(mkGroup("g2", { title: "Second" }));
    tx.putGroup(mkGroup("g1", { title: "First" }));
    tx.putNode(mkNode("n1", { group: g1 }));
    tx.putNode(mkNode("n2", { group: g2 }));
    tx.putNode(mkNode("n3", { group: g1 }));
    tx.putNode(mkNode("n4"));
  });
  return { store, reader: createGraphReader(store) };
}

describe("groups are stored in the model document", () => {
  it("lists groups in insertion order and includes them in the state snapshot", () => {
    const { reader } = build();
    expect(reader.groups().map((g) => g.id)).toEqual(["g2", "g1"]);
    expect(reader.state().groups.map((g) => g.title)).toEqual([
      "Second",
      "First",
    ]);
    expect(reader.getGroup(g1)?.title).toBe("First");
    expect(reader.idWithSeq("group", reader.seqOf(g2) ?? 0)).toBe("g2");
  });

  it("lists the members of a group in node insertion order (deterministic ordering)", () => {
    const { store, reader } = build();
    expect(reader.groupMembers(g1).map((n) => n.id)).toEqual(["n1", "n3"]);
    store.batch((tx) => tx.putNode(mkNode("n4", { group: g1 })));
    store.batch((tx) => tx.putNode(mkNode("n1", { group: g1, z: 5 })));
    expect(reader.groupMembers(g1).map((n) => n.id)).toEqual([
      "n1",
      "n3",
      "n4",
    ]);
  });

  it("moves a node between member lists when its group changes", () => {
    const { store, reader } = build();
    store.batch((tx) => tx.putNode(mkNode("n3", { group: g2 })));
    expect(reader.groupMembers(g1).map((n) => n.id)).toEqual(["n1"]);
    expect(reader.groupMembers(g2).map((n) => n.id)).toEqual(["n2", "n3"]);
  });

  it("gives a group an ID no other kind of entity uses", () => {
    const { store } = build();
    expect(() => store.batch((tx) => tx.putGroup(mkGroup("n1")))).toThrow(
      MisuseError,
    );
  });
});

describe("a node belongs to at most one group", () => {
  it("refuses a batch that leaves a group without members", () => {
    const { store } = build();
    expect(() => store.batch((tx) => tx.removeNode(nodeId("n2")))).toThrow(
      /group g2 has no members/,
    );
  });

  it("refuses a batch that leaves a node naming a missing group", () => {
    const { store } = build();
    expect(() =>
      store.batch((tx) => tx.putNode(mkNode("n4", { group: groupId("g9") }))),
    ).toThrow(/group g9/);
    const other = build();
    expect(() => other.store.batch((tx) => tx.removeGroup(g2))).toThrow(
      /removed group g2 is still named/,
    );
  });

  it("accepts removing a group together with its last member's membership", () => {
    const { store, reader } = build();
    store.batch((tx) => {
      tx.putNode(mkNode("n2"));
      tx.removeGroup(g2);
    });
    expect(reader.getGroup(g2)).toBeUndefined();
    expect(reader.getNode(nodeId("n2"))?.group).toBeUndefined();
  });
});

describe("group record validation", () => {
  it("returns a copy holding only the record's own fields", () => {
    const input = { ...mkGroup("g1", { style: "note" }), extra: 1 };
    const checked = validateGroupRecord(input);
    if (!checked.ok) throw new Error("expected ok");
    expect(checked.value).toEqual({
      id: "g1",
      title: "Group",
      locked: false,
      style: "note",
    });
    expect(checked.value).not.toBe(input);
  });

  it("rejects a title over the length limit with a reason (group title is limited in length)", () => {
    const checked = validateGroupRecord(
      mkGroup("g1", { title: "x".repeat(201) }),
    );
    expect(!checked.ok && checked.rejection.code).toBe("out-of-range");
  });

  it("rejects a malformed ID, a missing title and a non-boolean lock", () => {
    const code = (input: unknown) => {
      const r = validateGroupRecord(input);
      return r.ok ? "ok" : r.rejection.code;
    };
    expect(code({ id: "a b", title: "", locked: false })).toBe("malformed-id");
    expect(code({ id: "g1", locked: false })).toBe("malformed-record");
    expect(code({ id: "g1", title: "", locked: 1 })).toBe("malformed-record");
    expect(code(null)).toBe("malformed-record");
  });

  it("keeps a node's group and rejects a malformed one", () => {
    const kept = validateNodeRecord(mkNode("n1", { group: g1 }));
    expect(kept.ok && kept.value.group).toBe("g1");
    const bad = validateNodeRecord({ ...mkNode("n1"), group: "" });
    expect(!bad.ok && bad.rejection.code).toBe("malformed-id");
  });
});
