import { describe, expect, it } from "vitest";
import { nodeId } from "../../base/ids/ids.js";
import { createGraphReader } from "./reader.js";
import { createGraphStore } from "./store.js";
import { mkNode } from "./test-helpers.js";

describe("MOD-13 immutable read snapshots", () => {
  it("writing to a returned record throws when freezing is on", () => {
    const store = createGraphStore();
    store.batch((tx) => void tx.putNode(mkNode("n1", { payload: { a: [1] } })));
    const reader = createGraphReader(store);
    const node = reader.getNode(nodeId("n1")) as {
      position: { x: number };
      z: number;
    };
    expect(() => {
      node.z = 5;
    }).toThrow(TypeError);
    expect(() => {
      node.position.x = 5;
    }).toThrow(TypeError);
    expect(Object.isFrozen(reader.state())).toBe(true);
    expect(Object.isFrozen(reader.state().nodes)).toBe(true);
    expect(reader.getNode(nodeId("n1"))?.position.x).toBe(0);
  });

  it("a kept state still shows old values after a later batch", () => {
    const store = createGraphStore();
    store.batch((tx) => void tx.putNode(mkNode("n1")));
    const reader = createGraphReader(store);
    const kept = reader.state();
    store.batch(
      (tx) => void tx.putNode(mkNode("n1", { position: { x: 7, y: 7 } })),
    );
    store.batch((tx) => void tx.putNode(mkNode("n2")));
    expect(kept.nodes).toHaveLength(1);
    expect(kept.nodes[0]?.position.x).toBe(0);
    expect(reader.state().nodes).toHaveLength(2);
    expect(reader.getNode(nodeId("n1"))?.position.x).toBe(7);
  });

  it("the state is reused while the revision is unchanged", () => {
    const store = createGraphStore();
    store.batch((tx) => void tx.putNode(mkNode("n1")));
    const reader = createGraphReader(store);
    const first = reader.state();
    expect(reader.state()).toBe(first);
    store.batch((tx) => void tx.putNode(mkNode("n2")));
    expect(reader.state()).not.toBe(first);
    expect(reader.state().revision).toBe(reader.revision());
  });
});

describe("MOD-13 production opt-out", () => {
  it("freezeRecords: false returns unfrozen records", () => {
    const store = createGraphStore({ freezeRecords: false });
    store.batch((tx) => void tx.putNode(mkNode("n1")));
    const reader = createGraphReader(store);
    expect(Object.isFrozen(reader.getNode(nodeId("n1")))).toBe(false);
    expect(Object.isFrozen(reader.state())).toBe(false);
    expect(Object.isFrozen(reader.nodes())).toBe(false);
  });
});
