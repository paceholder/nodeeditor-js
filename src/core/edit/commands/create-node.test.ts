import { describe, expect, it } from "vitest";
import { err, ok } from "../../base/result.js";
import { createNodeTypeRegistry } from "../../data/node-types/registry.js";
import { createGraphModel } from "../../graph-model.js";
import { makeModel } from "./test-kit.js";

describe("NOD-09 create node at a position", () => {
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
    expect(unknown.status === "rejected" && unknown.error.code).toBe(
      "unknown-type",
    );
    expect(legacy.status === "rejected" && legacy.error.code).toBe(
      "not-creatable",
    );
  });
});

describe("NOD-09a factory failure", () => {
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
    expect(result.status === "rejected" && result.error.code).toBe(
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
    expect(result.status === "rejected" && result.error.code).toBe(
      "factory-failed",
    );
    expect(model.reader.nodes()).toEqual([]);
  });
});
