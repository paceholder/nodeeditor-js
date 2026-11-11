import { describe, expect, it } from "vitest";
import {
  flush,
  hostSnapshot,
  moveOf,
  retitle,
  seeded,
  submission,
  watch,
} from "./test-kit.js";

const withoutA = () =>
  hostSnapshot((s) => {
    s.nodes.splice(0, 1);
    s.connections.length = 0;
  });

describe("conflict reporting, and pending edits rebase on a push", () => {
  it("a push removing the target of a pending move publishes one conflict event naming the operation and the node, after the change", () => {
    const { adapter, logs } = seeded();
    const sub = submission(adapter, moveOf(adapter, "A", { x: 50, y: 5 }));
    adapter.submit(sub);
    const seen = watch(adapter);
    adapter.pushSnapshot(withoutA());
    expect(seen.conflicts).toEqual([
      {
        operationId: sub.operationId,
        reason: "it no longer applies to the pushed snapshot",
        entities: ["A"],
      },
    ]);
    // The history event follows: the conflicted edit left the undo stack.
    expect(seen.events).toEqual(["change:external", "conflict", "history"]);
    expect(adapter.pendingEdits()).toMatchObject([
      { operationId: sub.operationId, state: "conflicted" },
    ]);
    expect(logs.at(-1)?.operationId).toBe(sub.operationId);
    // A later push keeps it listed and does not report it again.
    adapter.pushSnapshot(withoutA());
    expect(seen.conflicts).toHaveLength(1);
    expect(adapter.pendingEdits()[0]?.state).toBe("conflicted");
  });

  it("a conflict changes the display only by dropping the edit", () => {
    const { adapter } = seeded();
    adapter.submit(submission(adapter, retitle(adapter, "A", "Pump")));
    adapter.submit(submission(adapter, moveOf(adapter, "B", { x: 7, y: 7 })));
    const seen = watch(adapter);
    adapter.pushSnapshot(
      hostSnapshot((s) => {
        (s.nodes[0] as { title: string }).title = "Changed elsewhere";
      }),
    );
    expect(seen.conflicts.map((c) => c.entities)).toEqual([["A"]]);
    expect(adapter.reader.getNode("A" as never)?.title).toBe(
      "Changed elsewhere",
    );
    expect(adapter.reader.getNode("B" as never)?.position).toEqual({
      x: 7,
      y: 7,
    });
  });

  it("an edit that no longer applies after an earlier rejection is reported once as a conflict", async () => {
    const { adapter, host } = seeded();
    const first = submission(adapter, moveOf(adapter, "A", { x: 1, y: 1 }));
    adapter.submit(first);
    const second = submission(adapter, moveOf(adapter, "A", { x: 2, y: 2 }));
    adapter.submit(second);
    const seen = watch(adapter);
    host.answer(first.operationId, {
      status: "rejected",
      rejection: { code: "conflict", message: "Locked", entities: [] },
    });
    await flush();
    expect(seen.conflicts).toMatchObject([
      { operationId: second.operationId, entities: ["A"] },
    ]);
    expect(seen.conflicts[0]?.reason).toMatch(/earlier edit was rejected/);
  });
});

describe("unconfirmed flag per entity", () => {
  it("a pending move reports its node unconfirmed and the others confirmed, until the host accepts", async () => {
    const { adapter, host } = seeded();
    const sub = submission(adapter, moveOf(adapter, "A", { x: 50, y: 5 }));
    adapter.submit(sub);
    const flags = adapter.unconfirmed();
    expect([...flags.nodes]).toEqual(["A"]);
    expect(flags.nodes.has("B" as never)).toBe(false);
    expect(flags.ports.size + flags.connections.size).toBe(0);
    host.answer(sub.operationId, { status: "accepted" });
    await flush();
    expect(adapter.unconfirmed().nodes.size).toBe(0);
  });

  it("an unknown edit keeps its entities unconfirmed, and a conflicted one shows confirmed state", async () => {
    const { adapter, host } = seeded();
    const move = submission(adapter, moveOf(adapter, "B", { x: 9, y: 9 }));
    adapter.submit(move);
    host.answer(move.operationId, { status: "unknown", reason: "lost" });
    await flush();
    adapter.submit(submission(adapter, moveOf(adapter, "A", { x: 1, y: 1 })));
    expect([...adapter.unconfirmed().nodes].sort()).toEqual(["A", "B"]);
    adapter.pushSnapshot(
      hostSnapshot((s) => {
        s.nodes.splice(0, 1);
        s.connections.length = 0;
      }),
    );
    expect([...adapter.unconfirmed().nodes]).toEqual(["B"]);
  });

  it("a connection an edit removes is unconfirmed while the host has not answered", () => {
    const { adapter } = seeded();
    const connection = adapter.reader.connections()[0];
    if (!connection) throw new Error("no connection");
    adapter.submit(
      submission(adapter, {
        ops: [
          {
            op: "remove",
            entity: "connection",
            record: connection,
            seq: adapter.reader.seqOf(connection.id) ?? 0,
          },
        ],
      }),
    );
    expect([...adapter.unconfirmed().connections]).toEqual(["AB"]);
  });
});
