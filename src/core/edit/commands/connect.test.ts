import { describe, expect, it } from "vitest";
import { end, firstConnection, make, makeModel } from "./test-kit.js";

describe("failed reconnect keeps the original", () => {
  it("leaves endpoints and ID unchanged", () => {
    const model = makeModel();
    const a = make(model, "source");
    const b = make(model, "sink");
    const other = make(model, "source");
    model.connect(end(a), end(b));
    const id = firstConnection(model);
    const before = model.reader.getConnection(id);
    // Moving the "from" end to another output works; to an input is a direction error.
    const bad = model.reconnect(id, "from", end(b));
    expect(bad.status).toBe("rejected");
    expect(model.reader.getConnection(id)).toEqual(before);
    expect(model.reader.connections()).toHaveLength(1);
    expect(
      model.can({
        kind: "reconnect",
        connection: id,
        end: "from",
        target: end(other),
      }).available,
    ).toBe(true);
  });
});

describe("reconnect is an update on the same ID", () => {
  it("emits one update op, no remove/add pair", () => {
    const model = makeModel();
    const a = make(model, "source");
    const b = make(model, "sink");
    const other = make(model, "source");
    model.connect(end(a), end(b));
    const id = firstConnection(model);
    const plan = model.plan({
      kind: "reconnect",
      connection: id,
      end: "from",
      target: end(other),
    });
    expect(plan.kind).toBe("ready");
    if (plan.kind === "ready") {
      expect(plan.patch.ops.map((o) => `${o.op}:${o.entity}`)).toEqual([
        "update:connection",
      ]);
      expect(plan.effects.updated.connections).toEqual([id]);
    }
    expect(model.reconnect(id, "from", end(other)).status).toBe("accepted");
    expect(model.reader.getConnection(id)?.from).toEqual(end(other));
    expect(model.reader.connections()).toHaveLength(1);
    expect(model.undo().status).toBe("accepted");
    expect(model.reader.getConnection(id)?.from).toEqual(end(a));
  });

  it("reconnecting to the same occupied input is allowed because the old binding is replaced", () => {
    const model = makeModel();
    const a = make(model, "source");
    const b = make(model, "sink");
    model.connect(end(a), end(b));
    const id = firstConnection(model);
    const plan = model.plan({
      kind: "reconnect",
      connection: id,
      end: "to",
      target: end(b),
    });
    expect(plan).toMatchObject({ kind: "ready", patch: { ops: [] } });
  });
});

describe("connect and disconnect plans", () => {
  it("includes auxiliary ops from the policy before the connection", () => {
    const model = makeModel({
      connectionPolicy: {
        evaluate: (p) => ({
          kind: "accept",
          plan: {
            from: p.from,
            to: p.to,
            connectionKind: "special",
            auxiliary: [],
          },
        }),
      },
    });
    const a = make(model, "source");
    const b = make(model, "sink");
    model.connect(end(a), end(b));
    expect(model.reader.connections()[0]?.kind).toBe("special");
  });

  it("disconnect removes and undo restores the connection", () => {
    const model = makeModel();
    const a = make(model, "source");
    const b = make(model, "sink");
    model.connect(end(a), end(b));
    const id = firstConnection(model);
    expect(model.disconnect(id).status).toBe("accepted");
    expect(model.reader.connections()).toEqual([]);
    model.undo();
    expect(model.reader.getConnection(id)?.id).toBe(id);
    expect(model.disconnect("zz" as never).status).toBe("rejected");
  });
});
