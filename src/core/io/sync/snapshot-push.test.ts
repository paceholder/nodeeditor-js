import { describe, expect, it } from "vitest";
import { nodeId } from "../../base/ids/ids.js";
import { ok, rejectionOf } from "../../base/result.js";
import { createPayloadCodecRegistry } from "../snapshot/snapshot-errors.js";
import type { PushOutcome, PushResult } from "./sync-types.js";
import {
  flush,
  hostSnapshot,
  moveOf,
  positionOf,
  seeded,
  submission,
  watch,
} from "./test-kit.js";

const A = nodeId("A");
const B = nodeId("B");

const renamedB = (title = "B2") =>
  hostSnapshot((s) => {
    (s.nodes[1] as { title: string }).title = title;
  });

function applied(
  result: PushResult,
): Extract<PushOutcome, { status: "applied" }> {
  if (result.status !== "applied") throw new Error(JSON.stringify(result));
  return result;
}

function refusedAt(result: PushResult) {
  if (result.status !== "refused") throw new Error(JSON.stringify(result));
  return result.rejection.map((e) => `${e.code}@${e.path}`);
}

describe("a snapshot push is an incremental external change, not a reset", () => {
  it("a push that renames one node publishes one change with a single update, no reset and no history change", () => {
    const { adapter } = seeded();
    const seen = watch(adapter);
    const historyBefore = adapter.historyState();
    const recordA = adapter.reader.getNode(A);
    const result = applied(adapter.pushSnapshot(renamedB()));
    expect(result.operations).toBe(1);
    expect(seen.events).toEqual(["change:external"]);
    expect(seen.changes[0]?.patch.ops).toEqual([
      {
        op: "update",
        entity: "node",
        id: B,
        fields: { title: { old: "B", new: "B2" } },
      },
    ]);
    expect(adapter.reader.getNode(A)).toBe(recordA);
    expect(adapter.historyState()).toEqual(historyBefore);
    expect(adapter.confirmedReader().getNode(B)?.title).toBe("B2");
  });

  it("a push equal to the confirmed state publishes nothing and keeps the revision", () => {
    const { adapter } = seeded();
    const seen = watch(adapter);
    const before = adapter.revision();
    expect(applied(adapter.pushSnapshot(hostSnapshot())).operations).toBe(0);
    expect(seen.events).toEqual([]);
    expect(adapter.revision()).toBe(before);
  });

  it("pushed changes are not undo entries: they carry origin external and touch no history", () => {
    const { adapter } = seeded();
    const seen = watch(adapter);
    adapter.pushSnapshot(renamedB());
    expect(seen.changes.map((c) => c.origin)).toEqual(["external"]);
    expect(seen.events).not.toContain("history");
    expect(adapter.historyState().canUndo).toBe(false);
  });

  it("a push from inside a change handler is queued, applied after the dispatch in call order, and its result is deferred", async () => {
    const { adapter } = seeded();
    const statuses: string[] = [];
    const results: PushResult[] = [];
    let first = true;
    adapter.on("change", () => {
      if (!first) return;
      first = false;
      results.push(adapter.pushSnapshot(renamedB("one")));
      results.push(adapter.pushSnapshot(renamedB("two")));
      statuses.push(adapter.reader.getNode(B)?.title ?? "");
    });
    adapter.submit(submission(adapter, moveOf(adapter, "A", { x: 5, y: 5 })));
    expect(results.map((r) => r.status)).toEqual(["queued", "queued"]);
    expect(statuses).toEqual(["B"]);
    expect(adapter.reader.getNode(B)?.title).toBe("two");
    const outcomes = await Promise.all(
      results.map((r) => (r.status === "queued" ? r.settled : r)),
    );
    expect(outcomes.map((o) => o.status)).toEqual(["applied", "applied"]);
    const [one, two] = outcomes;
    if (one?.ok && two?.ok) expect(two.revision).toBe(one.revision + 1);
  });
});

describe("validate before replace: a refused push changes nothing", () => {
  it("a connection to a missing port is refused at its path and the read model and pending edits are unchanged", () => {
    const { adapter } = seeded();
    adapter.submit(submission(adapter, moveOf(adapter, "A", { x: 50, y: 5 })));
    const pendingBefore = adapter.pendingEdits();
    const revision = adapter.revision();
    const seen = watch(adapter);
    const result = adapter.pushSnapshot(
      hostSnapshot((s) => {
        (s.connections[0] as { to: unknown }).to = {
          node: "B",
          port: "missing",
        };
      }),
    );
    expect(refusedAt(result)).toEqual([
      "dangling-endpoint@connections[0].to.port",
    ]);
    expect(adapter.pendingEdits()).toEqual(pendingBefore);
    expect(adapter.revision()).toBe(revision);
    expect(positionOf(adapter, "A")).toEqual({ x: 50, y: 5 });
    expect(seen.events).toEqual([]);
  });

  it("a node outside the world range and a connection with more than 256 route constraints are refused at their paths", () => {
    const { adapter } = seeded();
    const far = adapter.pushSnapshot(
      hostSnapshot((s) => {
        (s.nodes[0] as { position: unknown }).position = { x: 2e7, y: 0 };
      }),
    );
    expect(refusedAt(far)).toEqual(["out-of-range@nodes[0]"]);
    const route = Array.from({ length: 300 }, (_, i) => ({
      kind: "via",
      point: { x: i, y: 0 },
    }));
    const long = adapter.pushSnapshot(
      hostSnapshot((s) => {
        (s.connections[0] as { route: unknown }).route = route;
      }),
    );
    expect(refusedAt(long)).toEqual(["limit-exceeded@connections[0].route"]);
    expect(adapter.reader.getNode(A)?.position).toEqual({ x: 0, y: 0 });
  });

  it("a push larger than the configured size limits is refused and nothing changes", () => {
    const { adapter } = seeded({ pushLimits: { maxNodes: 2 } });
    const seen = watch(adapter);
    const result = adapter.pushSnapshot(
      hostSnapshot((s) => {
        s.nodes.push({ ...s.nodes[1], id: "C", ports: [] });
      }),
    );
    expect(refusedAt(result)[0]).toMatch(/^limit-exceeded@/);
    expect(adapter.reader.nodes()).toHaveLength(2);
    expect(seen.events).toEqual([]);
  });

  it("a payload codec that fails while the push is diffed is returned as the push's rejections and nothing changes", () => {
    const codecs = createPayloadCodecRegistry();
    codecs.register("box", {
      decode: (json) => ok(json),
      encode: (value) =>
        (value as { poison?: boolean } | null)?.poison
          ? {
              ok: false,
              rejection: rejectionOf("non-json-payload", "cannot encode"),
            }
          : ok(value as never),
    });
    const { adapter } = seeded({ codecs });
    adapter.pushSnapshot(
      hostSnapshot((s) => {
        (s.nodes[0] as { payload: unknown }).payload = { poison: true };
      }),
    );
    const revision = adapter.revision();
    const seen = watch(adapter);
    const result = adapter.pushSnapshot(renamedB());
    expect(refusedAt(result)).toEqual(["non-json-payload@nodes[0].payload"]);
    expect(adapter.revision()).toBe(revision);
    expect(adapter.reader.getNode(B)?.title).toBe("B");
    expect(adapter.confirmedReader().getNode(B)?.title).toBe("B");
    expect(seen.events).toEqual([]);
  });
});

describe("pending edits rebase on a push and are re-applied over incoming changes", () => {
  it("a push renaming B during a pending move of A shows both, in one change event, and the move stays pending", () => {
    const { adapter } = seeded();
    adapter.submit(submission(adapter, moveOf(adapter, "A", { x: 50, y: 5 })));
    const seen = watch(adapter);
    adapter.pushSnapshot(renamedB());
    expect(seen.changes).toHaveLength(1);
    expect(seen.changes[0]?.patch.ops.map((op) => op.op)).toEqual(["update"]);
    expect(adapter.reader.getNode(B)?.title).toBe("B2");
    expect(positionOf(adapter, "A")).toEqual({ x: 50, y: 5 });
    expect(adapter.confirmedReader().getNode(A)?.position).toEqual({
      x: 0,
      y: 0,
    });
    expect(adapter.pendingEdits().map((e) => e.state)).toEqual(["pending"]);
  });

  it("a push already holding the pending position emits nothing for A, and a later rejection leaves the pushed value", async () => {
    const { adapter, host } = seeded();
    const sub = submission(adapter, moveOf(adapter, "A", { x: 50, y: 5 }));
    adapter.submit(sub);
    const seen = watch(adapter);
    applied(
      adapter.pushSnapshot(
        hostSnapshot((s) => {
          (s.nodes[0] as { position: unknown }).position = { x: 50, y: 5 };
        }),
      ),
    );
    expect(seen.changes).toEqual([]);
    expect(adapter.pendingEdits().map((e) => e.state)).toEqual(["pending"]);
    host.answer(sub.operationId, {
      status: "rejected",
      rejection: rejectionOf("conflict", "Refused", ["A"]),
    });
    await flush();
    expect(positionOf(adapter, "A")).toEqual({ x: 50, y: 5 });
    expect(seen.changes).toEqual([]);
    expect(seen.failures).toHaveLength(1);
    expect(adapter.pendingEdits()).toEqual([]);
  });

  it("a push already holding the edit still leaves it to the host's answer", async () => {
    const { adapter, host } = seeded();
    const sub = submission(adapter, moveOf(adapter, "A", { x: 50, y: 5 }));
    adapter.submit(sub);
    adapter.pushSnapshot(
      hostSnapshot((s) => {
        (s.nodes[0] as { position: unknown }).position = { x: 50, y: 5 };
      }),
    );
    host.answer(sub.operationId, { status: "accepted" });
    await flush();
    expect(adapter.pendingEdits()).toEqual([]);
    expect(adapter.confirmedReader().getNode(A)?.position).toEqual({
      x: 50,
      y: 5,
    });
  });

  it("a push deleting the target of a pending move removes A from the display and marks the move conflicted", () => {
    const { adapter } = seeded();
    const sub = submission(adapter, moveOf(adapter, "A", { x: 50, y: 5 }));
    adapter.submit(sub);
    const seen = watch(adapter);
    adapter.pushSnapshot(
      hostSnapshot((s) => {
        s.nodes.splice(0, 1);
        s.connections.length = 0;
      }),
    );
    expect(adapter.reader.getNode(A)).toBeUndefined();
    expect(seen.changes).toHaveLength(1);
    expect(adapter.pendingEdits()).toMatchObject([
      { operationId: sub.operationId, state: "conflicted" },
    ]);
    // A conflicted edit stays out of later pushes until the host settles it.
    adapter.pushSnapshot(hostSnapshot());
    expect(positionOf(adapter, "A")).toEqual({ x: 0, y: 0 });
    expect(adapter.pendingEdits()[0]?.state).toBe("conflicted");
  });
});
