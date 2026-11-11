import { describe, expect, it } from "vitest";
import { nodeId } from "../../base/ids/ids.js";
import { rejectionOf } from "../../base/result.js";
import type { Deferred } from "../../edit/adapter/types.js";
import type { SnapshotModel } from "../../snapshot-model.js";
import {
  boxRegistry,
  fakeCreator,
  flush,
  hostSnapshot,
  manualTimers,
  seededModel,
  watch,
} from "./test-kit.js";

const created = (id: string) => ({
  id,
  type: "box",
  position: { x: 300, y: 50 },
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

function create(model: SnapshotModel): Deferred {
  const result = model.createNode("box", { x: 300, y: 50 });
  if (result.status !== "pending") throw new Error(`got ${result.status}`);
  return result;
}

/** A creation the host accepted as N1, whose node did not arrive before the timeout. */
async function unknownAfterAnswer() {
  const s = delegating(5000);
  const result = create(s.model);
  s.creator.answer(result.operationId, {
    status: "accepted",
    nodeId: nodeId("N1"),
  });
  await flush();
  s.timers.fire();
  expect(await result.settled).toMatchObject({ status: "unknown" });
  expect(s.model.placeholders()).toMatchObject([{ state: "unknown" }]);
  return { ...s, result };
}

describe("node creation through the host: an unknown outcome settles after resynchronization", () => {
  it("a creation whose node did not arrive in time and that the host then rejects drops the placeholder with a failure event", async () => {
    const { model, result, seen } = await unknownAfterAnswer();
    const refusal = rejectionOf("conflict", "The store never created it");
    expect(
      model.settle(result.operationId, {
        status: "rejected",
        rejection: refusal,
      }),
    ).toBe(true);
    expect(model.placeholders()).toEqual([]);
    expect(seen.failures).toMatchObject([
      { operationId: result.operationId, rejection: refusal },
    ]);
  });

  it("a creation whose node did not arrive in time and that the host then accepts under another ID settles when that node arrives", async () => {
    const { model, result } = await unknownAfterAnswer();
    expect(
      model.settle(result.operationId, {
        status: "accepted",
        nodeId: nodeId("N2"),
      }),
    ).toBe(true);
    expect(model.placeholders()).toMatchObject([{ nodeId: "N2" }]);
    model.pushSnapshot(hostSnapshot((s) => s.nodes.push(created("N2"))));
    expect(model.placeholders()).toEqual([]);
  });

  it("a second unknown answer for an unknown creation is a logged no-op", async () => {
    const { model, result, seen } = await unknownAfterAnswer();
    const resyncs = seen.resyncs.length;
    expect(
      model.settle(result.operationId, { status: "unknown", reason: "?" }),
    ).toBe(false);
    expect(seen.resyncs).toHaveLength(resyncs);
    expect(model.placeholders()).toMatchObject([{ state: "unknown" }]);
  });
});

describe("node creation through the host: an ID already claimed is refused", () => {
  it("an ID a pending local edit adds is refused with node-id-claimed", async () => {
    const { model, creator, host } = delegating();
    const b = model.reader.getNode(nodeId("B"));
    if (!b) throw new Error("no B");
    model.submit({
      ops: [
        {
          op: "add",
          entity: "node",
          record: { ...b, id: nodeId("X"), ports: [] },
        },
      ],
    });
    expect(host.calls).toHaveLength(1);
    const result = create(model);
    creator.answer(result.operationId, {
      status: "accepted",
      nodeId: nodeId("X"),
    });
    expect(await result.settled).toMatchObject({
      status: "rejected",
      rejection: { code: "node-id-claimed" },
    });
    expect(model.placeholders()).toEqual([]);
  });
});

describe("placeholder for a pending creation: none pending", () => {
  it("without a pending creation every read returns the same empty list", () => {
    const { model } = delegating();
    expect(model.placeholders()).toEqual([]);
    expect(model.placeholders()).toBe(model.placeholders());
  });
});
