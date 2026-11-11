import { describe, expect, it } from "vitest";
import { createCounterIdGenerator } from "../../base/ids/id-generator.js";
import { MisuseError } from "../../base/result.js";
import { createSnapshotAdapter } from "./snapshot-adapter.js";
import {
  fakeHost,
  flush,
  hostSnapshot,
  manualTimers,
  moveOf,
  positionOf,
  seeded,
  submission,
  watch,
} from "./test-kit.js";

describe("unknown outcome and resynchronization, without blind retry", () => {
  it("a lost acknowledgment marks the edit unknown, publishes one resync request and never calls the host again", async () => {
    const { adapter, host } = seeded();
    const seen = watch(adapter);
    const sub = submission(adapter, moveOf(adapter, "A", { x: 50, y: 5 }));
    adapter.submit(sub);
    host.answer(sub.operationId, {
      status: "unknown",
      reason: "connection dropped",
    });
    await flush();
    expect(adapter.pendingEdits()).toMatchObject([
      {
        operationId: sub.operationId,
        state: "unknown",
        reason: "connection dropped",
      },
    ]);
    expect(positionOf(adapter, "A")).toEqual({ x: 50, y: 5 });
    expect(seen.resyncs).toEqual([
      { operationId: sub.operationId, reason: "connection dropped" },
    ]);
    adapter.pushSnapshot(hostSnapshot());
    await flush();
    expect(host.calls).toEqual([sub]);
  });

  it("with a fake clock, silence past timeoutMs becomes an unknown outcome once, with a plain-text reason", async () => {
    const timers = manualTimers();
    const { adapter, host } = seeded({ timeoutMs: 5000, timers });
    const seen = watch(adapter);
    const sub = submission(adapter, moveOf(adapter, "A", { x: 50, y: 5 }));
    const result = adapter.submit(sub);
    expect(timers.active()).toBe(1);
    timers.fire();
    expect(adapter.pendingEdits()[0]).toMatchObject({
      state: "unknown",
      reason: "The host did not answer within 5000 ms",
    });
    expect(seen.resyncs).toHaveLength(1);
    timers.fire();
    expect(seen.resyncs).toHaveLength(1);
    expect(host.calls).toHaveLength(1);
    if (result.status !== "pending") throw new Error("expected pending");
    expect(await result.settled).toMatchObject({
      ok: false,
      status: "unknown",
    });
  });

  it("an answer before the timeout stops the clock", async () => {
    const timers = manualTimers();
    const { adapter, host } = seeded({ timeoutMs: 5000, timers });
    const sub = submission(adapter, moveOf(adapter, "A", { x: 50, y: 5 }));
    adapter.submit(sub);
    host.answer(sub.operationId, { status: "accepted" });
    await flush();
    expect(timers.active()).toBe(0);
    expect(adapter.pendingEdits()).toEqual([]);
  });

  it("an unknown edit is rebased by the resync push and then settled by the host, leaving the display unchanged", async () => {
    const timers = manualTimers();
    const { adapter, host } = seeded({ timeoutMs: 5000, timers });
    const sub = submission(adapter, moveOf(adapter, "A", { x: 50, y: 5 }));
    adapter.submit(sub);
    timers.fire();
    const seen = watch(adapter);
    adapter.pushSnapshot(
      hostSnapshot((s) => {
        (s.nodes[0] as { position: unknown }).position = { x: 50, y: 5 };
      }),
    );
    expect(seen.changes).toEqual([]);
    expect(adapter.pendingEdits()[0]?.state).toBe("unknown");
    expect(adapter.settle(sub.operationId, { status: "accepted" })).toBe(true);
    await flush();
    expect(adapter.pendingEdits()).toEqual([]);
    expect(positionOf(adapter, "A")).toEqual({ x: 50, y: 5 });
    expect(seen.changes).toEqual([]);
    expect(host.calls).toHaveLength(1);
  });

  it("a host callback that throws or fails leaves the edit unknown instead of retrying it", async () => {
    const host = fakeHost();
    const { adapter } = seeded({
      onSubmit: (s) => {
        if (s.label === "throws") throw new Error("offline");
        return host.onSubmit(s);
      },
    });
    const seen = watch(adapter);
    adapter.submit(
      submission(adapter, moveOf(adapter, "A", { x: 1, y: 1 }), "throws"),
    );
    const second = submission(adapter, moveOf(adapter, "B", { x: 1, y: 1 }));
    adapter.submit(second);
    host.fail(second.operationId, new Error("socket closed"));
    await flush();
    expect(adapter.pendingEdits().map((e) => [e.state, e.reason])).toEqual([
      ["unknown", "The host callback threw: offline"],
      ["unknown", "The host callback failed: socket closed"],
    ]);
    expect(seen.resyncs).toHaveLength(2);
    expect(host.calls).toHaveLength(1);
  });

  it("a timeout that is not a positive number is misuse", () => {
    for (const timeoutMs of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() =>
        createSnapshotAdapter({
          idGenerator: createCounterIdGenerator(),
          onSubmit: fakeHost().onSubmit,
          timeoutMs,
        }),
      ).toThrow(MisuseError);
    }
  });
});
