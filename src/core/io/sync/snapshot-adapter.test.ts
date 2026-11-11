import { describe, expect, it } from "vitest";
import { nodeId } from "../../base/ids/ids.js";
import { rejectionOf } from "../../base/result.js";
import type { ChangeEvent, FailureEvent } from "../../edit/events/types.js";
import {
  flush,
  hostSnapshot,
  moveOf,
  positionOf,
  retitle,
  seeded,
  submission,
} from "./test-kit.js";

const A = nodeId("A");

describe("snapshot adapter edit flow and the pending layer and edit states", () => {
  it("shows a submitted move at once while the confirmed state keeps the old position and the edit is pending", () => {
    const { adapter, host } = seeded();
    const sub = submission(adapter, moveOf(adapter, "A", { x: 50, y: 5 }));
    const result = adapter.submit(sub);
    expect(result.status).toBe("pending");
    expect(positionOf(adapter, "A")).toEqual({ x: 50, y: 5 });
    expect(adapter.confirmedReader().getNode(A)?.position).toEqual({
      x: 0,
      y: 0,
    });
    expect(adapter.pendingEdits()).toMatchObject([
      { operationId: sub.operationId, state: "pending", label: "Edit" },
    ]);
    expect(host.calls).toEqual([sub]);
  });

  it("hands the host the operation ID, the base revision and the patch", () => {
    const { adapter, host } = seeded();
    const revision = adapter.revision();
    const sub = submission(adapter, moveOf(adapter, "A", { x: 1, y: 1 }));
    adapter.submit(sub);
    expect(host.calls[0]).toMatchObject({
      operationId: sub.operationId,
      baseRevision: revision,
      patch: sub.patch,
    });
  });

  it("an acceptance retires the edit without a second change event and advances the confirmed state", async () => {
    const { adapter, host } = seeded();
    const changes: ChangeEvent[] = [];
    adapter.on("change", (e) => changes.push(e));
    const sub = submission(adapter, moveOf(adapter, "A", { x: 50, y: 5 }));
    const result = adapter.submit(sub);
    expect(changes).toHaveLength(1);
    host.answer(sub.operationId, { status: "accepted" });
    await flush();
    expect(changes).toHaveLength(1);
    expect(adapter.pendingEdits()).toEqual([]);
    expect(adapter.confirmedReader().getNode(A)?.position).toEqual({
      x: 50,
      y: 5,
    });
    expect(positionOf(adapter, "A")).toEqual({ x: 50, y: 5 });
    if (result.status !== "pending") throw new Error("expected pending");
    expect(await result.settled).toMatchObject({
      ok: true,
      status: "accepted",
      operationId: sub.operationId,
      changed: { nodes: ["A"] },
    });
  });

  it("a rejection recomputes the display in one external change and a failure event carries the host's rejection", async () => {
    const { adapter, host } = seeded();
    const sub = submission(adapter, moveOf(adapter, "A", { x: 50, y: 5 }));
    const result = adapter.submit(sub);
    const changes: ChangeEvent[] = [];
    const failures: FailureEvent[] = [];
    adapter.on("change", (e) => changes.push(e));
    adapter.on("failure", (e) => failures.push(e));
    const refusal = rejectionOf("conflict", "The store refused the move", [
      "A",
    ]);
    host.answer(sub.operationId, { status: "rejected", rejection: refusal });
    await flush();
    expect(positionOf(adapter, "A")).toEqual({ x: 0, y: 0 });
    expect(changes).toHaveLength(1);
    expect(changes[0]?.origin).toBe("external");
    expect(changes[0]?.patch.ops).toHaveLength(1);
    expect(failures).toEqual([
      {
        source: "rejection",
        operationId: sub.operationId,
        origin: "local",
        rejection: refusal,
      },
    ]);
    expect(adapter.pendingEdits()).toEqual([]);
    if (result.status !== "pending") throw new Error("expected pending");
    expect(await result.settled).toEqual({
      ok: false,
      status: "rejected",
      operationId: sub.operationId,
      rejection: refusal,
    });
  });

  it("fills a host rejection without entities with the IDs the edit touched", async () => {
    const { adapter, host } = seeded();
    const failures: FailureEvent[] = [];
    adapter.on("failure", (e) => failures.push(e));
    const sub = submission(adapter, moveOf(adapter, "A", { x: 9, y: 9 }));
    adapter.submit(sub);
    host.answer(sub.operationId, {
      status: "rejected",
      rejection: rejectionOf("conflict", "No"),
    });
    await flush();
    expect(failures[0]).toMatchObject({ rejection: { entities: ["A"] } });
  });

  it("a validator refusal is rejected at once and never reaches the host", () => {
    const { adapter, host } = seeded();
    adapter.addValidator({
      validate: () => rejectionOf("capability-denied", "Locked"),
    });
    const result = adapter.submit(
      submission(adapter, moveOf(adapter, "A", { x: 3, y: 3 })),
    );
    expect(result).toMatchObject({ ok: false, status: "rejected" });
    expect(host.calls).toEqual([]);
    expect(positionOf(adapter, "A")).toEqual({ x: 0, y: 0 });
  });
});

describe("library read model: a slow host does not block reads", () => {
  it("reads stay synchronous while the host never answers, and the result is deferred through settled", () => {
    const { adapter } = seeded();
    const result = adapter.submit(
      submission(adapter, retitle(adapter, "B", "renamed")),
    );
    expect("ok" in result).toBe(false);
    expect(result.status).toBe("pending");
    if (result.status === "pending")
      expect(result.settled).toBeInstanceOf(Promise);
    expect(adapter.reader.getNode(nodeId("B"))?.title).toBe("renamed");
    expect(adapter.reader.nodes()).toHaveLength(2);
  });
});

describe("tagged edits: outcomes are structured results", () => {
  it("the accepted outcome's revision is the displayed revision at the moment the edit settles", async () => {
    const { adapter, host } = seeded();
    const sub = submission(adapter, moveOf(adapter, "A", { x: 50, y: 5 }));
    const result = adapter.submit(sub);
    const afterSubmit = adapter.revision();
    adapter.pushSnapshot(
      hostSnapshot((s) => {
        (s.nodes[1] as { title: string }).title = "B2";
      }),
    );
    expect(adapter.revision()).toBe(afterSubmit + 1);
    host.answer(sub.operationId, { status: "accepted" });
    if (result.status !== "pending") throw new Error("expected pending");
    const settled = await result.settled;
    expect(settled).toMatchObject({
      status: "accepted",
      revision: afterSubmit + 1,
    });
  });
});

describe("the base revision is checked like the local adapter does, and queued submissions are checked when submitted", () => {
  it("a submission planned against an older revision is rejected with stale-revision without calling the host", () => {
    const { adapter, host } = seeded();
    const read = adapter.revision();
    const patch = moveOf(adapter, "A", { x: 7, y: 7 });
    adapter.pushSnapshot(
      hostSnapshot((s) => {
        (s.nodes[1] as { title: string }).title = "B2";
      }),
    );
    const failures: FailureEvent[] = [];
    adapter.on("failure", (e) => failures.push(e));
    const result = adapter.submit({
      ...submission(adapter, patch),
      baseRevision: read,
    });
    expect(result).toMatchObject({
      ok: false,
      status: "rejected",
      rejection: { code: "stale-revision" },
    });
    expect(host.calls).toEqual([]);
    expect(positionOf(adapter, "A")).toEqual({ x: 0, y: 0 });
    expect(failures).toHaveLength(1);
  });

  it("two edits queued from one change handler are both applied and handed to the host in order", async () => {
    const { adapter, host } = seeded();
    const queued: string[] = [];
    let first = true;
    adapter.on("change", () => {
      if (!first) return;
      first = false;
      const one = adapter.submit(
        submission(adapter, retitle(adapter, "A", "A1")),
      );
      const two = adapter.submit(
        submission(adapter, moveOf(adapter, "B", { x: 1, y: 2 })),
      );
      queued.push(one.status, two.status);
    });
    adapter.submit(submission(adapter, moveOf(adapter, "A", { x: 5, y: 5 })));
    expect(queued).toEqual(["queued", "queued"]);
    expect(host.calls.map((c) => c.label)).toEqual(["Edit", "Edit", "Edit"]);
    expect(host.calls).toHaveLength(3);
    expect(adapter.reader.getNode(A)?.title).toBe("A1");
    expect(positionOf(adapter, "B")).toEqual({ x: 1, y: 2 });
    expect(adapter.pendingEdits().map((e) => e.state)).toEqual([
      "pending",
      "pending",
      "pending",
    ]);
  });

  it("a later edit is handed over without waiting for the answer to an earlier one", () => {
    const { adapter, host } = seeded();
    adapter.submit(submission(adapter, moveOf(adapter, "A", { x: 5, y: 5 })));
    adapter.submit(submission(adapter, retitle(adapter, "A", "A1")));
    expect(host.calls).toHaveLength(2);
    const [one, two] = host.calls;
    expect(two?.baseRevision).toBe((one?.baseRevision ?? -1) + 1);
  });
});
