import { describe, expect, it } from "vitest";
import { nodeId } from "../../base/ids/ids.js";
import { rejectionOf } from "../../base/result.js";
import { extractFragment } from "../fragment/extract.js";
import { exportSnapshot } from "../snapshot/export.js";
import {
  boxRegistry,
  fakeCreator,
  flush,
  hostSnapshot,
  seededModel,
  watch,
} from "./test-kit.js";

/** Nodes A and B (joined by AB) of a document whose host names new nodes. */
function delegating() {
  const creator = fakeCreator();
  const { model } = seededModel({
    registry: boxRegistry(),
    nodeCreation: "delegated",
    onDelegate: creator.onDelegate,
  });
  return { model, creator, seen: watch(model) };
}

const refusal = rejectionOf(
  "unsupported-command",
  "This store cannot copy a group of parts",
);

describe("paste, duplicate and unavailable creation through the host: paste", () => {
  it("a create-fragment answered with unsupported-command settles rejected carrying the host's rejection unchanged", async () => {
    const { model, creator, seen } = delegating();
    const state = model.reader.state();
    const fragment = extractFragment(model.reader, {
      nodes: [nodeId("A"), nodeId("B")],
    });
    if (!fragment.ok) throw new Error("extract failed");
    const result = model.execute({
      kind: "paste",
      fragment: fragment.value.fragment,
      placement: { kind: "offset", by: { x: 0, y: 100 } },
    });
    if (result.status !== "pending") throw new Error("expected pending");
    expect(creator.intents.map((i) => i.kind)).toEqual(["create-fragment"]);
    expect(model.placeholders().map((p) => [p.key, p.position])).toEqual([
      ["node-1", { x: 0, y: 100 }],
      ["node-2", { x: 100, y: 100 }],
    ]);
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
});

describe("duplicate of a host-named document is one host operation", () => {
  it("accepted without a node ID settles accepted with no placeholder at any time; the copies arrive with a push", async () => {
    const { model, creator } = delegating();
    const result = model.execute({
      kind: "duplicate",
      nodes: [nodeId("B"), nodeId("A")],
      placement: { kind: "offset", by: { x: 0, y: 100 } },
    });
    if (result.status !== "pending") throw new Error("expected pending");
    expect(creator.intents).toEqual([
      {
        kind: "duplicate",
        operationId: result.operationId,
        nodes: ["A", "B"],
        connections: ["AB"],
        offset: { x: 0, y: 100 },
      },
    ]);
    expect(model.placeholders()).toEqual([]);
    creator.answer(result.operationId, { status: "accepted" });
    expect(await result.settled).toMatchObject({
      ok: true,
      status: "accepted",
    });
    expect(model.placeholders()).toEqual([]);
    expect(model.reader.nodes()).toHaveLength(2);
    model.pushSnapshot(
      hostSnapshot((s) => {
        s.nodes.push(
          { ...s.nodes[0], id: "A2", position: { x: 0, y: 100 }, ports: [] },
          { ...s.nodes[1], id: "B2", position: { x: 100, y: 100 }, ports: [] },
        );
      }),
    );
    await flush();
    expect(exportSnapshot(model).nodes.map((n) => n.id)).toEqual([
      "A",
      "B",
      "A2",
      "B2",
    ]);
  });

  it("the host refuses a duplicate: it settles rejected with the host's rejection unchanged and nothing is created", async () => {
    const { model, creator, seen } = delegating();
    const state = model.reader.state();
    const result = model.execute({
      kind: "duplicate",
      nodes: [nodeId("A")],
      placement: { kind: "offset", by: { x: 0, y: 100 } },
    });
    if (result.status !== "pending") throw new Error("expected pending");
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
    expect(model.reader.state()).toBe(state);
  });
});
