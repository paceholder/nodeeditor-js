import { describe, expect, it } from "vitest";
import type { GraphModel } from "../../graph-model.js";
import { end, make, makeModel } from "./test-kit.js";

function strip(model: GraphModel): string {
  return JSON.stringify({
    state: model.reader.state(),
    cursor: model.idCursor(),
  });
}

describe("convenience methods equal commands", () => {
  it("gives equal results and identical GraphState JSON", () => {
    const viaMethods = makeModel();
    const viaCommands = makeModel();

    const m1 = viaMethods.createNode("source", { x: 1, y: 2 });
    const c1 = viaCommands.execute({
      kind: "createNode",
      type: "source",
      position: { x: 1, y: 2 },
    });
    expect(m1.status).toBe(c1.status);
    const m2 = viaMethods.createNode("sink", { x: 5, y: 2 }, { title: "T" });
    const c2 = viaCommands.execute({
      kind: "createNode",
      type: "sink",
      position: { x: 5, y: 2 },
      title: "T",
    });
    expect(m2.status).toBe(c2.status);

    const [a, b] = viaMethods.reader.nodes();
    if (!a || !b) throw new Error("setup");
    const from = { node: a.id, port: a.ports[0] ?? ("" as never) };
    const to = { node: b.id, port: b.ports[0] ?? ("" as never) };
    viaMethods.connect(from, to);
    viaCommands.execute({ kind: "connect", from, to });
    viaMethods.moveNodes([{ node: a.id, position: { x: 9, y: 9 } }]);
    viaCommands.execute({
      kind: "moveNodes",
      moves: [{ node: a.id, position: { x: 9, y: 9 } }],
    });
    viaMethods.rotateNodes([a.id], 1);
    viaCommands.execute({ kind: "rotateNodes", nodes: [a.id], turns: 1 });
    viaMethods.updateNode(b.id, { status: "ok" });
    viaCommands.execute({ kind: "updateNode", node: b.id, status: "ok" });
    const conn = viaMethods.reader.connections()[0];
    if (!conn) throw new Error("setup");
    viaMethods.disconnect(conn.id);
    viaCommands.execute({ kind: "disconnect", connection: conn.id });
    viaMethods.deleteEntities({ nodes: [b.id] });
    viaCommands.execute({ kind: "deleteEntities", nodes: [b.id] });

    expect(strip(viaMethods)).toBe(strip(viaCommands));
    expect(viaMethods.historyState()).toEqual(viaCommands.historyState());
  });

  it("a rejected method and its command reject with the same reason", () => {
    const m = makeModel();
    const c = makeModel();
    const a = make(m, "source");
    const b = make(m, "source");
    make(c, "source");
    make(c, "source");
    const viaMethod = m.connect(end(a), end(b));
    const viaCommand = c.execute({ kind: "connect", from: end(a), to: end(b) });
    expect(viaMethod.status).toBe("rejected");
    expect(viaCommand.status).toBe("rejected");
    if (viaMethod.status === "rejected" && viaCommand.status === "rejected") {
      expect(viaMethod.error).toEqual(viaCommand.error);
    }
  });
});
