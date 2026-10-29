import { describe, expect, it } from "vitest";
import { connectionId, nodeId, portId } from "../../base/ids/ids.js";
import { MisuseError } from "../../base/result.js";
import { createGraphReader } from "./reader.js";
import { createGraphStore, type StoreTx } from "./store.js";
import { mkConn, mkNode, mkPort } from "./test-helpers.js";

function build() {
  const store = createGraphStore();
  store.batch((tx) => {
    tx.putNode(mkNode("n1", { ports: [portId("p1")] }));
    tx.putNode(mkNode("n2", { ports: [portId("p2")] }));
    tx.putPort(mkPort("p1", "n1"));
    tx.putPort(mkPort("p2", "n2"));
    tx.putConnection(mkConn("c1", "n1", "p1", "n2", "p2"));
  });
  return store;
}

describe("batch consistency", () => {
  it("indexes are consistent when a batch ends", () => {
    const store = build();
    expect(store.indexes.connectionsOfNode(nodeId("n1"))).toEqual(["c1"]);
    expect(store.indexes.connectionsOfPort(portId("p2"))).toEqual(["c1"]);
    expect(store.revision()).toBe(1);
  });

  it("revision advances once per batch, not per operation", () => {
    const store = build();
    store.batch((tx) => {
      tx.putNode(mkNode("n3"));
      tx.putNode(mkNode("n4"));
    });
    expect(store.revision()).toBe(2);
    store.batch(() => undefined);
    expect(store.revision()).toBe(2);
  });

  it("reads inside a batch are not exposed to outside readers", () => {
    const store = build();
    const reader = createGraphReader(store);
    store.batch((tx) => {
      tx.putNode(mkNode("n3"));
      expect(() => reader.nodes()).toThrow(MisuseError);
      expect(() => reader.getNode(nodeId("n1"))).toThrow(MisuseError);
    });
    expect(reader.nodes()).toHaveLength(3);
  });

  it("a batch that leaves a dangling endpoint is refused as misuse", () => {
    const store = build();
    expect(() => store.batch((tx) => void tx.removePort(portId("p2")))).toThrow(
      MisuseError,
    );
  });

  it("a batch that removes a port its node still lists is refused as misuse", () => {
    const store = createGraphStore();
    store.batch((tx) => {
      tx.putNode(mkNode("n1", { ports: [portId("p1")] }));
      tx.putPort(mkPort("p1", "n1"));
    });
    expect(() => store.batch((tx) => void tx.removePort(portId("p1")))).toThrow(
      MisuseError,
    );
  });

  it("deleting a node with its connections in one batch is consistent", () => {
    const store = build();
    const reader = createGraphReader(store);
    store.batch((tx) => {
      tx.removeConnection(connectionId("c1"));
      tx.removePort(portId("p1"));
      tx.removeNode(nodeId("n1"));
    });
    expect(reader.nodes().map((n) => n.id)).toEqual(["n2"]);
    expect(reader.connections()).toHaveLength(0);
  });

  it("rejects nested batches, stale transactions, and IDs shared across kinds", () => {
    const store = build();
    let stale: StoreTx | undefined;
    store.batch((tx) => {
      stale = tx;
      expect(() => store.batch(() => 0)).toThrow(MisuseError);
      expect(() => tx.putPort(mkPort("n1", "n1"))).toThrow(MisuseError);
    });
    expect(() => stale?.getNode(nodeId("n1"))).toThrow(MisuseError);
  });
});

describe("deterministic ordering", () => {
  it("the same insertion sequence yields identical order across two stores", () => {
    const a = createGraphReader(build());
    const b = createGraphReader(build());
    expect(a.nodes()).toEqual(b.nodes());
    expect(a.ports()).toEqual(b.ports());
    expect(a.connections()).toEqual(b.connections());
    expect(a.nodes().map((n) => n.id)).toEqual(["n1", "n2"]);
  });

  it("paint order follows (z, seq)", () => {
    const store = createGraphStore();
    store.batch((tx) => {
      tx.putNode(mkNode("a", { z: 5 }));
      tx.putNode(mkNode("b", { z: 1 }));
      tx.putNode(mkNode("c", { z: 5 }));
      tx.putNode(mkNode("d", { z: 1 }));
    });
    expect(store.paintOrder().map((n) => n.id)).toEqual(["b", "d", "a", "c"]);
    expect(store.zRange()).toEqual({ min: 1, max: 5 });
    store.batch((tx) => void tx.putNode(mkNode("b", { z: 9 })));
    expect(store.paintOrder().map((n) => n.id)).toEqual(["d", "a", "c", "b"]);
    expect(store.zRange()).toEqual({ min: 1, max: 9 });
    store.batch((tx) => void tx.removeNode(nodeId("b")));
    expect(store.zRange()).toEqual({ min: 1, max: 5 });
  });

  it("collection order is by seq, not by Map insertion, after a restore", () => {
    const store = createGraphStore();
    store.batch((tx) => {
      tx.putNode(mkNode("a"));
      tx.putNode(mkNode("b"));
    });
    const removed = store.batch((tx) => tx.removeNode(nodeId("a")));
    store.batch(
      (tx) => void tx.putNode(mkNode("a"), { seq: removed?.seq as number }),
    );
    expect(store.nodes.list().map((n) => n.id)).toEqual(["a", "b"]);
  });
});
