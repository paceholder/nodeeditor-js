import { describe, expect, it } from "vitest";
import { end, firstConnection, make, makeModel } from "./test-kit.js";

describe("EDT-02 delete with incident connections", () => {
  it("removes node, ports and incident connections in one patch; one undo restores all", () => {
    const model = makeModel();
    const a = make(model, "source");
    const b = make(model, "sink");
    const c = make(model, "source");
    model.connect(end(a), end(b));
    const before = JSON.stringify(model.reader.state());
    const revision = model.reader.revision();
    const events: number[] = [];
    model.on("change", (e) => events.push(e.patch.ops.length));

    expect(model.deleteEntities({ nodes: [b.node] }).status).toBe("accepted");
    expect(model.reader.nodes().map((n) => n.id)).toEqual([a.node, c.node]);
    expect(model.reader.connections()).toEqual([]);
    expect(model.reader.ports()).toHaveLength(2);
    expect(model.reader.revision()).toBe(revision + 1);
    expect(events).toEqual([3]);

    expect(model.undo().status).toBe("accepted");
    expect(
      JSON.stringify(model.reader.state()).replace(/"revision":\d+/, ""),
    ).toBe(before.replace(/"revision":\d+/, ""));
  });

  it("rejects the whole command when any part is protected", () => {
    const model = makeModel();
    const a = make(model, "source");
    const b = make(model, "source");
    model.submit({
      ops: [
        {
          op: "update",
          entity: "node",
          id: b.node,
          fields: { capabilities: { new: { delete: false } } },
        },
      ],
    });
    const result = model.deleteEntities({ nodes: [a.node, b.node] });
    expect(result.status).toBe("rejected");
    expect(model.reader.nodes()).toHaveLength(2);
  });

  it("deletes a listed connection alone and rejects unknown IDs", () => {
    const model = makeModel();
    const a = make(model, "source");
    const b = make(model, "sink");
    model.connect(end(a), end(b));
    expect(model.deleteEntities({ nodes: ["nope" as never] }).status).toBe(
      "rejected",
    );
    expect(
      model.deleteEntities({ connections: [firstConnection(model)] }).status,
    ).toBe("accepted");
    expect(model.reader.nodes()).toHaveLength(2);
  });
});

describe("PAT-04 plans do not apply", () => {
  it("lists removals without changing the model", () => {
    const model = makeModel();
    const a = make(model, "source");
    const b = make(model, "sink");
    model.connect(end(a), end(b));
    const revision = model.reader.revision();
    const plan = model.plan({ kind: "deleteEntities", nodes: [a.node] });
    expect(plan.kind).toBe("ready");
    if (plan.kind === "ready") {
      expect(plan.effects.removed.nodes).toEqual([a.node]);
      expect(plan.effects.removed.connections).toHaveLength(1);
      expect(plan.effects.removed.ports).toEqual(a.ports);
    }
    expect(model.reader.revision()).toBe(revision);
    expect(model.reader.nodes()).toHaveLength(2);
  });
});
