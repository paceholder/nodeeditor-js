import { describe, expect, it } from "vitest";
import { connectionId, nodeId, portId } from "../../base/ids/ids.js";
import { createGraphReader } from "./reader.js";
import { createGraphStore } from "./store.js";
import { mkConn, mkNode, mkPort } from "./test-helpers.js";

function populated() {
  const store = createGraphStore();
  store.batch((tx) => {
    tx.putNode(mkNode("n1", { ports: [portId("p2"), portId("p1")] }));
    tx.putNode(mkNode("n2", { ports: [portId("p3")] }));
    tx.putNode(mkNode("n3", { ports: [portId("p4")] }));
    tx.putPort(mkPort("p1", "n1"));
    tx.putPort(mkPort("p2", "n1"));
    tx.putPort(mkPort("p3", "n2", { limit: 1 }));
    tx.putPort(mkPort("p4", "n3"));
    tx.putConnection(mkConn("c1", "n1", "p1", "n2", "p3"));
    tx.putConnection(mkConn("c2", "n3", "p4", "n2", "p3"));
  });
  return { store, reader: createGraphReader(store) };
}

describe("MOD-01 headless reads", () => {
  it("runs in the Node environment without browser globals", () => {
    expect(typeof (globalThis as Record<string, unknown>).window).toBe(
      "undefined",
    );
    const { reader } = populated();
    expect(reader.nodes().map((n) => n.id)).toEqual(["n1", "n2", "n3"]);
    expect(reader.getNode(nodeId("n2"))?.id).toBe("n2");
    expect(reader.getNode(nodeId("zz"))).toBeUndefined();
    expect(reader.getConnection(connectionId("c1"))?.kind).toBe("default");
  });

  it("MOD-03 reordering ports keeps attachments on the same port IDs", () => {
    const { store, reader } = populated();
    store.batch((tx) => {
      const n = tx.getNode(nodeId("n1"));
      if (n) tx.putNode({ ...n, ports: [portId("p1"), portId("p2")] });
    });
    expect(reader.portsOf(nodeId("n1")).map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(reader.getConnection(connectionId("c1"))?.from.port).toBe("p1");
  });

  it("portsOf follows the node's presentation order", () => {
    const { reader } = populated();
    expect(reader.portsOf(nodeId("n1")).map((p) => p.id)).toEqual(["p2", "p1"]);
    expect(reader.portsOf(nodeId("zz"))).toEqual([]);
  });

  it("answers incident, attachment and neighbor queries", () => {
    const { reader } = populated();
    expect(reader.connectionsOfNode(nodeId("n2")).map((c) => c.id)).toEqual([
      "c1",
      "c2",
    ]);
    expect(reader.connectionsOfPort(portId("p3")).map((c) => c.id)).toEqual([
      "c1",
      "c2",
    ]);
    expect(reader.neighbors(nodeId("n2")).map((n) => n.id)).toEqual([
      "n1",
      "n3",
    ]);
    expect(reader.neighbors(nodeId("n1")).map((n) => n.id)).toEqual(["n2"]);
  });
});

describe("MOD-09a application-invalid data stays readable", () => {
  it("stores an over-limit attachment and reads it back unchanged", () => {
    const { reader } = populated();
    // p3 has limit 1 but two connections attach to it.
    expect(reader.getPort(portId("p3"))?.limit).toBe(1);
    expect(reader.connectionsOfPort(portId("p3"))).toHaveLength(2);
  });
});

describe("MOD-08 seqOf", () => {
  it("is strictly increasing in insertion order and undefined for unknown IDs", () => {
    const { reader } = populated();
    const seqs = [nodeId("n1"), nodeId("n2"), nodeId("n3")].map(
      (i) => reader.seqOf(i) as number,
    );
    expect(seqs.every((s, i) => i === 0 || s > (seqs[i - 1] as number))).toBe(
      true,
    );
    expect(reader.seqOf(connectionId("c2"))).toBeGreaterThan(
      reader.seqOf(connectionId("c1")) as number,
    );
    expect(reader.seqOf(nodeId("nope"))).toBeUndefined();
  });

  it("a remove then restore with the same seq reads back the original value", () => {
    const { store, reader } = populated();
    const before = reader.seqOf(connectionId("c1"));
    const removed = store.batch((tx) =>
      tx.removeConnection(connectionId("c1")),
    );
    expect(reader.seqOf(connectionId("c1"))).toBeUndefined();
    store.batch((tx) => {
      if (removed) tx.putConnection(removed.record, { seq: removed.seq });
    });
    expect(reader.seqOf(connectionId("c1"))).toBe(before);
    expect(reader.connections().map((c) => c.id)).toEqual(["c1", "c2"]);
  });
});
