import { describe, expect, it } from "vitest";
import { connectionId, nodeId, portId } from "../../base/ids/ids.js";
import { rejectionOf } from "../../base/result.js";
import { mkConn, mkNode, mkPort } from "../model/test-helpers.js";
import { seeded } from "./test-setup.js";
import type { Patch } from "./types.js";

const addNode = (id: string, extra = {}) =>
  ({ op: "add", entity: "node", record: mkNode(id, extra) }) as const;

describe("untouched state", () => {
  it("leaves a pre-existing over-limit attachment alone", () => {
    const { store, reader, apply } = seeded();
    store.batch((tx) => {
      tx.putPort(mkPort("p1", "n1", { limit: 1 }));
    });
    // p1 now has two connections but limit 1; an unrelated edit still applies.
    expect(reader.connectionsOfPort(portId("p1"))).toHaveLength(2);
    const r = apply({
      ops: [
        {
          op: "update",
          entity: "node",
          id: nodeId("n2"),
          fields: { z: { old: 0, new: 3 } },
        },
      ],
    });
    expect(r.ok).toBe(true);
  });
});

describe("atomic patch application", () => {
  it("a dangling connection rejects the whole patch and nothing changes", () => {
    const { reader, apply } = seeded();
    const before = JSON.stringify(reader.state());
    const rev = reader.revision();
    const r = apply({
      ops: [
        addNode("n3"),
        addNode("n4"),
        {
          op: "add",
          entity: "connection",
          record: mkConn("c9", "n3", "p-missing", "n4", "p-gone"),
        },
      ],
    });
    expect(!r.ok && r.error.entities).toContain("p-missing");
    expect(reader.revision()).toBe(rev);
    expect(JSON.stringify(reader.state())).toBe(before);
    expect(reader.getNode(nodeId("n3"))).toBeUndefined();
  });

  it("runs validators after integrity and can refuse the patch", () => {
    const { reader, apply } = seeded();
    const seen: string[] = [];
    const r = apply({ ops: [addNode("n3")] }, [
      {
        validate: (staged, patch, ctx) => {
          seen.push(
            `${staged.getNode(nodeId("n3"))?.id}/${patch.ops.length}/${ctx.origin}`,
          );
          return rejectionOf("conflict", "no", ["n3"]);
        },
      },
      {
        validate: () => {
          seen.push("second");
          return undefined;
        },
      },
    ]);
    expect(!r.ok && r.error.message).toBe("no");
    expect(seen).toEqual(["n3/1/local"]);
    expect(reader.getNode(nodeId("n3"))).toBeUndefined();
  });
});

describe("consistent commit", () => {
  it("a store listener sees only fully consistent state", () => {
    const { reader, apply } = seeded();
    const patch: Patch = {
      ops: [
        addNode("n3", { ports: [portId("p4")] }),
        { op: "add", entity: "port", record: mkPort("p4", "n3") },
        {
          op: "add",
          entity: "connection",
          record: mkConn("c3", "n3", "p4", "n1", "p1"),
        },
      ],
    };
    const r = apply(patch);
    expect(r.ok).toBe(true);
    // After the call every cross-reference resolves.
    for (const c of reader.connections()) {
      expect(reader.getPort(c.from.port)?.node).toBe(c.from.node);
      expect(reader.getPort(c.to.port)?.node).toBe(c.to.node);
    }
    for (const n of reader.nodes())
      for (const p of n.ports) expect(reader.getPort(p)?.node).toBe(n.id);
    expect(reader.connectionsOfNode(nodeId("n3")).map((c) => c.id)).toEqual([
      "c3",
    ]);
  });
});

describe("round trip", () => {
  it("deleting a node with two connections and applying the inverse restores state exactly", async () => {
    const { reader, apply } = seeded();
    const { invertPatch } = await import("./invert.js");
    const before = JSON.stringify(reader.state());
    const n2 = mkNode("n2", { ports: [portId("p2"), portId("p3")] });
    const del = apply({
      ops: [
        {
          op: "remove",
          entity: "connection",
          record: mkConn("c1", "n1", "p1", "n2", "p2"),
          seq: 6,
        },
        {
          op: "remove",
          entity: "connection",
          record: mkConn("c2", "n1", "p1", "n2", "p3"),
          seq: 7,
        },
        { op: "remove", entity: "port", record: mkPort("p2", "n2"), seq: 4 },
        { op: "remove", entity: "port", record: mkPort("p3", "n2"), seq: 5 },
        { op: "remove", entity: "node", record: n2, seq: 2 },
      ],
    });
    if (!del.ok) throw new Error(JSON.stringify(del.error));
    expect(reader.nodes()).toHaveLength(1);
    const undo = apply(invertPatch(del.value.patch));
    expect(undo.ok).toBe(true);
    expect(JSON.stringify({ ...reader.state(), revision: 0 })).toBe(
      JSON.stringify({ ...JSON.parse(before), revision: 0 }),
    );
    expect(reader.seqOf(connectionId("c2"))).toBe(7);
  });

  it("re-adding an entity with a different explicit seq in one patch keeps that seq", () => {
    const { reader, apply } = seeded();
    const r = apply({
      ops: [
        {
          op: "remove",
          entity: "connection",
          record: mkConn("c1", "n1", "p1", "n2", "p2"),
          seq: 6,
        },
        {
          op: "add",
          entity: "connection",
          record: mkConn("c1", "n1", "p1", "n2", "p2"),
          seq: 9,
        },
      ],
    });
    expect(r.ok).toBe(true);
    expect(reader.connections().map((c) => c.id)).toEqual(["c2", "c1"]);
  });
});
