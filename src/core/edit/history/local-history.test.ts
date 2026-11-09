import { describe, expect, it } from "vitest";
import { portId } from "../../base/ids/ids.js";
import { moveOp, planNode } from "../../data/model/model-fixtures.js";
import { mkConn } from "../../data/model/test-helpers.js";
import type { GraphModel } from "../../graph-model.js";
import { createGraphModel } from "../../graph-model.js";

function addNode(model: GraphModel, label = "Add node") {
  const planned = planNode(model);
  const result = model.submit(planned.patch, { label });
  if (result.status !== "accepted") throw new Error("expected accepted");
  return planned;
}

describe("local history", () => {
  it("records one entry per submission and undo restores order and IDs exactly", () => {
    const model = createGraphModel();
    const a = addNode(model);
    const b = addNode(model);
    const conn = model.submit(
      {
        ops: [
          {
            op: "add",
            entity: "connection",
            record: mkConn("c1", a.node, a.port, b.node, b.port),
          },
        ],
      },
      { label: "Connect" },
    );
    expect(conn.status).toBe("accepted");
    const before = JSON.stringify(model.reader.state());

    // One delete submission: one entry, one undo step.
    const aRecord = model.reader.getNode(a.node);
    const aPort = model.reader.getPort(a.port);
    const c1 = model.reader.getConnection(
      mkConn("c1", a.node, a.port, b.node, b.port).id,
    );
    if (!aRecord || !aPort || !c1) throw new Error("setup");
    const del = model.submit(
      {
        ops: [
          {
            op: "remove",
            entity: "connection",
            record: c1,
            seq: model.reader.seqOf(c1.id) ?? 0,
          },
          {
            op: "remove",
            entity: "port",
            record: aPort,
            seq: model.reader.seqOf(aPort.id) ?? 0,
          },
          {
            op: "remove",
            entity: "node",
            record: aRecord,
            seq: model.reader.seqOf(aRecord.id) ?? 0,
          },
        ],
      },
      { label: "Delete node" },
    );
    expect(del.status).toBe("accepted");
    expect(model.reader.nodes()).toHaveLength(1);
    expect(model.historyState().undoLabel).toBe("Delete node");

    expect(model.undo().status).toBe("accepted");
    expect(JSON.stringify({ ...model.reader.state(), revision: 0 })).toBe(
      JSON.stringify({ ...JSON.parse(before), revision: 0 }),
    );
    expect(model.historyState()).toMatchObject({
      canRedo: true,
      redoLabel: "Delete node",
    });

    expect(model.redo().status).toBe("accepted");
    expect(model.reader.nodes()).toHaveLength(1);
    expect(model.historyState().undoLabel).toBe("Delete node");
  });

  it("one gesture, one undo step: three nodes return to their start", () => {
    const model = createGraphModel();
    const nodes = [addNode(model), addNode(model), addNode(model)];
    model.submit(
      {
        ops: nodes.map((n, i) =>
          moveOp(n.node, { x: 0, y: 0 }, { x: 10 * (i + 1), y: 5 }),
        ),
      },
      { label: "Move" },
    );
    model.undo();
    expect(model.reader.nodes().map((n) => n.position)).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ]);
  });

  it("redo is cleared after a new edit", () => {
    const model = createGraphModel();
    addNode(model);
    model.undo();
    expect(model.historyState().canRedo).toBe(true);
    addNode(model);
    expect(model.historyState().canRedo).toBe(false);
    expect(model.redo()).toMatchObject({ ok: false, status: "rejected" });
  });

  it('history: "skip" is applied but not recorded', () => {
    const model = createGraphModel();
    const planned = planNode(model);
    model.submit(planned.patch, { history: "skip" });
    expect(model.reader.nodes()).toHaveLength(1);
    expect(model.historyState().canUndo).toBe(false);
  });

  it("a rejected undo drops the undo stack with a reason and fires a failure event", () => {
    const model = createGraphModel();
    const a = addNode(model);
    // An external-style change makes the recorded inverse stale.
    model.submit(
      { ops: [moveOp(a.node, { x: 0, y: 0 }, { x: 1, y: 1 })] },
      { history: "skip" },
    );
    model.submit(
      {
        ops: [
          {
            op: "update",
            entity: "node",
            id: a.node,
            fields: { ports: { old: [a.port], new: [portId("pz")] } },
          },
        ],
      },
      { history: "skip" },
    );
    const failures: string[] = [];
    model.on("failure", (f) => {
      if (f.source === "rejection") failures.push(f.rejection.code);
    });
    expect(model.undo()).toMatchObject({ ok: false });
    expect(failures.length).toBe(1);
    expect(model.historyState()).toMatchObject({
      canUndo: false,
      undoReason: expect.stringMatching(/^Undo is no longer possible/),
    });
  });
});

describe("undo keeps the same identifiers", () => {
  it("creating n1, undoing, and creating again yields an ID other than n1", () => {
    const model = createGraphModel();
    const first = addNode(model);
    expect(first.node).toBe("n1");
    model.undo();
    expect(model.reader.nodes()).toHaveLength(0);
    const second = addNode(model);
    expect(second.node).not.toBe("n1");
    expect(second.node).toBe("n2");
  });
});

describe("history availability", () => {
  it("an empty history reports unavailable with a reason, and undo is a rejection", () => {
    const model = createGraphModel();
    expect(model.historyState()).toMatchObject({
      canUndo: false,
      canRedo: false,
      undoReason: "Nothing to undo",
      redoReason: "Nothing to redo",
    });
    const r = model.undo();
    expect(r).toMatchObject({ ok: false, status: "rejected" });
    if (r.status === "rejected")
      expect(r.error.code).toBe("history-unavailable");
  });

  it("labels follow the submissions", () => {
    const model = createGraphModel();
    addNode(model, "First");
    addNode(model, "Second");
    expect(model.historyState().undoLabel).toBe("Second");
    model.undo();
    expect(model.historyState()).toMatchObject({
      undoLabel: "First",
      redoLabel: "Second",
    });
  });

  it("history events announce availability changes", () => {
    const model = createGraphModel();
    const seen: boolean[] = [];
    model.on("history", (h) => seen.push(h.canUndo));
    addNode(model);
    model.undo();
    expect(seen).toEqual([true, false]);
  });
});
