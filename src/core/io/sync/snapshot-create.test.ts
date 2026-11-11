import { describe, expect, it } from "vitest";
import { nodeId } from "../../base/ids/ids.js";
import { rejectionOf } from "../../base/result.js";
import type { Deferred } from "../../edit/adapter/types.js";
import type { SnapshotModel } from "../../snapshot-model.js";
import { exportSnapshot } from "../snapshot/export.js";
import {
  boxRegistry,
  fakeCreator,
  flush,
  hostSnapshot,
  manualTimers,
  seededModel,
  watch,
} from "./test-kit.js";

/** A node the host created, as its next snapshot lists it. */
const created = (id: string, x = 300) => ({
  id,
  type: "box",
  position: { x, y: 50 },
  size: { width: 40, height: 20 },
  ports: [{ id: `${id}.p`, direction: "undirected", typeKey: "k" }],
  payload: null,
});

function delegating(timeoutMs?: number) {
  const creator = fakeCreator();
  const timers = manualTimers();
  const { model, host } = seededModel({
    registry: boxRegistry(),
    nodeCreation: "delegated",
    onDelegate: creator.onDelegate,
    timers,
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  });
  return { model, host, creator, timers, seen: watch(model) };
}

/** A creation through the command, which a delegating adapter leaves pending. */
function create(model: SnapshotModel): Deferred {
  const result = model.createNode("box", { x: 300, y: 50 });
  if (result.status !== "pending") throw new Error(`got ${result.status}`);
  return result;
}

const settledOf = (result: Deferred) => result.settled;

describe("node creation goes through the adapter: delegated to the host", () => {
  it("the host gets one create-node intent, the read model is unchanged and the result is pending", () => {
    const { model, creator, host, seen } = delegating();
    const state = model.reader.state();
    const result = create(model);
    expect(result.status).toBe("pending");
    expect(creator.intents).toEqual([
      {
        kind: "create-node",
        operationId: result.operationId,
        type: "box",
        position: { x: 300, y: 50 },
      },
    ]);
    expect(host.calls).toEqual([]);
    expect(model.reader.state()).toBe(state);
    expect(seen.changes).toEqual([]);
  });

  it("the node arriving in a push settles the result with the ID the host named, as an external change without a history entry", async () => {
    const { model, creator, seen } = delegating();
    const result = create(model);
    creator.answer(result.operationId, {
      status: "accepted",
      nodeId: nodeId("N1"),
    });
    await flush();
    expect(model.placeholders()[0]?.nodeId).toBe("N1");
    model.pushSnapshot(hostSnapshot((s) => s.nodes.push(created("N1"))));
    expect(seen.events).toEqual(["change:external"]);
    expect(await settledOf(result)).toMatchObject({
      status: "accepted",
      nodeId: "N1",
      changed: { nodes: ["N1"], ports: ["N1.p"] },
    });
    expect(model.placeholders()).toEqual([]);
    expect(model.historyState().canUndo).toBe(false);
  });

  it("an answer naming a node a push already brought settles at once", async () => {
    const { model, creator } = delegating();
    const result = create(model);
    model.pushSnapshot(hostSnapshot((s) => s.nodes.push(created("N1"))));
    expect(model.placeholders()).toHaveLength(1);
    creator.answer(result.operationId, {
      status: "accepted",
      nodeId: nodeId("N1"),
    });
    expect(await settledOf(result)).toMatchObject({ nodeId: "N1" });
    expect(model.placeholders()).toEqual([]);
  });

  it("two creations settle with their own IDs when the snapshot lists the nodes in the other order", async () => {
    const { model, creator } = delegating();
    const one = create(model);
    const two = create(model);
    creator.answer(one.operationId, {
      status: "accepted",
      nodeId: nodeId("X"),
    });
    creator.answer(two.operationId, {
      status: "accepted",
      nodeId: nodeId("Y"),
    });
    await flush();
    model.pushSnapshot(
      hostSnapshot((s) => s.nodes.push(created("Y"), created("X"))),
    );
    expect(await settledOf(one)).toMatchObject({ nodeId: "X" });
    expect(await settledOf(two)).toMatchObject({ nodeId: "Y" });
  });

  it("a node that never appears makes the outcome unknown at the timeout, keeps the placeholder marked and requests a resync", async () => {
    const { model, creator, timers, seen } = delegating(5000);
    const result = create(model);
    creator.answer(result.operationId, {
      status: "accepted",
      nodeId: nodeId("N1"),
    });
    await flush();
    timers.fire();
    expect(await settledOf(result)).toMatchObject({ status: "unknown" });
    expect(model.placeholders()).toMatchObject([
      { state: "unknown", nodeId: "N1" },
    ]);
    expect(seen.resyncs.map((e) => e.operationId)).toEqual([
      result.operationId,
    ]);
    model.pushSnapshot(hostSnapshot((s) => s.nodes.push(created("N1"))));
    expect(model.placeholders()).toEqual([]);
  });

  it("an answer naming a wrapper ID that no snapshot holds never settles from the pushed node and becomes unknown after the timeout", async () => {
    const { model, creator, timers } = delegating(5000);
    const result = create(model);
    creator.answer(result.operationId, {
      status: "accepted",
      nodeId: nodeId("operation-77"),
    });
    await flush();
    model.pushSnapshot(hostSnapshot((s) => s.nodes.push(created("N1"))));
    expect(model.placeholders()).toHaveLength(1);
    timers.fire();
    expect(await settledOf(result)).toMatchObject({ status: "unknown" });
  });

  it("an ID another creation claimed, or that a node had before, is refused with node-id-claimed and drops the placeholder", async () => {
    const { model, creator, seen } = delegating();
    const one = create(model);
    const two = create(model);
    const three = create(model);
    creator.answer(one.operationId, {
      status: "accepted",
      nodeId: nodeId("X"),
    });
    creator.answer(two.operationId, {
      status: "accepted",
      nodeId: nodeId("X"),
    });
    creator.answer(three.operationId, {
      status: "accepted",
      nodeId: nodeId("A"),
    });
    for (const result of [two, three])
      expect(await settledOf(result)).toMatchObject({
        status: "rejected",
        rejection: { code: "node-id-claimed" },
      });
    expect(model.placeholders().map((p) => p.operationId)).toEqual([
      one.operationId,
    ]);
    expect(seen.failures).toHaveLength(2);
  });

  it("a refusal settles rejected with the host's rejection, drops the placeholder and changes nothing", async () => {
    const { model, creator, seen } = delegating();
    const state = model.reader.state();
    const result = create(model);
    const refusal = rejectionOf("conflict", "The store is full");
    creator.answer(result.operationId, {
      status: "rejected",
      rejection: refusal,
    });
    expect(await settledOf(result)).toMatchObject({ rejection: refusal });
    expect(seen.failures[0]).toMatchObject({ rejection: refusal });
    expect(model.placeholders()).toEqual([]);
    expect(model.reader.state()).toBe(state);
  });

  it("an unknown answer keeps the placeholder, marked unknown, and a later answer still settles it", async () => {
    const { model, creator } = delegating();
    const result = create(model);
    creator.answer(result.operationId, { status: "unknown", reason: "lost" });
    expect(await settledOf(result)).toMatchObject({ status: "unknown" });
    expect(model.placeholders()).toMatchObject([{ state: "unknown" }]);
    expect(
      model.settle(result.operationId, {
        status: "accepted",
        nodeId: nodeId("N1"),
      }),
    ).toBe(true);
    model.pushSnapshot(hostSnapshot((s) => s.nodes.push(created("N1"))));
    expect(model.placeholders()).toEqual([]);
  });

  it("an accepted node creation must name the node: through settle it is misuse", () => {
    const { model } = delegating();
    const result = create(model);
    expect(() =>
      model.settle(result.operationId, { status: "accepted" }),
    ).toThrow(/name the node/);
  });
});

describe("placeholder for a pending creation", () => {
  it("is listed at the requested position and is absent from the read model and an exported snapshot", () => {
    const { model } = delegating();
    const result = create(model);
    expect(model.placeholders()).toEqual([
      {
        operationId: result.operationId,
        type: "box",
        position: { x: 300, y: 50 },
        state: "pending",
      },
    ]);
    expect(model.reader.nodes()).toHaveLength(2);
    expect(exportSnapshot(model).nodes.map((n) => n.id)).toEqual(["A", "B"]);
  });
});

describe("paste, duplicate and unavailable creation through the host", () => {
  it("a create-fragment answered with unsupported-command settles rejected carrying the host's rejection unchanged", async () => {
    const { model, creator, seen } = delegating();
    const state = model.reader.state();
    const result = model.execute({
      kind: "duplicate",
      nodes: [nodeId("A"), nodeId("B")],
      placement: { kind: "offset", by: { x: 0, y: 100 } },
    });
    if (result.status !== "pending") throw new Error("expected pending");
    expect(model.placeholders().map((p) => [p.key, p.position])).toEqual([
      ["node-1", { x: 0, y: 100 }],
      ["node-2", { x: 100, y: 100 }],
    ]);
    const refusal = rejectionOf(
      "unsupported-command",
      "This store cannot copy a group of parts",
    );
    creator.answer(result.operationId, {
      status: "rejected",
      rejection: refusal,
    });
    expect(await result.settled).toEqual({
      ok: false,
      status: "rejected",
      operationId: result.operationId,
      rejection: refusal,
    });
    expect(seen.failures[0]).toMatchObject({ rejection: refusal });
    expect(model.placeholders()).toEqual([]);
    expect(model.reader.state()).toBe(state);
  });

  it("an accepted fragment settles from the answer and its placeholders leave", async () => {
    const { model, creator } = delegating();
    const result = model.execute({
      kind: "duplicate",
      nodes: [nodeId("A")],
      placement: { kind: "offset", by: { x: 0, y: 100 } },
    });
    if (result.status !== "pending") throw new Error("expected pending");
    creator.answer(result.operationId, { status: "accepted" });
    expect(await result.settled).toMatchObject({ status: "accepted" });
    expect(model.placeholders()).toEqual([]);
  });
});
