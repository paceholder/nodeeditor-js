import { describe, expect, it } from "vitest";
import { type ConnectionId, nodeId, portId } from "../../base/ids/ids.js";
import { createIndexes } from "./indexes.js";
import { createGraphStore } from "./store.js";
import { mkConn, mkNode, mkPort } from "./test-helpers.js";

describe("indexed queries", () => {
  it("indexes incident connections, port attachments and neighbors on both sides", () => {
    const idx = createIndexes();
    const c1 = mkConn("c1", "n1", "p1", "n2", "p2");
    const c2 = mkConn("c2", "n3", "p3", "n1", "p1");
    idx.addConnection(c1, 1);
    idx.addConnection(c2, 2);
    expect(idx.connectionsOfNode(nodeId("n1"))).toEqual(["c1", "c2"]);
    expect(idx.connectionsOfNode(nodeId("n2"))).toEqual(["c1"]);
    expect(idx.connectionsOfPort(portId("p1"))).toEqual(["c1", "c2"]);
    expect(idx.connectionsOfPort(portId("p3"))).toEqual(["c2"]);
    const ends: Record<string, [string, string]> = {
      c1: ["n1", "n2"],
      c2: ["n3", "n1"],
    };
    const other = (id: ConnectionId, from: string) => {
      const e = ends[id] as [string, string];
      return nodeId(e[0] === from ? e[1] : e[0]);
    };
    const seqs: Record<string, number> = { n1: 1, n2: 2, n3: 3 };
    const nb = (n: string) => idx.neighbors(nodeId(n), other, (i) => seqs[i]);
    expect(nb("n1")).toEqual(["n2", "n3"]);
    expect(nb("n2")).toEqual(["n1"]);
    idx.removeConnection(c1);
    expect(idx.connectionsOfNode(nodeId("n2"))).toEqual([]);
    expect(idx.connectionsOfNode(nodeId("n1"))).toEqual(["c2"]);
  });

  it("self-loops are indexed once and are not their own neighbor", () => {
    const idx = createIndexes();
    idx.addConnection(mkConn("c1", "n1", "p1", "n1", "p1"), 1);
    expect(idx.connectionsOfNode(nodeId("n1"))).toEqual(["c1"]);
    expect(
      idx.neighbors(
        nodeId("n1"),
        () => nodeId("n1"),
        () => 1,
      ),
    ).toEqual([]);
  });

  it("results stay in seq order when entries are added out of order", () => {
    const idx = createIndexes();
    idx.addConnection(mkConn("c2", "n1", "p1", "n2", "p2"), 2);
    idx.addConnection(mkConn("c1", "n1", "p1", "n2", "p2"), 1);
    expect(idx.connectionsOfPort(portId("p1"))).toEqual(["c1", "c2"]);
  });
});

describe("indexed queries at scale", () => {
  it("port attachment query touches only that port's entries (10k nodes, 20k connections)", () => {
    const store = createGraphStore({ freezeRecords: false });
    const N = 10_000;
    store.batch((tx) => {
      for (let i = 0; i < N; i++) {
        tx.putNode(mkNode(`n${i}`, { ports: [portId(`p${i}`)] }));
        tx.putPort(mkPort(`p${i}`, `n${i}`));
      }
      for (let i = 0; i < 2 * N; i++) {
        const a = i % N;
        const b = (i * 7 + 1) % N;
        tx.putConnection(mkConn(`c${i}`, `n${a}`, `p${a}`, `n${b}`, `p${b}`));
      }
    });
    const target = portId("p42");
    const expected = store.connections
      .list()
      .filter((c) => c.from.port === target || c.to.port === target).length;
    expect(expected).toBeGreaterThan(0);
    const before = store.indexes.visited();
    const found = store.indexes.connectionsOfPort(target);
    expect(found).toHaveLength(expected);
    expect(store.indexes.visited() - before).toBe(expected);
    expect(expected).toBeLessThan(20);
  });
});
