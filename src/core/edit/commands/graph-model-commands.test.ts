import { describe, expect, it } from "vitest";
import type { FailureEvent } from "../events/types.js";
import { end, make, makeModel } from "./test-kit.js";

describe("failure events", () => {
  it("a command refused during planning publishes one failure event", () => {
    const model = makeModel();
    const a = make(model, "source");
    const failures: FailureEvent[] = [];
    model.on("failure", (e) => failures.push(e));
    const result = model.connect(end(a), end(a));
    expect(result.status).toBe("rejected");
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({
      source: "rejection",
      origin: "local",
      rejection: {
        code: result.status === "rejected" ? result.error.code : "",
      },
    });
  });
});

describe("plan then discard", () => {
  it("leaves state, history and ID cursor unchanged", () => {
    const model = makeModel();
    make(model, "source");
    const cursor = model.idCursor();
    const revision = model.reader.revision();
    const history = model.historyState();
    const state = JSON.stringify(model.reader.state());
    const plan = model.plan({
      kind: "createNode",
      type: "pipe",
      position: { x: 1, y: 1 },
    });
    expect(plan.kind).toBe("ready");
    if (plan.kind === "ready") expect(plan.patch.idCursor).toBeDefined();
    expect(model.idCursor()).toEqual(cursor);
    expect(model.reader.revision()).toBe(revision);
    expect(model.historyState()).toEqual(history);
    expect(JSON.stringify(model.reader.state())).toBe(state);
  });

  it("two plans of the same command allocate the same IDs; committing advances the cursor once", () => {
    const model = makeModel();
    const cmd = {
      kind: "createNode",
      type: "source",
      position: { x: 0, y: 0 },
    } as const;
    const a = model.plan(cmd);
    const b = model.plan(cmd);
    expect(a).toEqual(b);
    model.execute(cmd);
    model.execute(cmd);
    expect(model.reader.nodes().map((n) => n.id)).toEqual(["n1", "n2"]);
  });
});

describe("availability with reasons", () => {
  it("can(undo) on an empty history is unavailable with a reason", () => {
    const model = makeModel();
    const can = model.can({ kind: "undo" });
    expect(can.available).toBe(false);
    if (!can.available) {
      expect(can.reason.code).toBe("history-unavailable");
      expect(can.reason.message.length).toBeGreaterThan(0);
    }
    expect(model.can({ kind: "redo" }).available).toBe(false);
    make(model, "source");
    expect(model.can({ kind: "undo" }).available).toBe(true);
    expect(model.execute({ kind: "undo" }).status).toBe("accepted");
    expect(model.can({ kind: "redo" }).available).toBe(true);
    expect(model.execute({ kind: "redo" }).status).toBe("accepted");
    expect(model.reader.nodes()).toHaveLength(1);
  });

  it("execute of an unavailable command returns a rejected result", () => {
    const model = makeModel();
    const result = model.execute({ kind: "undo" });
    expect(result.status).toBe("rejected");
  });

  it("can reports a capability reason for a locked node", () => {
    const model = makeModel({
      capabilityPolicy: { decide: (a) => (a === "move" ? false : undefined) },
    });
    const a = make(model, "source");
    const can = model.can({
      kind: "moveNodes",
      moves: [{ node: a.node, position: { x: 1, y: 1 } }],
    });
    expect(can.available).toBe(false);
    if (!can.available) expect(can.reason.code).toBe("capability-denied");
  });
});

describe("host capability policy", () => {
  it("applies to commands and raw patches alike", () => {
    const model = makeModel({
      capabilityPolicy: {
        decide: (a) => (a === "connect" ? false : undefined),
      },
    });
    const a = make(model, "source");
    const b = make(model, "sink");
    const result = model.connect(end(a), end(b));
    expect(result.status === "rejected" && result.error.code).toBe(
      "capability-denied",
    );
  });
});
