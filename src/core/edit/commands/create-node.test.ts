import { describe, expect, it } from "vitest";
import { err, ok } from "../../base/result.js";
import { createNodeTypeRegistry } from "../../data/node-types/registry.js";
import { createGraphModel } from "../../graph-model.js";
import { fragmentOf } from "../../io/fragment/test-kit.js";
import { delegatingModel, makeModel } from "./test-kit.js";

describe("create node at a position", () => {
  it("creates the node at the world position with spec ports and front z", () => {
    const model = makeModel();
    expect(model.createNode("source", { x: 3, y: 4 }).status).toBe("accepted");
    expect(
      model.createNode("pipe", { x: 10, y: 20 }, { title: "P" }).status,
    ).toBe("accepted");
    const [first, second] = model.reader.nodes();
    expect(first?.position).toEqual({ x: 3, y: 4 });
    expect(first?.size).toEqual({ width: 40, height: 20 });
    expect(second?.title).toBe("P");
    expect(second?.z).toBe((first?.z ?? 0) + 1);
    const ports = model.reader.portsOf(second?.id ?? ("" as never));
    expect(ports.map((p) => [p.direction, p.typeKey, p.limit])).toEqual([
      ["undirected", "hydraulic", "unlimited"],
      ["undirected", "hydraulic", "unlimited"],
    ]);
    expect(model.reader.portsOf(first?.id ?? ("" as never))[0]?.limit).toBe(
      "unlimited",
    );
    expect(
      model.can({ kind: "createNode", type: "nope", position: { x: 0, y: 0 } })
        .available,
    ).toBe(false);
  });

  it("input ports default to a limit of 1; the payload factory receives the position", () => {
    const registry = createNodeTypeRegistry();
    registry.register({
      type: "t",
      label: "T",
      defaultSize: { width: 1, height: 1 },
      createPayload: ({ position }) => ok({ at: position.x }),
      ports: () => [{ direction: "input", typeKey: "k" }],
    });
    const model = createGraphModel({ registry });
    model.createNode("t", { x: 7, y: 0 });
    expect(model.reader.nodes()[0]?.payload).toEqual({ at: 7 });
    expect(model.reader.ports()[0]?.limit).toBe(1);
  });

  it("rejects unknown and non-creatable types", () => {
    const model = makeModel();
    model.registry.register({
      type: "legacy",
      label: "L",
      creatable: false,
      defaultSize: { width: 1, height: 1 },
    });
    const unknown = model.createNode("nope", { x: 0, y: 0 });
    const legacy = model.createNode("legacy", { x: 0, y: 0 });
    expect(unknown.status === "rejected" && unknown.rejection.code).toBe(
      "unknown-type",
    );
    expect(legacy.status === "rejected" && legacy.rejection.code).toBe(
      "not-creatable",
    );
  });
});

describe("factory failure", () => {
  function failing(factory: () => ReturnType<typeof ok>) {
    const registry = createNodeTypeRegistry();
    registry.register({
      type: "bad",
      label: "Bad",
      defaultSize: { width: 1, height: 1 },
      createPayload: factory as never,
    });
    return createGraphModel({ registry });
  }

  it("a throwing factory gives factory-failed and an unchanged model", () => {
    const model = failing(() => {
      throw new Error("boom");
    });
    const before = model.idCursor();
    const result = model.createNode("bad", { x: 0, y: 0 });
    expect(result.status === "rejected" && result.rejection.code).toBe(
      "factory-failed",
    );
    expect(model.reader.nodes()).toEqual([]);
    expect(model.idCursor()).toEqual(before);
    expect(model.historyState().canUndo).toBe(false);
  });

  it("a factory returning a failed Result gives factory-failed", () => {
    const registry = createNodeTypeRegistry();
    registry.register({
      type: "bad",
      label: "Bad",
      defaultSize: { width: 1, height: 1 },
      createPayload: () =>
        err({ code: "malformed-record", message: "no", entities: [] }),
    });
    const model = createGraphModel({ registry });
    const result = model.createNode("bad", { x: 0, y: 0 });
    expect(result.status === "rejected" && result.rejection.code).toBe(
      "factory-failed",
    );
    expect(model.reader.nodes()).toEqual([]);
  });
});

describe("node creation goes through the adapter: local creation is immediate", () => {
  it("a local creation reports the new node's ID, shows the node with its ports and adds one history entry", () => {
    const model = makeModel();
    const result = model.createNode("pipe", { x: 1, y: 2 });
    if (result.status !== "accepted") throw new Error("expected accepted");
    const node = model.reader.nodes()[0];
    expect(result.nodeId).toBe(node?.id);
    expect(model.reader.portsOf(result.nodeId ?? ("" as never))).toHaveLength(
      2,
    );
    expect(model.historyState()).toMatchObject({ canUndo: true });
    model.undo();
    expect(model.historyState().canUndo).toBe(false);
  });

  it("a creation queued from inside a handler reports the node's ID when it settles", async () => {
    const model = makeModel();
    let queued: ReturnType<typeof model.createNode> | undefined;
    model.on("change", () => {
      queued ??= model.createNode("sink", { x: 0, y: 0 });
    });
    model.createNode("source", { x: 0, y: 0 });
    if (queued?.status !== "queued") throw new Error("expected queued");
    const settled = await queued.settled;
    expect(settled.status === "accepted" && settled.nodeId).toBe(
      model.reader.nodes()[1]?.id,
    );
  });
});

describe("node creation goes through the adapter: delegated creation", () => {
  it("plans one create-node intent, mints no ID, changes nothing locally and hands it to the adapter", () => {
    const { model, intents, asked } = delegatingModel();
    const state = model.reader.state();
    const plan = model.plan({
      kind: "createNode",
      type: "pipe",
      position: { x: 5, y: 6 },
      title: "P",
    });
    expect(plan).toMatchObject({
      kind: "delegated",
      label: "Create Pipe",
      intent: {
        kind: "create-node",
        type: "pipe",
        position: { x: 5, y: 6 },
        title: "P",
      },
    });
    const result = model.createNode("pipe", { x: 5, y: 6 });
    expect(result.status).toBe("pending");
    expect(intents).toHaveLength(1);
    expect(intents[0]).toMatchObject({ kind: "create-node", type: "pipe" });
    expect(model.reader.state()).toBe(state);
    expect(asked).toEqual([]);
    expect(model.historyState().canUndo).toBe(false);
  });

  it("an unknown or non-creatable type is still refused before any delegation", () => {
    const { model, intents } = delegatingModel();
    const result = model.createNode("nope", { x: 0, y: 0 });
    expect(result.status === "rejected" && result.rejection.code).toBe(
      "unknown-type",
    );
    expect(intents).toEqual([]);
  });
});

describe("paste, duplicate and unavailable creation: paste fragments under a delegating adapter", () => {
  const offset = { kind: "offset", by: { x: 10, y: 0 } } as const;

  it("paste hands over one create-fragment intent with fragment-local keys and creates nothing", () => {
    const { model, intents, asked, pair, seed } = delegatingModel();
    const state = model.reader.state();
    const result = model.execute({
      kind: "paste",
      fragment: fragmentOf(seed, [pair.a.node, pair.b.node]),
      placement: offset,
    });
    expect(result.status).toBe("pending");
    expect(model.reader.state()).toBe(state);
    expect(asked).toEqual([]);
    const [intent] = intents;
    if (intent?.kind !== "create-fragment") throw new Error("no fragment");
    expect(intent.offset).toEqual({ x: 10, y: 0 });
    expect(intent.nodes.map((n) => [n.key, n.type, n.ports.length])).toEqual([
      ["node-1", "pipe", 2],
      ["node-2", "pipe", 2],
    ]);
    expect(intent.connections).toEqual([
      {
        key: "connection-1",
        from: { in: "fragment", node: "node-1", port: "port-2" },
        to: { in: "fragment", node: "node-2", port: "port-3" },
      },
    ]);
    const library = new Set<string>(model.reader.ports().map((p) => p.id));
    expect(
      intent.nodes.flatMap((n) => n.ports).some((p) => library.has(p.key)),
    ).toBe(false);
  });

  it("a preserved outside connection names the existing port; an excluded one is reported and left out", () => {
    const { model, intents, pair, seed } = delegatingModel();
    const command = {
      kind: "paste",
      fragment: fragmentOf(seed, [pair.b.node]),
      placement: offset,
    } as const;
    const excluded = model.plan(command);
    expect(excluded.kind === "delegated" && excluded.excluded).toHaveLength(2);
    model.execute({ ...command, external: "preserve" });
    const intent = intents[0];
    if (intent?.kind !== "create-fragment") throw new Error("no fragment");
    expect(intent.connections.map((c) => [c.from, c.to])).toEqual([
      [
        { in: "model", node: pair.a.node, port: pair.a.ports[1] },
        { in: "fragment", node: "node-1", port: "port-1" },
      ],
      [
        { in: "fragment", node: "node-1", port: "port-2" },
        { in: "model", node: pair.c.node, port: pair.c.ports[0] },
      ],
    ]);
  });

  it("an invalid or oversized fragment is rejected and the host is not called", () => {
    const { model, intents, seed, pair } = delegatingModel({ maxNodes: 1 });
    const broken = {
      kind: "paste",
      fragment: { format: "@paceholder/nodeeditor-js/fragment", version: 1 },
      placement: offset,
    } as const;
    expect(model.execute(broken).status).toBe("rejected");
    const big = model.execute({
      kind: "paste",
      fragment: fragmentOf(seed, [pair.a.node, pair.b.node]),
      placement: offset,
    });
    expect(big.status === "rejected" && big.rejection.code).toBe(
      "limit-exceeded",
    );
    expect(intents).toEqual([]);
  });

  it("a model whose capability policy forbids creation reports the reason before any delegation and mints no ID", () => {
    const { model, intents, asked, seed, pair } = delegatingModel({
      readOnly: true,
    });
    const paste = {
      kind: "paste",
      fragment: fragmentOf(seed, [pair.a.node]),
      placement: offset,
    } as const;
    const can = model.can(paste);
    expect(can.available === false && can.rejection.code).toBe(
      "capability-denied",
    );
    const result = model.execute(paste);
    expect(result.status === "rejected" && result.rejection.message).toBe(
      "The model is read-only",
    );
    expect(model.createNode("pipe", { x: 0, y: 0 }).status).toBe("rejected");
    expect(intents).toEqual([]);
    expect(asked).toEqual([]);
  });
});
