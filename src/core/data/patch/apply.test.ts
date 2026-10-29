import { describe, expect, it } from "vitest";
import { nodeId, portId } from "../../base/ids/ids.js";
import { mkConn, mkNode, mkPort } from "../model/test-helpers.js";
import { seeded } from "./test-setup.js";
import type { Patch } from "./types.js";

const addNode = (id: string, extra = {}) =>
  ({ op: "add", entity: "node", record: mkNode(id, extra) }) as const;

describe("PAT-02 applying", () => {
  it("applies a valid patch and fills in seq on adds", () => {
    const { reader, apply } = seeded();
    const result = apply({ ops: [addNode("n3")] });
    if (!result.ok) throw new Error("expected ok");
    expect(reader.getNode(nodeId("n3"))).toBeDefined();
    expect(result.value.patch.ops[0]).toMatchObject({ seq: 8 });
    expect(result.value.changed.nodes).toEqual(["n3"]);
    expect(result.value.revision).toBe(reader.revision());
  });

  it("PAT-02 rejects a stale old value with conflict", () => {
    const { reader, apply } = seeded();
    const before = JSON.stringify(reader.state());
    const result = apply({
      ops: [
        {
          op: "update",
          entity: "node",
          id: nodeId("n1"),
          fields: { position: { old: { x: 9, y: 9 }, new: { x: 1, y: 1 } } },
        },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("conflict");
    expect(JSON.stringify(reader.state())).toBe(before);
  });

  it("PAT-02 rejects an add with an existing ID with duplicate-id", () => {
    const { apply } = seeded();
    const r = apply({ ops: [addNode("n1")] });
    expect(!r.ok && r.error.code).toBe("duplicate-id");
    // IDs are shared across kinds.
    const r2 = apply({
      ops: [{ op: "add", entity: "port", record: mkPort("n1", "n2") }],
    });
    expect(!r2.ok && r2.error.code).toBe("duplicate-id");
  });

  it("PAT-02 rejects unknown entities, immutable fields and bad records", () => {
    const { apply } = seeded();
    const code = (patch: Patch) => {
      const r = apply(patch);
      return r.ok ? "ok" : r.error.code;
    };
    const upd = (id: string, fields: object) =>
      ({
        op: "update",
        entity: "node",
        id: nodeId(id),
        fields,
      }) as unknown as Patch["ops"][number];
    expect(code({ ops: [upd("zz", {})] })).toBe("unknown-entity");
    expect(code({ ops: [upd("n1", { id: { old: "n1", new: "n7" } })] })).toBe(
      "malformed-record",
    );
    expect(code({ ops: [upd("n1", { z: { old: 0, new: Number.NaN } })] })).toBe(
      "non-finite",
    );
    expect(
      code({ ops: [{ op: "nope" } as unknown as Patch["ops"][number]] }),
    ).toBe("malformed-record");
    expect(
      code({
        ops: [
          {
            op: "remove",
            entity: "node",
            record: mkNode("n1", { ports: [portId("p1")] }),
            seq: 5,
          },
        ],
      }),
    ).toBe("conflict");
  });

  it("applies sequential updates to one entity and removes absent fields", () => {
    const { reader, apply } = seeded();
    const upd = (fields: object) =>
      ({
        op: "update",
        entity: "node",
        id: nodeId("n1"),
        fields,
      }) as unknown as Patch["ops"][number];
    const r = apply({
      ops: [
        upd({ title: { new: "A" } }),
        upd({ title: { old: "A", new: "B" } }),
      ],
    });
    expect(r.ok).toBe(true);
    expect(reader.getNode(nodeId("n1"))?.title).toBe("B");
    apply({ ops: [upd({ title: { old: "B" } })] });
    expect(reader.getNode(nodeId("n1"))).not.toHaveProperty("title");
  });

  it("TXN-01 changed IDs include both endpoint nodes of a connection", () => {
    const { apply } = seeded();
    const r = apply({
      ops: [
        {
          op: "add",
          entity: "connection",
          record: mkConn("c3", "n1", "p1", "n2", "p2"),
        },
      ],
    });
    if (!r.ok) throw new Error("expected ok");
    expect(r.value.changed).toEqual({
      nodes: ["n1", "n2"],
      ports: [],
      connections: ["c3"],
    });
  });

  it("an empty patch is accepted without changing the revision", () => {
    const { reader, apply } = seeded();
    const rev = reader.revision();
    expect(apply({ ops: [] }).ok).toBe(true);
    expect(reader.revision()).toBe(rev);
  });
});

describe("PRT-02 integrity", () => {
  it("rejects removing a connected port without its connections", () => {
    const { reader, apply } = seeded();
    const r = apply({
      ops: [
        { op: "remove", entity: "port", record: mkPort("p2", "n2"), seq: 4 },
        {
          op: "update",
          entity: "node",
          id: nodeId("n2"),
          fields: {
            ports: { old: [portId("p2"), portId("p3")], new: [portId("p3")] },
          },
        },
      ],
    });
    expect(!r.ok && r.error.code).toBe("dangling-reference");
    expect(reader.getPort(portId("p2"))).toBeDefined();
  });

  it("rejects removing a port that its node still lists", () => {
    const { apply } = seeded();
    const r = apply({
      ops: [
        {
          op: "remove",
          entity: "connection",
          record: mkConn("c2", "n1", "p1", "n2", "p3"),
          seq: 7,
        },
        { op: "remove", entity: "port", record: mkPort("p3", "n2"), seq: 5 },
      ],
    });
    expect(!r.ok && r.error.code).toBe("dangling-reference");
  });

  it("rejects removing a node that still has ports or connections", () => {
    const { apply } = seeded();
    const r = apply({
      ops: [
        {
          op: "remove",
          entity: "node",
          record: mkNode("n2", { ports: [portId("p2"), portId("p3")] }),
          seq: 2,
        },
      ],
    });
    expect(!r.ok && r.error.code).toBe("dangling-reference");
  });
});
