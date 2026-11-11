import { describe, expect, it } from "vitest";
import { loadSnapshot } from "../snapshot/load.js";
import {
  flush,
  hostSnapshot,
  moveOf,
  positionOf,
  retitle,
  seededModel,
  titleOf,
} from "./test-kit.js";

describe("local history in snapshot mode: entries follow the host's answers, and pushes are not undo entries", () => {
  it("an entry is on the stack from commit, and undo while the newest edit is pending is refused with edit-pending", async () => {
    const { model, host } = seededModel();
    model.submit(moveOf(model, "A", { x: 5, y: 5 }), { label: "Move" });
    const rename = model.submit(retitle(model, "A", "Pump"), {
      label: "Rename",
    });
    const state = model.historyState();
    expect(state).toMatchObject({ canUndo: false, undoCode: "edit-pending" });
    expect(state.undoReason).toMatch(/waiting for the host/i);
    const [move] = host.calls;
    host.answer(move?.operationId ?? "", { status: "accepted" });
    await flush();
    const before = model.revision();
    expect(model.undo()).toMatchObject({
      status: "rejected",
      rejection: { code: "edit-pending" },
    });
    expect(model.execute({ kind: "undo" })).toMatchObject({
      rejection: { code: "edit-pending" },
    });
    expect(model.revision()).toBe(before);
    expect(host.calls).toHaveLength(2);

    host.answer(rename.operationId, { status: "accepted" });
    await flush();
    expect(model.historyState()).toMatchObject({
      canUndo: true,
      undoLabel: "Rename",
    });
    const undo = model.undo();
    expect(undo.status).toBe("pending");
    expect(titleOf(model, "A")).toBe("A");
    expect(host.calls[2]).toMatchObject({
      origin: "undo",
      label: "Undo Rename",
    });
    expect(host.calls[2]?.patch.ops).toEqual([
      expect.objectContaining({
        op: "update",
        fields: { title: { old: "Pump", new: "A" } },
      }),
    ]);
  });

  it("undo of a confirmed edit submits its inverse, and redo after it re-submits the patch", async () => {
    const { model, host } = seededModel();
    const move = model.submit(moveOf(model, "A", { x: 5, y: 5 }), {
      label: "Move",
    });
    host.answer(move.operationId, { status: "accepted" });
    await flush();
    const undo = model.undo();
    expect(positionOf(model, "A")).toEqual({ x: 0, y: 0 });
    expect(model.historyState()).toMatchObject({
      canRedo: false,
      redoCode: "edit-pending",
    });
    host.answer(undo.operationId, { status: "accepted" });
    await flush();
    expect(model.historyState()).toMatchObject({
      canUndo: false,
      canRedo: true,
      redoLabel: "Move",
    });
    const redo = model.redo();
    expect(host.calls[2]).toMatchObject({
      origin: "redo",
      operationId: redo.operationId,
    });
    expect(positionOf(model, "A")).toEqual({ x: 5, y: 5 });
  });

  it("an edit the host rejects leaves the stack, and undo then reverts the edit before it", async () => {
    const { model, host } = seededModel();
    const moveA = model.submit(moveOf(model, "A", { x: 5, y: 5 }), {
      label: "Move A",
    });
    const moveB = model.submit(moveOf(model, "B", { x: 50, y: 50 }), {
      label: "Move B",
    });
    host.answer(moveA.operationId, { status: "accepted" });
    host.answer(moveB.operationId, {
      status: "rejected",
      rejection: { code: "conflict", message: "Locked", entities: [] },
    });
    await flush();
    expect(model.historyState()).toMatchObject({
      canUndo: true,
      undoLabel: "Move A",
    });
    model.undo();
    expect(positionOf(model, "A")).toEqual({ x: 0, y: 0 });
    expect(positionOf(model, "B")).toEqual({ x: 100, y: 0 });
  });

  it("an edit marked conflicted by a push leaves the stack", () => {
    const { model } = seededModel();
    model.submit(moveOf(model, "A", { x: 5, y: 5 }), { label: "Move" });
    model.pushSnapshot(
      hostSnapshot((s) => {
        s.nodes.splice(0, 1);
        s.connections.length = 0;
      }),
    );
    expect(model.pendingEdits()[0]?.state).toBe("conflicted");
    expect(model.historyState()).toMatchObject({
      canUndo: false,
      undoReason: "Nothing to undo",
    });
  });

  it("a push is not an undo entry: undo reverts the user's last edit and the pushed change stays", async () => {
    const { model, host } = seededModel();
    const move = model.submit(moveOf(model, "A", { x: 5, y: 5 }), {
      label: "Move",
    });
    host.answer(move.operationId, { status: "accepted" });
    await flush();
    model.pushSnapshot(
      hostSnapshot((s) => {
        (s.nodes[0] as { position: unknown }).position = { x: 5, y: 5 };
        (s.nodes[1] as { title: string }).title = "Renamed elsewhere";
      }),
    );
    expect(model.historyState()).toMatchObject({
      canUndo: true,
      undoLabel: "Move",
    });
    model.undo();
    expect(positionOf(model, "A")).toEqual({ x: 0, y: 0 });
    expect(titleOf(model, "B")).toBe("Renamed elsewhere");
  });

  it("an undo the host rejects is rolled back and the entry can be undone again", async () => {
    const { model, host } = seededModel();
    const move = model.submit(moveOf(model, "A", { x: 5, y: 5 }), {
      label: "Move",
    });
    host.answer(move.operationId, { status: "accepted" });
    await flush();
    const undo = model.undo();
    host.answer(undo.operationId, {
      status: "rejected",
      rejection: { code: "conflict", message: "No", entities: [] },
    });
    await flush();
    expect(positionOf(model, "A")).toEqual({ x: 5, y: 5 });
    expect(model.historyState()).toMatchObject({
      canUndo: true,
      undoLabel: "Move",
      canRedo: false,
    });
  });

  it("replacing the document clears the local history", async () => {
    const { model, host } = seededModel();
    const move = model.submit(moveOf(model, "A", { x: 5, y: 5 }), {
      label: "Move",
    });
    host.answer(move.operationId, { status: "accepted" });
    await flush();
    expect(loadSnapshot(model, hostSnapshot()).ok).toBe(true);
    expect(model.historyState()).toMatchObject({
      canUndo: false,
      canRedo: false,
    });
  });
});
