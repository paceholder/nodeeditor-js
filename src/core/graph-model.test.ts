import { describe, expect, it } from "vitest";
import { connectionId } from "./base/ids/ids.js";
import { MisuseError } from "./base/result.js";
import { moveOp, planNode } from "./data/model/model-fixtures.js";
import { mkConn } from "./data/model/test-helpers.js";
import { createGraphModel } from "./graph-model.js";

function accepted(result: { status: string }): void {
  expect(result.status).toBe("accepted");
}

describe("create, read, update and delete through patches", () => {
  it("covers nodes, ports and connections", () => {
    // Structural test: the connection policy is out of the picture (it would refuse the
    // deliberately odd reconnect below).
    const model = createGraphModel({
      connectionPolicy: {
        evaluate: (p) => ({
          kind: "accept",
          plan: {
            from: p.from,
            to: p.to,
            connectionKind: "default",
            auxiliary: [],
          },
        }),
      },
    });
    const a = planNode(model);
    accepted(model.submit(a.patch));
    const b = planNode(model);
    accepted(model.submit(b.patch));
    const { reader } = model;
    expect(reader.nodes().map((n) => n.id)).toEqual([a.node, b.node]);
    expect(reader.portsOf(a.node).map((p) => p.id)).toEqual([a.port]);

    const conn = mkConn("c1", a.node, a.port, b.node, b.port);
    accepted(
      model.submit({
        ops: [{ op: "add", entity: "connection", record: conn }],
      }),
    );
    expect(reader.connectionsOfNode(b.node).map((c) => c.id)).toEqual(["c1"]);

    // Update: node field, port field, and reconnect keeping the connection ID.
    accepted(
      model.submit({
        ops: [
          moveOp(a.node, { x: 0, y: 0 }, { x: 40, y: 20 }),
          {
            op: "update",
            entity: "port",
            id: a.port,
            fields: { label: { new: "out" } },
          },
          {
            op: "update",
            entity: "connection",
            id: conn.id,
            fields: {
              to: { old: conn.to, new: { node: a.node, port: a.port } },
            },
          },
        ],
      }),
    );
    expect(reader.getNode(a.node)?.position).toEqual({ x: 40, y: 20 });
    expect(reader.getPort(a.port)?.label).toBe("out");
    expect(reader.getConnection(connectionId("c1"))?.to.node).toBe(a.node);
    expect(reader.connectionsOfNode(b.node).map((c) => c.id)).toEqual([]);

    // Delete everything of b, then the connection.
    const c = reader.getConnection(conn.id);
    const bp = reader.getPort(b.port);
    const bn = reader.getNode(b.node);
    if (!c || !bp || !bn) throw new Error("setup");
    accepted(
      model.submit({
        ops: [
          {
            op: "remove",
            entity: "connection",
            record: c,
            seq: reader.seqOf(c.id) ?? 0,
          },
          {
            op: "remove",
            entity: "port",
            record: bp,
            seq: reader.seqOf(bp.id) ?? 0,
          },
          {
            op: "remove",
            entity: "node",
            record: bn,
            seq: reader.seqOf(bn.id) ?? 0,
          },
        ],
      }),
    );
    expect(reader.nodes().map((n) => n.id)).toEqual([a.node]);
    expect(reader.connections()).toEqual([]);
  });

  it("a move yields one change event with the update and the new revision", () => {
    const model = createGraphModel();
    const a = planNode(model);
    model.submit(a.patch);
    const events: unknown[] = [];
    model.on("change", (e) => events.push(e));
    model.submit({ ops: [moveOp(a.node, { x: 0, y: 0 }, { x: 40, y: 20 })] });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      revision: 2,
      origin: "local",
      patch: { ops: [{ op: "update", id: a.node }] },
    });
  });

  it("reads inside a change handler see the committed state", () => {
    const model = createGraphModel();
    let count = -1;
    model.on("change", () => {
      count = model.reader.nodes().length;
    });
    model.submit(planNode(model).patch);
    expect(count).toBe(1);
  });

  it("a value that is not a patch throws MisuseError", () => {
    const model = createGraphModel();
    expect(() => model.submit({} as never)).toThrow(MisuseError);
    expect(() => model.submit(null as never)).toThrow(MisuseError);
  });
});

describe("dispose", () => {
  it("calls after dispose throw MisuseError, a second dispose is a no-op, handlers are released", () => {
    const model = createGraphModel();
    let calls = 0;
    model.on("change", () => calls++);
    model.submit(planNode(model).patch);
    model.dispose();
    expect(() => model.dispose()).not.toThrow();
    expect(() => model.submit({ ops: [] })).toThrow(MisuseError);
    expect(() => model.undo()).toThrow(MisuseError);
    expect(() => model.redo()).toThrow(MisuseError);
    expect(() => model.historyState()).toThrow(MisuseError);
    expect(() => model.on("change", () => {})).toThrow(MisuseError);
    expect(() => model.addValidator({ validate: () => undefined })).toThrow(
      MisuseError,
    );
    expect(calls).toBe(1);
  });
});

describe("one history entry per gesture", () => {
  it("a 200-step simulated drag submits one patch and adds one history entry", () => {
    const model = createGraphModel();
    const a = planNode(model);
    model.submit(a.patch, { history: "skip" });
    const submitted: number[] = [];
    model.on("change", () => submitted.push(1));
    // Previews are local to the gesture and never submitted.
    let preview = { x: 0, y: 0 };
    for (let step = 1; step <= 200; step++) preview = { x: step, y: step / 2 };
    model.submit(
      { ops: [moveOp(a.node, { x: 0, y: 0 }, preview)] },
      { label: "Move" },
    );
    expect(submitted).toHaveLength(1);
    expect(model.reader.getNode(a.node)?.position).toEqual({ x: 200, y: 100 });
    model.undo();
    expect(model.reader.getNode(a.node)?.position).toEqual({ x: 0, y: 0 });
    expect(model.historyState().canUndo).toBe(false);
  });
});
