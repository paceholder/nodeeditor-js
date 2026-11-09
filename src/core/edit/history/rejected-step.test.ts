import { describe, expect, it } from "vitest";
import { nodeId } from "../../base/ids/ids.js";
import { moveOp } from "../../data/model/model-fixtures.js";
import { mkNode } from "../../data/model/test-helpers.js";
import { createGraphModel } from "../../graph-model.js";

const a = nodeId("a");

function withNode() {
  const model = createGraphModel();
  model.submit({ ops: [{ op: "add", entity: "node", record: mkNode("a") }] });
  return model;
}

describe("a rejected undo or redo does not block history", () => {
  it("undo after an edit that skipped history drops the stack and says why", () => {
    const model = withNode();
    model.submit({ ops: [moveOp(a, { x: 0, y: 0 }, { x: 1, y: 0 })] });
    model.submit(
      { ops: [moveOp(a, { x: 1, y: 0 }, { x: 2, y: 0 })] },
      { history: "skip" },
    );
    const history: unknown[] = [];
    model.on("history", (h) => history.push(h));
    const undone = model.undo();
    expect(undone.status === "rejected" && undone.rejection.code).toBe(
      "conflict",
    );
    const state = model.historyState();
    expect(state.canUndo).toBe(false);
    expect(state.undoReason).toMatch(/no longer possible/);
    expect(history).toHaveLength(1);
    const again = model.undo();
    expect(again.status === "rejected" && again.rejection.code).toBe(
      "history-unavailable",
    );
    expect(model.reader.getNode(a)?.position).toEqual({ x: 2, y: 0 });
  });

  it("undo of a lock is refused by that lock, and the entry is dropped", () => {
    const model = withNode();
    model.submit({
      ops: [
        {
          op: "update",
          entity: "node",
          id: a,
          fields: { capabilities: { new: { edit: false } } },
        },
      ],
    });
    const undone = model.undo();
    expect(undone.status === "rejected" && undone.rejection.code).toBe(
      "capability-denied",
    );
    expect(model.historyState().canUndo).toBe(false);
    expect(model.historyState().undoReason).toMatch(/not permitted/);
  });

  it("a rejected undo keeps the redo stack, and a rejected redo drops only redo", () => {
    const model = withNode();
    model.submit({ ops: [moveOp(a, { x: 0, y: 0 }, { x: 1, y: 0 })] });
    model.undo();
    expect(model.historyState().canRedo).toBe(true);
    model.submit(
      { ops: [moveOp(a, { x: 0, y: 0 }, { x: 5, y: 0 })] },
      { history: "skip" },
    );
    const redone = model.redo();
    expect(redone.status).toBe("rejected");
    const state = model.historyState();
    expect(state.canRedo).toBe(false);
    expect(state.redoReason).toMatch(/no longer possible/);
    expect(state.canUndo).toBe(true);
  });

  it("a new recorded edit clears the reason", () => {
    const model = withNode();
    model.submit({ ops: [moveOp(a, { x: 0, y: 0 }, { x: 1, y: 0 })] });
    model.submit(
      { ops: [moveOp(a, { x: 1, y: 0 }, { x: 2, y: 0 })] },
      { history: "skip" },
    );
    model.undo();
    model.submit({ ops: [moveOp(a, { x: 2, y: 0 }, { x: 3, y: 0 })] });
    expect(model.historyState().canUndo).toBe(true);
    model.undo();
    expect(model.historyState().undoReason).toBe("Nothing to undo");
  });
});
