import { describe, expect, it } from "vitest";
import { moveOp } from "../../data/model/model-fixtures.js";
import type { CapabilityOverrides } from "../../data/model/records.js";
import { end, firstConnection, make, makeModel } from "../commands/test-kit.js";

describe("API enforcement", () => {
  it("rejects a raw move patch on a node with move: false", () => {
    const model = makeModel();
    const a = make(model, "source");
    model.submit({
      ops: [
        {
          op: "update",
          entity: "node",
          id: a.node,
          fields: { capabilities: { new: { move: false } } },
        },
      ],
    });
    const result = model.submit({
      ops: [moveOp(a.node, { x: 0, y: 0 }, { x: 9, y: 9 })],
    });
    expect(result.status).toBe("rejected");
    if (result.status === "rejected") {
      expect(result.error.code).toBe("capability-denied");
      expect(result.error.entities).toContain(a.node);
    }
    expect(model.reader.getNode(a.node)?.position).toEqual({ x: 0, y: 0 });
    // The command route reports the same reason before submitting.
    const can = model.can({
      kind: "moveNodes",
      moves: [{ node: a.node, position: { x: 1, y: 1 } }],
    });
    expect(can.available).toBe(false);
  });

  it("type defaults deny, and undo of a move on a since-locked node is rejected", () => {
    const model = makeModel();
    const a = make(model, "source");
    expect(
      model.moveNodes([{ node: a.node, position: { x: 5, y: 5 } }]).status,
    ).toBe("accepted");
    model.submit(
      {
        ops: [
          {
            op: "update",
            entity: "node",
            id: a.node,
            fields: { capabilities: { new: { move: false } } },
          },
        ],
      },
      { history: "skip" },
    );
    const undone = model.undo();
    expect(undone.status).toBe("rejected");
    expect(model.reader.getNode(a.node)?.position).toEqual({ x: 5, y: 5 });
  });

  it("a patch cannot unlock itself and edit in one step", () => {
    const model = makeModel();
    const a = make(model, "source");
    model.submit({
      ops: [
        {
          op: "update",
          entity: "node",
          id: a.node,
          fields: { capabilities: { new: { edit: false } } },
        },
      ],
    });
    const result = model.submit({
      ops: [
        {
          op: "update",
          entity: "node",
          id: a.node,
          fields: {
            capabilities: { old: { edit: false }, new: { edit: true } },
            title: { new: "x" },
          },
        },
      ],
    });
    expect(result.status).toBe("rejected");
  });

  it("denies delete, connect and disconnect through the matching actions", () => {
    const model = makeModel();
    const src = make(model, "source");
    const dst = make(model, "sink");
    const lock = (id: typeof src.node, c: CapabilityOverrides) => {
      const old = model.reader.getNode(id)?.capabilities;
      return model.submit({
        ops: [
          {
            op: "update",
            entity: "node",
            id,
            fields: { capabilities: old ? { old, new: c } : { new: c } },
          },
        ],
      });
    };
    lock(dst.node, { connect: false });
    expect(model.connect(end(src), end(dst)).status).toBe("rejected");
    lock(dst.node, { connect: true });
    expect(model.connect(end(src), end(dst)).status).toBe("accepted");
    lock(dst.node, { disconnect: false, delete: false });
    const conn = firstConnection(model);
    expect(model.disconnect(conn).status).toBe("rejected");
    expect(model.deleteEntities({ nodes: [dst.node] }).status).toBe("rejected");
  });
});

describe("read-only", () => {
  it("denies every edit while reads still work", () => {
    const model = makeModel({ readOnly: true });
    expect(model.createNode("source", { x: 0, y: 0 }).status).toBe("rejected");
    const raw = model.submit({
      ops: [
        {
          op: "add",
          entity: "node",
          record: {
            id: "n9" as never,
            type: "source",
            position: { x: 0, y: 0 },
            size: { width: 1, height: 1 },
            rotation: 0,
            mirrored: false,
            z: 0,
            ports: [],
            payload: null,
          },
        },
      ],
    });
    expect(raw.status).toBe("rejected");
    expect(model.reader.nodes()).toEqual([]);
    expect(model.reader.state().nodes).toEqual([]);
  });
});
