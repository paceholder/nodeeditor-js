import { describe, expect, it } from "vitest";
import { nodeId, operationId } from "../../base/ids/ids.js";
import { MisuseError, rejectionOf } from "../../base/result.js";
import { loadSnapshot } from "../snapshot/load.js";
import { settleEffect } from "./snapshot-settle.js";
import {
  fakeCreator,
  flush,
  hostSnapshot,
  moveOf,
  positionOf,
  retitle,
  seeded,
  submission,
  watch,
} from "./test-kit.js";

const A = nodeId("A");
const refusal = rejectionOf("conflict", "Refused by the store", ["A"]);

/** A pending move of A that a push omitting A turned into a conflict. */
function conflictedMove() {
  const s = seeded();
  const sub = submission(s.adapter, moveOf(s.adapter, "A", { x: 50, y: 5 }));
  s.adapter.submit(sub);
  s.adapter.pushSnapshot(
    hostSnapshot((snap) => {
      snap.nodes.splice(0, 1);
      snap.connections.length = 0;
    }),
  );
  expect(s.adapter.pendingEdits()[0]?.state).toBe("conflicted");
  return { ...s, sub, seen: watch(s.adapter) };
}

/** A pending move of A whose outcome the host reported as unknown. */
function unknownMove() {
  const s = seeded();
  const sub = submission(s.adapter, moveOf(s.adapter, "A", { x: 50, y: 5 }));
  s.adapter.submit(sub);
  s.adapter.settle(sub.operationId, { status: "unknown", reason: "lost" });
  expect(s.adapter.pendingEdits()[0]?.state).toBe("unknown");
  return { ...s, sub, seen: watch(s.adapter) };
}

describe("settling edits: one table for every answer", () => {
  it("the table names one effect for each state and answer", () => {
    const cells = (
      ["pending", "conflicted", "unknown", undefined] as const
    ).map((state) =>
      (["accepted", "rejected", "unknown"] as const).map((a) =>
        settleEffect(state, a),
      ),
    );
    expect(cells).toEqual([
      ["confirm", "roll-back", "mark-unknown"],
      ["retire", "report", "ignore"],
      ["confirm", "roll-back", "ignore"],
      ["ignore", "ignore", "ignore"],
    ]);
  });

  it("pending and unknown: the edit becomes unknown, its result settles unknown and a resynchronization is requested", async () => {
    const { adapter } = seeded();
    const seen = watch(adapter);
    const sub = submission(adapter, moveOf(adapter, "A", { x: 50, y: 5 }));
    const result = adapter.submit(sub);
    expect(
      adapter.settle(sub.operationId, { status: "unknown", reason: "lost" }),
    ).toBe(true);
    expect(adapter.pendingEdits()).toMatchObject([
      { state: "unknown", reason: "lost" },
    ]);
    expect(positionOf(adapter, "A")).toEqual({ x: 50, y: 5 });
    expect(seen.resyncs).toEqual([
      { operationId: sub.operationId, reason: "lost" },
    ]);
    if (result.status !== "pending") throw new Error("expected pending");
    expect(await result.settled).toEqual({
      ok: false,
      status: "unknown",
      operationId: sub.operationId,
      reason: "lost",
    });
  });

  it("conflicted and accepted: the edit leaves the pending layer and the display and confirmed state are unchanged", () => {
    const { adapter, sub, seen } = conflictedMove();
    const before = adapter.revision();
    expect(adapter.settle(sub.operationId, { status: "accepted" })).toBe(true);
    expect(adapter.pendingEdits()).toEqual([]);
    expect(adapter.reader.getNode(A)).toBeUndefined();
    expect(adapter.confirmedReader().getNode(A)).toBeUndefined();
    expect(adapter.revision()).toBe(before);
    expect(seen.changes).toEqual([]);
  });

  it("conflicted and rejected: the edit leaves with a failure event and no display change", () => {
    const { adapter, sub, seen } = conflictedMove();
    expect(
      adapter.settle(sub.operationId, {
        status: "rejected",
        rejection: refusal,
      }),
    ).toBe(true);
    expect(adapter.pendingEdits()).toEqual([]);
    expect(seen.changes).toEqual([]);
    expect(seen.failures).toMatchObject([
      { operationId: sub.operationId, rejection: refusal },
    ]);
  });

  it("conflicted and unknown: the edit stays conflicted, the answer is logged and nothing is settled", () => {
    const { adapter, sub, seen, logs } = conflictedMove();
    const logged = logs.length;
    expect(
      adapter.settle(sub.operationId, { status: "unknown", reason: "?" }),
    ).toBe(false);
    expect(adapter.pendingEdits()[0]?.state).toBe("conflicted");
    expect(seen.resyncs).toEqual([]);
    expect(logs.length).toBe(logged + 1);
  });

  it("unknown and accepted: the edit leaves the pending layer and its patch becomes confirmed state", () => {
    const { adapter, sub, seen } = unknownMove();
    expect(adapter.settle(sub.operationId, { status: "accepted" })).toBe(true);
    expect(adapter.pendingEdits()).toEqual([]);
    expect(adapter.confirmedReader().getNode(A)?.position).toEqual({
      x: 50,
      y: 5,
    });
    expect(seen.changes).toEqual([]);
  });

  it("unknown and rejected: the display is recomputed in one external change and a failure event carries the rejection", () => {
    const { adapter, sub, seen } = unknownMove();
    expect(
      adapter.settle(sub.operationId, {
        status: "rejected",
        rejection: refusal,
      }),
    ).toBe(true);
    expect(positionOf(adapter, "A")).toEqual({ x: 0, y: 0 });
    expect(seen.changes.map((c) => c.origin)).toEqual(["external"]);
    expect(seen.failures).toHaveLength(1);
  });

  it("unknown and unknown: the edit stays unknown, the answer is logged, and no second resynchronization is requested", () => {
    const { adapter, sub, seen, logs } = unknownMove();
    const logged = logs.length;
    expect(
      adapter.settle(sub.operationId, { status: "unknown", reason: "again" }),
    ).toBe(false);
    expect(adapter.pendingEdits()).toMatchObject([
      { state: "unknown", reason: "lost" },
    ]);
    expect(seen.resyncs).toEqual([]);
    expect(logs.length).toBe(logged + 1);
  });

  it("an answer for an operation the adapter never issued changes nothing, is logged and settles nothing", () => {
    const { adapter, logs } = seeded();
    const seen = watch(adapter);
    for (const answer of [
      { status: "accepted" } as const,
      { status: "rejected", rejection: refusal } as const,
      { status: "unknown", reason: "?" } as const,
    ]) {
      expect(adapter.settle(operationId("never"), answer)).toBe(false);
    }
    expect(logs).toHaveLength(3);
    expect([seen.changes, seen.failures, seen.resyncs]).toEqual([[], [], []]);
  });

  it("a promise answer followed by settle for the same edit changes nothing the second time", async () => {
    const { adapter, host, logs } = seeded();
    const sub = submission(adapter, moveOf(adapter, "A", { x: 50, y: 5 }));
    adapter.submit(sub);
    host.answer(sub.operationId, { status: "accepted" });
    await flush();
    const seen = watch(adapter);
    const logged = logs.length;
    expect(
      adapter.settle(sub.operationId, {
        status: "rejected",
        rejection: refusal,
      }),
    ).toBe(false);
    expect(positionOf(adapter, "A")).toEqual({ x: 50, y: 5 });
    expect([seen.changes, seen.failures]).toEqual([[], []]);
    expect(logs.length).toBe(logged + 1);
  });

  it("a malformed settle answer is misuse, and a malformed promise answer becomes an unknown outcome", async () => {
    const { adapter, host } = seeded();
    const sub = submission(adapter, moveOf(adapter, "A", { x: 50, y: 5 }));
    adapter.submit(sub);
    expect(() =>
      adapter.settle(sub.operationId, { status: "rejected" } as never),
    ).toThrow(MisuseError);
    host.answer(sub.operationId, { status: "maybe" } as never);
    await flush();
    expect(adapter.pendingEdits()[0]?.state).toBe("unknown");
  });
});

describe("settling edits when the document is replaced or the adapter disposed", () => {
  it("loadSnapshot with two pending edits and a placeholder settles all three as rejected with document-replaced, without rollback or failure events", async () => {
    const creator = fakeCreator();
    const { adapter } = seeded({
      nodeCreation: "delegated",
      onDelegate: creator.onDelegate,
    });
    const three = adapter.delegate({
      kind: "create-node",
      operationId: operationId("create1"),
      type: "box",
      position: { x: 300, y: 0 },
    });
    expect(adapter.placeholders()).toHaveLength(1);
    const one = adapter.submit(
      submission(adapter, moveOf(adapter, "A", { x: 50, y: 5 })),
    );
    const two = adapter.submit(
      submission(adapter, retitle(adapter, "B", "B2")),
    );
    const seen = watch(adapter);
    const resets: number[] = [];
    adapter.on("reset", (e) => resets.push(e.revision));
    const loaded = loadSnapshot(
      adapter,
      hostSnapshot((s) => {
        (s.nodes[0] as { title: string }).title = "loaded";
      }),
    );
    expect(loaded.ok).toBe(true);
    expect(adapter.pendingEdits()).toEqual([]);
    expect(adapter.reader.getNode(A)).toMatchObject({
      title: "loaded",
      position: { x: 0, y: 0 },
    });
    expect(adapter.reader.getNode(nodeId("B"))?.title).toBe("B");
    expect(adapter.confirmedReader().getNode(A)?.title).toBe("loaded");
    expect(seen.failures).toEqual([]);
    expect(seen.changes).toEqual([]);
    expect(resets).toHaveLength(1);
    expect(adapter.placeholders()).toEqual([]);
    for (const result of [one, two, three]) {
      if (result.status !== "pending") throw new Error("expected pending");
      expect(await result.settled).toMatchObject({
        status: "rejected",
        rejection: { code: "document-replaced" },
      });
    }
  });

  it("dispose settles every unsettled result as rejected with disposed and publishes nothing, even when the host answers later", async () => {
    const { adapter, host } = seeded();
    const seen = watch(adapter);
    const pending = adapter.submit(
      submission(adapter, moveOf(adapter, "A", { x: 50, y: 5 })),
    );
    seen.changes.length = 0;
    adapter.dispose();
    host.answer(host.calls[0]?.operationId ?? "", { status: "accepted" });
    await flush();
    if (pending.status !== "pending") throw new Error("expected pending");
    expect(await pending.settled).toMatchObject({
      status: "rejected",
      operationId: pending.operationId,
      rejection: { code: "disposed" },
    });
    expect([seen.changes, seen.failures, seen.resyncs]).toEqual([[], [], []]);
  });
});

describe("reentrancy contract: answers given from inside a handler are applied after the dispatch", () => {
  it("a settle call from a change handler leaves the edit pending until the dispatch ends", () => {
    const { adapter } = seeded();
    const sub = submission(adapter, moveOf(adapter, "A", { x: 50, y: 5 }));
    const during: string[] = [];
    let answered = false;
    adapter.on("change", () => {
      if (answered) return;
      answered = true;
      expect(
        adapter.settle(sub.operationId, {
          status: "rejected",
          rejection: refusal,
        }),
      ).toBe(true);
      during.push(adapter.pendingEdits()[0]?.state ?? "gone");
      during.push(JSON.stringify(positionOf(adapter, "A")));
    });
    adapter.submit(sub);
    expect(during).toEqual(["pending", JSON.stringify({ x: 50, y: 5 })]);
    expect(adapter.pendingEdits()).toEqual([]);
    expect(positionOf(adapter, "A")).toEqual({ x: 0, y: 0 });
  });
});
