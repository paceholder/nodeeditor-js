import { describe, expect, it, vi } from "vitest";
import { createCounterIdGenerator } from "../../base/ids/id-generator.js";
import { nodeId } from "../../base/ids/ids.js";
import { MisuseError } from "../../base/result.js";
import type { HistoryState } from "../../edit/adapter/types.js";
import {
  createSnapshotModel,
  type SnapshotModel,
} from "../../snapshot-model.js";
import type { HostAnswer } from "./sync-types.js";
import { flush, hostSnapshot, moveOf, seededModel, watch } from "./test-kit.js";

/** A host history whose answers and state the test controls. */
function hostHistory(initial: HistoryState) {
  let state = initial;
  const answers: ((a: HostAnswer) => void)[] = [];
  const onUndo = vi.fn(
    () => new Promise<HostAnswer>((resolve) => answers.push(resolve)),
  );
  const onRedo = vi.fn(
    () => new Promise<HostAnswer>((resolve) => answers.push(resolve)),
  );
  return {
    options: {
      history: "host" as const,
      onUndo,
      onRedo,
      historyState: () => state,
    },
    onUndo,
    set: (next: HistoryState) => {
      state = next;
    },
    answer: (a: HostAnswer) => answers.shift()?.(a),
  };
}

const _titleOf = (m: SnapshotModel, id: string) =>
  m.reader.getNode(nodeId(id))?.title;

describe("host-owned history in snapshot mode, availability through the command contract", () => {
  it("undo is forwarded to the host once, reported pending, and applies no local patch", async () => {
    const h = hostHistory({ canUndo: true, undoLabel: "Move", canRedo: false });
    const { model, host } = seededModel(h.options);
    const seen = watch(model);
    const before = model.revision();
    const result = model.execute({ kind: "undo" });
    if (result.status !== "pending") throw new Error("expected pending");
    expect(h.onUndo).toHaveBeenCalledTimes(1);
    expect(h.onUndo).toHaveBeenCalledWith({ operationId: result.operationId });
    expect(model.revision()).toBe(before);
    expect(host.calls).toEqual([]);
    expect(seen.changes).toEqual([]);
    h.answer({ status: "accepted" });
    expect(await result.settled).toMatchObject({
      ok: true,
      status: "accepted",
    });
    // The effect arrives as an ordinary push.
    model.pushSnapshot(
      hostSnapshot((s) => {
        (s.nodes[0] as { position: unknown }).position = { x: 9, y: 9 };
      }),
    );
    expect(seen.changes.map((c) => c.origin)).toEqual(["external"]);
  });

  it("the history state and the undo command report the host's availability and reason, and nothing reaches the host", () => {
    const h = hostHistory({
      canUndo: false,
      undoReason: "The server keeps no earlier version",
      canRedo: false,
      redoReason: "Nothing to redo",
    });
    const { model } = seededModel(h.options);
    expect(model.historyState().undoReason).toBe(
      "The server keeps no earlier version",
    );
    expect(model.can({ kind: "undo" })).toEqual({
      available: false,
      rejection: expect.objectContaining({
        code: "history-unavailable",
        message: "The server keeps no earlier version",
      }),
    });
    const result = model.execute({ kind: "undo" });
    expect(result).toMatchObject({ ok: false, status: "rejected" });
    expect(model.undo()).toMatchObject({ ok: false, status: "rejected" });
    expect(h.onUndo).not.toHaveBeenCalled();
  });

  it("availability follows the host's value after a push, and the user's edits leave no local entry", async () => {
    const h = hostHistory({ canUndo: false, canRedo: false });
    const { model, host } = seededModel(h.options);
    const seen = watch(model);
    const edit = model.submit(moveOf(model, "A", { x: 5, y: 5 }), {
      label: "Move",
    });
    host.answer(edit.operationId, { status: "accepted" });
    await flush();
    expect(model.historyState()).toEqual({ canUndo: false, canRedo: false });
    h.set({
      canUndo: true,
      undoLabel: "Move",
      canRedo: true,
      redoLabel: "Rename",
    });
    model.pushSnapshot(
      hostSnapshot((s) => {
        (s.nodes[0] as { position: unknown }).position = { x: 5, y: 5 };
      }),
    );
    expect(model.historyState()).toMatchObject({
      canRedo: true,
      redoLabel: "Rename",
    });
    expect(seen.histories.at(-1)).toMatchObject({ canRedo: true });
    expect(model.can({ kind: "redo" })).toEqual({ available: true });
  });

  it("a host undo refusal carries the host's rejection, and an unknown answer requests resynchronization", async () => {
    const h = hostHistory({ canUndo: true, undoLabel: "Move", canRedo: false });
    const { model } = seededModel(h.options);
    const seen = watch(model);
    const refused = model.undo();
    const rejection = {
      code: "conflict" as const,
      message: "Changed elsewhere",
      entities: [],
    };
    h.answer({ status: "rejected", rejection });
    if (refused.status !== "pending") throw new Error("expected pending");
    expect(await refused.settled).toMatchObject({
      status: "rejected",
      rejection,
    });
    expect(
      seen.failures.map((f) => f.source === "rejection" && f.rejection),
    ).toEqual([rejection]);
    const lost = model.undo();
    h.answer({ status: "unknown", reason: "connection dropped" });
    if (lost.status !== "pending") throw new Error("expected pending");
    expect(await lost.settled).toMatchObject({ status: "unknown" });
    expect(seen.resyncs).toEqual([
      { operationId: lost.operationId, reason: "connection dropped" },
    ]);
  });
});

describe("host-owned history needs its host callbacks", () => {
  it("host history without onUndo, onRedo or a historyState provider is misuse", () => {
    const untyped = {
      idGenerator: createCounterIdGenerator(),
      onSubmit: async () => ({ status: "accepted" as const }),
      history: "host",
    };
    // @ts-expect-error the host callbacks are required
    expect(() => createSnapshotModel(untyped)).toThrow(MisuseError);
  });
});
