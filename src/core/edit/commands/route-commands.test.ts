import { describe, expect, it } from "vitest";
import type { ConnectionId } from "../../base/ids/ids.js";
import type { RouteConstraint } from "../../data/model/records.js";
import type { GraphModel } from "../../graph-model.js";
import { end, make, makeModel } from "./test-kit.js";

const vert = (at: number): RouteConstraint => ({
  kind: "segment",
  orientation: "vertical",
  at,
});
const horiz = (at: number): RouteConstraint => ({
  kind: "segment",
  orientation: "horizontal",
  at,
});

function twoConnections(): { model: GraphModel; ids: ConnectionId[] } {
  const model = makeModel();
  const a = make(model, "pipe", 0, 0);
  const b = make(model, "pipe", 100, 0);
  const c = make(model, "pipe", 200, 0);
  model.connect(end(a, 1), end(b, 0));
  model.connect(end(b, 1), end(c, 0));
  return { model, ids: model.reader.connections().map((x) => x.id) };
}

describe("setRoute", () => {
  it("plans one patch with one connection update of route only", () => {
    const { model, ids } = twoConnections();
    const [id] = ids;
    if (!id) throw new Error("setup");
    const plan = model.plan({
      kind: "setRoute",
      connection: id,
      route: [vert(40)],
    });
    expect(plan.kind).toBe("ready");
    if (plan.kind !== "ready") return;
    expect(plan.patch.ops).toEqual([
      {
        op: "update",
        entity: "connection",
        id,
        fields: { route: { new: [vert(40)] } },
      },
    ]);
    expect(plan.label).toBe("Edit route");
  });

  it("applies as one history entry and undo restores the previous constraints", () => {
    const { model, ids } = twoConnections();
    const [id] = ids;
    if (!id) throw new Error("setup");
    const execute = (route: RouteConstraint[]) =>
      model.execute({ kind: "setRoute", connection: id, route });
    expect(execute([vert(40)]).status).toBe("accepted");
    expect(execute([vert(40), horiz(5)]).status).toBe("accepted");
    expect(model.reader.getConnection(id)?.route).toEqual([vert(40), horiz(5)]);
    model.undo();
    expect(model.reader.getConnection(id)?.route).toEqual([vert(40)]);
    model.undo();
    expect(model.reader.getConnection(id)?.route).toBeUndefined();
    model.redo();
    expect(model.reader.getConnection(id)?.route).toEqual([vert(40)]);
  });

  it("stores an empty list as absent and rejects malformed input", () => {
    const { model, ids } = twoConnections();
    const [id] = ids;
    if (!id) throw new Error("setup");
    model.execute({ kind: "setRoute", connection: id, route: [vert(1)] });
    model.execute({ kind: "setRoute", connection: id, route: [] });
    expect(model.reader.getConnection(id)).not.toHaveProperty("route");
    const bad = model.execute({
      kind: "setRoute",
      connection: id,
      route: [vert(Number.NaN)],
    });
    expect(bad.status).toBe("rejected");
    expect(
      model.execute({
        kind: "setRoute",
        connection: "c99" as never,
        route: [],
      }).status,
    ).toBe("rejected");
  });
});

describe("resetRoutes", () => {
  it("clears two connections in one patch", () => {
    const { model, ids } = twoConnections();
    for (const id of ids) {
      model.execute({ kind: "setRoute", connection: id, route: [vert(3)] });
    }
    const patches: number[] = [];
    model.on("change", (e) => patches.push(e.patch.ops.length));
    expect(
      model.execute({ kind: "resetRoutes", connections: ids }).status,
    ).toBe("accepted");
    expect(patches).toEqual([2]);
    for (const id of ids) {
      expect(model.reader.getConnection(id)).not.toHaveProperty("route");
    }
    model.undo();
    for (const id of ids) {
      expect(model.reader.getConnection(id)?.route).toEqual([vert(3)]);
    }
  });

  it("only touches connections that have constraints and is rejected when none do", () => {
    const { model, ids } = twoConnections();
    const [first, second] = ids;
    if (!first || !second) throw new Error("setup");
    const none = model.execute({ kind: "resetRoutes", connections: ids });
    expect(none.status).toBe("rejected");
    model.execute({ kind: "setRoute", connection: first, route: [horiz(9)] });
    const plan = model.plan({ kind: "resetRoutes", connections: ids });
    expect(plan.kind === "ready" && plan.patch.ops.length).toBe(1);
  });
});
