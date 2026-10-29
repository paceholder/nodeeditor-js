import { describe, expect, it } from "vitest";
import { end, make, makeModel } from "./test-kit.js";

const hyd = { direction: "undirected", typeKey: "hydraulic" } as const;

describe("stable port identity", () => {
  it("insert and reorder keep attachments", () => {
    const model = makeModel();
    const p = make(model, "pipe");
    const q = make(model, "pipe");
    model.connect(end(p, 1), end(q, 0));
    const [p0, p1] = p.ports;
    if (!p0 || !p1) throw new Error("setup");
    const result = model.setPorts(
      p.node,
      [{ ...hyd }, { id: p1, ...hyd }, { id: p0, ...hyd }],
      "reject",
    );
    expect(result.status).toBe("accepted");
    const ports = model.reader.getNode(p.node)?.ports ?? [];
    expect(ports).toHaveLength(3);
    expect(ports.slice(1)).toEqual([p1, p0]);
    expect(ports[0]).not.toBe(p0);
    const conn = model.reader.connections()[0];
    expect(conn?.from.port).toBe(p1);
    expect(model.reader.connectionsOfPort(p1)).toHaveLength(1);
    model.undo();
    expect(model.reader.getNode(p.node)?.ports).toEqual([p0, p1]);
  });
});

describe("removing a connected port", () => {
  function setup() {
    const model = makeModel();
    const p = make(model, "pipe");
    const q = make(model, "pipe");
    model.connect(end(p, 1), end(q, 0));
    return { model, p, q };
  }

  it("affected remove removes its connections in the same patch", () => {
    const { model, p } = setup();
    const keep = p.ports[0];
    if (!keep) throw new Error("setup");
    const events: number[] = [];
    model.on("change", (e) => events.push(e.patch.ops.length));
    expect(
      model.setPorts(p.node, [{ id: keep, ...hyd }], "remove").status,
    ).toBe("accepted");
    expect(model.reader.connections()).toEqual([]);
    expect(model.reader.getNode(p.node)?.ports).toEqual([keep]);
    expect(events).toHaveLength(1);
    model.undo();
    expect(model.reader.connections()).toHaveLength(1);
  });

  it("affected reject rejects and changes nothing", () => {
    const { model, p } = setup();
    const keep = p.ports[0];
    if (!keep) throw new Error("setup");
    const result = model.setPorts(p.node, [{ id: keep, ...hyd }], "reject");
    expect(result.status).toBe("rejected");
    expect(model.reader.connections()).toHaveLength(1);
    expect(model.reader.getNode(p.node)?.ports).toHaveLength(2);
  });
});

describe("preview lists affected connections", () => {
  it("a type change plan lists the incompatible connections before commit", () => {
    const model = makeModel();
    const p = make(model, "pipe");
    const q = make(model, "pipe");
    model.connect(end(p, 0), end(q, 0));
    model.connect(end(p, 1), end(q, 1));
    const [p0, p1] = p.ports;
    if (!p0 || !p1) throw new Error("setup");
    const revision = model.reader.revision();
    const plan = model.plan({
      kind: "setPorts",
      node: p.node,
      ports: [
        { id: p0, direction: "undirected", typeKey: "thermal" },
        { id: p1, ...hyd },
      ],
      affected: "remove",
    });
    expect(plan.kind).toBe("ready");
    if (plan.kind === "ready") {
      expect(plan.effects.removed.connections).toHaveLength(1);
      expect(plan.effects.updated.ports).toEqual([p0]);
    }
    expect(model.reader.revision()).toBe(revision);
    expect(model.reader.connections()).toHaveLength(2);
    expect(
      model.execute({
        kind: "setPorts",
        node: p.node,
        ports: [
          { id: p0, direction: "undirected", typeKey: "thermal" },
          { id: p1, ...hyd },
        ],
        affected: "reject",
      }).status,
    ).toBe("rejected");
  });

  it("rejects ports from another node and duplicate listings", () => {
    const model = makeModel();
    const p = make(model, "pipe");
    const q = make(model, "pipe");
    const own = p.ports[0];
    const foreign = q.ports[0];
    if (!own || !foreign) throw new Error("setup");
    expect(
      model.setPorts(p.node, [{ id: foreign, ...hyd }], "remove").status,
    ).toBe("rejected");
    expect(
      model.setPorts(
        p.node,
        [
          { id: own, ...hyd },
          { id: own, ...hyd },
        ],
        "remove",
      ).status,
    ).toBe("rejected");
  });
});
