import { describe, expect, it } from "vitest";
import { connectionId, nodeId, portId } from "../../base/ids/ids.js";
import { mkConn, mkNode, mkPort } from "../model/test-helpers.js";
import { createStagedState } from "./stage.js";
import { seeded } from "./test-setup.js";

describe("staged state", () => {
  it("answers reads from the overlay while the base store is untouched", () => {
    const { reader } = seeded();
    const stage = createStagedState(reader);
    const before = JSON.stringify(reader.state());
    stage.dropConnection(connectionId("c1"));
    stage.putNode(mkNode("n9", { ports: [portId("p9")] }), undefined);
    stage.putPort(mkPort("p9", "n9"), undefined);
    stage.putConnection(mkConn("c9", "n9", "p9", "n1", "p1"), undefined);
    stage.putNode(mkNode("n1", { title: "A", ports: [portId("p1")] }), 1);

    expect(stage.getConnection(connectionId("c1"))).toBeUndefined();
    expect(stage.getNode(nodeId("n1"))?.title).toBe("A");
    expect(stage.connectionsOfPort(portId("p2"))).toEqual([]);
    expect(stage.connectionsOfNode(nodeId("n1")).map((c) => c.id)).toEqual([
      "c2",
      "c9",
    ]);
    expect(stage.neighbors(nodeId("n1")).map((n) => n.id)).toEqual([
      "n2",
      "n9",
    ]);
    expect(stage.nodes().map((n) => n.id)).toEqual(["n1", "n2", "n9"]);
    expect(stage.portsOf(nodeId("n9")).map((p) => p.id)).toEqual(["p9"]);

    expect(JSON.stringify(reader.state())).toBe(before);
    expect(reader.getNode(nodeId("n9"))).toBeUndefined();
    expect(reader.getConnection(connectionId("c1"))).toBeDefined();
  });

  it("orders explicit-seq adds among base entries and auto adds last", () => {
    const { reader } = seeded();
    const stage = createStagedState(reader);
    stage.putNode(mkNode("na"), undefined);
    stage.putNode(mkNode("nb"), 2);
    expect(stage.nodes().map((n) => n.id)).toEqual(["n1", "n2", "nb", "na"]);
    expect(stage.writes().map((w) => w.id)).toEqual(["na", "nb"]);
  });
});
