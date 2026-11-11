import { describe, expect, it } from "vitest";
import { nodeId } from "../../base/ids/ids.js";
import {
  flush,
  moveOf,
  positionOf,
  retitle,
  seededModel,
  titleOf,
  watch,
} from "./test-kit.js";

const A = nodeId("A");
const locked = {
  status: "rejected" as const,
  rejection: { code: "conflict" as const, message: "Locked", entities: [] },
};

describe("overlapping edits under the optimistic in-order policy (responsiveness during slow host work, pending layer and edit states, snapshot adapter edit flow)", () => {
  it("two edits of one node show at once and reach the host in commit order with their base revisions, without waiting for the first answer", () => {
    const { model, host } = seededModel();
    const start = model.revision();
    const move = model.execute({
      kind: "moveNodes",
      moves: [{ node: A, position: { x: 40, y: 40 } }],
    });
    const rotate = model.execute({ kind: "rotateNodes", nodes: [A], turns: 1 });
    expect(move.status).toBe("pending");
    expect(rotate.status).toBe("pending");
    // Reads are synchronous and show both edits while the host is silent.
    expect(model.reader.getNode(A)?.rotation).toBe(1);
    expect(host.calls.map((c) => c.baseRevision)).toEqual([start, start + 1]);
    expect(host.calls.map((c) => c.operationId)).toEqual([
      "operationId" in move ? move.operationId : undefined,
      "operationId" in rotate ? rotate.operationId : undefined,
    ]);
    expect(model.pendingEdits().map((e) => e.state)).toEqual([
      "pending",
      "pending",
    ]);
  });

  it("when the host rejects the first edit, a later edit that still applies is rebased onto the confirmed state and stays displayed", async () => {
    const { model, host } = seededModel();
    const seen = watch(model);
    const move = model.submit(moveOf(model, "A", { x: 40, y: 40 }));
    model.submit(retitle(model, "A", "Valve"));
    host.answer(move.operationId, locked);
    await flush();
    expect(positionOf(model, "A")).toEqual({ x: 0, y: 0 });
    expect(titleOf(model, "A")).toBe("Valve");
    expect(model.pendingEdits().map((e) => e.state)).toEqual(["pending"]);
    // Two optimistic edits, then the rollback as one external change.
    expect(seen.changes.map((c) => c.origin)).toEqual([
      "local",
      "local",
      "external",
    ]);
    expect(seen.failures).toHaveLength(1);
  });

  it("when the host rejects the first edit, a later edit that depended on it is marked conflicted and leaves the display", async () => {
    const { model, host } = seededModel();
    const seen = watch(model);
    const first = model.submit(moveOf(model, "A", { x: 40, y: 40 }));
    const second = model.submit(moveOf(model, "A", { x: 80, y: 80 }));
    expect(positionOf(model, "A")).toEqual({ x: 80, y: 80 });
    host.answer(first.operationId, locked);
    await flush();
    expect(positionOf(model, "A")).toEqual({ x: 0, y: 0 });
    expect(model.pendingEdits()).toMatchObject([
      { operationId: second.operationId, state: "conflicted" },
    ]);
    expect(seen.changes.filter((c) => c.origin === "external")).toHaveLength(1);
    // The conflicted edit was handed over once and the host still settles it.
    expect(host.calls).toHaveLength(2);
    host.answer(second.operationId, { status: "accepted" });
    await flush();
    expect(model.pendingEdits()).toEqual([]);
    expect(positionOf(model, "A")).toEqual({ x: 0, y: 0 });
  });

  it("a move is pending, the user rotates the node, and the host rejects the move: the rotate is rebased on the confirmed position and stays displayed", async () => {
    const { model, host } = seededModel();
    const move = model.execute({
      kind: "moveNodes",
      moves: [{ node: A, position: { x: 40, y: 40 } }],
    });
    const rotate = model.execute({ kind: "rotateNodes", nodes: [A], turns: 1 });
    if (move.status !== "pending" || rotate.status !== "pending")
      throw new Error("expected pending");
    host.answer(move.operationId, locked);
    await flush();
    expect(model.reader.getNode(A)).toMatchObject({
      position: { x: 0, y: 0 },
      rotation: 1,
    });
    expect(model.pendingEdits()).toMatchObject([
      { operationId: rotate.operationId, state: "pending" },
    ]);
    host.answer(rotate.operationId, { status: "accepted" });
    expect(await rotate.settled).toMatchObject({ status: "accepted" });
  });
});
