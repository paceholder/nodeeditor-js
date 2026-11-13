import { describe, expect, it } from "vitest";
import type { GroupId, NodeId } from "../../base/ids/ids.js";
import { delegatingModel } from "./test-kit.js";

const offset = { kind: "offset", by: { x: 10, y: 0 } } as const;

/** The connection IDs of the delegating model: a–b first, then b–c. */
function connections(model: ReturnType<typeof delegatingModel>["model"]) {
  const [ab, bc] = model.reader.connections().map((c) => c.id);
  if (!ab || !bc) throw new Error("fixture has two connections");
  return { ab, bc };
}

describe("duplicate of a host-named document is one host operation", () => {
  it("hands the host the node IDs in paint order, the connection between them and the offset", () => {
    const { model, intents, asked, pair } = delegatingModel();
    const { ab } = connections(model);
    const state = model.reader.state();
    const result = model.execute({
      kind: "duplicate",
      nodes: [pair.b.node, pair.a.node, pair.b.node],
      placement: offset,
    });
    expect(result.status).toBe("pending");
    expect(intents).toEqual([
      {
        kind: "duplicate",
        operationId: result.status === "pending" ? result.operationId : "",
        nodes: [pair.a.node, pair.b.node],
        connections: [ab],
        offset: { x: 10, y: 0 },
      },
    ]);
    expect(model.reader.state()).toBe(state);
    expect(asked).toEqual([]);
    expect(model.historyState().canUndo).toBe(false);
  });

  it("leaves outside connections out by default and reports them as excluded", () => {
    const { model, intents, pair } = delegatingModel();
    const { ab, bc } = connections(model);
    const command = {
      kind: "duplicate",
      nodes: [pair.b.node],
      placement: offset,
    } as const;
    const plan = model.plan(command);
    expect(plan.kind === "delegated" && plan.excluded).toEqual([
      { connection: ab, reason: "external" },
      { connection: bc, reason: "external" },
    ]);
    model.execute(command);
    expect(intents[0]?.kind === "duplicate" && intents[0].connections).toEqual(
      [],
    );
  });

  it("lists preserved outside connections and excludes none", () => {
    const { model, intents, pair } = delegatingModel();
    const { ab, bc } = connections(model);
    const command = {
      kind: "duplicate",
      nodes: [pair.b.node],
      placement: offset,
      external: "preserve",
    } as const;
    const plan = model.plan(command);
    expect(plan.kind === "delegated" && plan.excluded).toEqual([]);
    model.execute(command);
    expect(intents[0]?.kind === "duplicate" && intents[0].connections).toEqual([
      ab,
      bc,
    ]);
  });

  it("a centred duplicate carries the offset a local duplicate adds", () => {
    const { model, intents, seed, pair } = delegatingModel();
    const placement = { kind: "center", at: { x: 500, y: 500 } } as const;
    const nodes = [pair.a.node, pair.b.node];
    model.execute({ kind: "duplicate", nodes, placement });
    const intent = intents[0];
    if (intent?.kind !== "duplicate") throw new Error("no duplicate intent");
    // a at (0, 0) and b at (100, 40), 40 by 20: the box centre is (50, 20).
    expect(intent.offset).toEqual({ x: 450, y: 480 });
    const before = seed.reader.nodes().length;
    expect(seed.execute({ kind: "duplicate", nodes, placement }).status).toBe(
      "accepted",
    );
    const copy = seed.reader.nodes()[before];
    const original = seed.reader.getNode(pair.a.node);
    expect(copy && original && copy.position.x - original.position.x).toBe(450);
    expect(copy && original && copy.position.y - original.position.y).toBe(480);
  });
});

describe("groups in a duplicate intent are the ones a local duplicate would copy", () => {
  it("a selected group is listed with all its members, and its member's connection is copied", () => {
    const { model, intents, pair } = delegatingModel({ grouped: true });
    const { ab } = connections(model);
    const [group] = model.reader.groups();
    if (!group) throw new Error("fixture has a group");
    model.execute({
      kind: "duplicate",
      nodes: [],
      groups: [group.id, group.id],
      placement: offset,
    });
    expect(intents).toEqual([
      expect.objectContaining({
        kind: "duplicate",
        nodes: [pair.a.node, pair.b.node],
        groups: [group.id],
        connections: [ab],
      }),
    ]);
  });

  it("a member selected without its group is duplicated as a free node: no group is listed", () => {
    const { model, intents, pair } = delegatingModel({ grouped: true });
    model.execute({
      kind: "duplicate",
      nodes: [pair.a.node],
      placement: offset,
    });
    const intent = intents[0];
    if (intent?.kind !== "duplicate") throw new Error("no duplicate intent");
    expect(intent.nodes).toEqual([pair.a.node]);
    expect("groups" in intent).toBe(false);
  });

  it("a missing group is refused and the host is not called", () => {
    const { model, intents } = delegatingModel();
    const result = model.execute({
      kind: "duplicate",
      nodes: [],
      groups: ["gone" as GroupId],
      placement: offset,
    });
    expect(result.status === "rejected" && result.rejection.code).toBe(
      "unknown-entity",
    );
    expect(intents).toEqual([]);
  });
});

describe("a duplicate is checked before it is handed over", () => {
  it("a missing node, an empty list and a non-creatable type are refused and the host is not called", () => {
    const { model, intents } = delegatingModel();
    const missing = model.execute({
      kind: "duplicate",
      nodes: ["gone" as NodeId],
      placement: offset,
    });
    expect(missing.status === "rejected" && missing.rejection.code).toBe(
      "unknown-entity",
    );
    const empty = model.execute({
      kind: "duplicate",
      nodes: [],
      placement: offset,
    });
    expect(empty.status === "rejected" && empty.rejection.code).toBe(
      "empty-fragment",
    );
    expect(intents).toEqual([]);

    const fixed = delegatingModel({ fixedPipes: true });
    const refused = fixed.model.execute({
      kind: "duplicate",
      nodes: [fixed.pair.a.node],
      placement: offset,
    });
    expect(refused.status === "rejected" && refused.rejection.code).toBe(
      "not-creatable",
    );
    expect(fixed.intents).toEqual([]);
  });

  it("creation forbidden: a read-only model refuses a duplicate before delegation and mints no ID", () => {
    const { model, intents, asked, pair } = delegatingModel({ readOnly: true });
    const result = model.execute({
      kind: "duplicate",
      nodes: [pair.a.node],
      placement: offset,
    });
    expect(result.status === "rejected" && result.rejection.code).toBe(
      "capability-denied",
    );
    expect(intents).toEqual([]);
    expect(asked).toEqual([]);
  });
});
