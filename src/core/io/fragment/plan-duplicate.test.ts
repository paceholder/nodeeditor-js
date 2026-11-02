import { describe, expect, it } from "vitest";
import type { PlanResult } from "../../edit/commands/types.js";
import { createFragmentPlanners } from "./plan-paste.js";
import {
  contextOf,
  end,
  fragmentOf,
  make,
  makeModel,
  pairWithNeighbour,
} from "./test-kit.js";

const { paste, duplicate } = createFragmentPlanners();
const placement = { kind: "offset", by: { x: 20, y: 20 } } as const;

function ready(plan: PlanResult) {
  if (plan.kind !== "ready") throw new Error(`plan ${plan.kind}`);
  return plan;
}

describe("EDT-03 duplicate", () => {
  it("Duplicate connected pair: two new nodes and one new connection between them", () => {
    const model = makeModel();
    const { a, b } = pairWithNeighbour(model);
    const before = model.reader.state();
    const plan = ready(
      duplicate(
        { kind: "duplicate", nodes: [a.node, b.node], placement },
        contextOf(model),
      ),
    );
    expect(plan.label).toBe("Duplicate");
    expect(model.submit(plan.patch).status).toBe("accepted");
    const { nodes, connections } = plan.effects.created;
    expect(nodes).toHaveLength(2);
    expect(connections).toHaveLength(1);
    const c = connections[0] && model.reader.getConnection(connections[0]);
    expect([c?.from.node, c?.to.node]).toEqual(nodes);
    for (const n of before.nodes) expect(model.reader.getNode(n.id)).toBe(n);
    for (const x of before.connections)
      expect(model.reader.getConnection(x.id)).toBe(x);
  });

  it("Dynamic ports and payload copied: same ports in order, new IDs, equal payload", () => {
    const model = makeModel();
    const a = make(model, "pipe");
    const b = make(model, "pipe", 100, 0);
    const [p1, p2] = a.ports;
    if (!p1 || !p2) throw new Error("setup");
    model.execute({
      kind: "setPorts",
      node: a.node,
      affected: "reject",
      ports: [
        { id: p2, direction: "undirected", typeKey: "hydraulic" },
        { direction: "undirected", typeKey: "hydraulic", label: "tap" },
        { id: p1, direction: "undirected", typeKey: "hydraulic" },
      ],
    });
    model.execute({
      kind: "updateNode",
      node: a.node,
      payload: { length: 3, tags: ["x"] },
    });
    const tap = model.reader.getNode(a.node)?.ports[1];
    if (!tap) throw new Error("setup");
    model.connect({ node: a.node, port: tap }, end(b, 0));
    const plan = ready(
      duplicate(
        { kind: "duplicate", nodes: [a.node, b.node], placement },
        contextOf(model),
      ),
    );
    model.submit(plan.patch);
    const [copyA, copyB] = plan.effects.created.nodes.map((id) =>
      model.reader.getNode(id),
    );
    const original = model.reader.getNode(a.node);
    expect(copyA?.payload).toEqual(original?.payload);
    const copyPorts = copyA ? model.reader.portsOf(copyA.id) : [];
    const origPorts = model.reader.portsOf(a.node);
    expect(copyPorts.map(({ id: _i, node: _n, ...rest }) => rest)).toEqual(
      origPorts.map(({ id: _i, node: _n, ...rest }) => rest),
    );
    for (const p of copyPorts) expect(original?.ports).not.toContain(p.id);
    const [link] = copyA ? model.reader.connectionsOfNode(copyA.id) : [];
    expect(link?.from).toEqual({ node: copyA?.id, port: copyA?.ports[1] });
    expect(link?.to.node).toBe(copyB?.id);
  });

  it("duplicate and paste of the same selection give equal patches apart from labels", () => {
    const model = makeModel();
    const { a, b } = pairWithNeighbour(model);
    const viaDuplicate = ready(
      duplicate(
        { kind: "duplicate", nodes: [b.node, a.node], placement },
        contextOf(model),
      ),
    );
    const viaPaste = ready(
      paste(
        {
          kind: "paste",
          fragment: fragmentOf(model, [a.node, b.node]),
          placement,
        },
        contextOf(model),
      ),
    );
    expect(viaDuplicate.patch).toEqual(viaPaste.patch);
    expect(viaDuplicate.effects).toEqual(viaPaste.effects);
    expect([viaDuplicate.label, viaPaste.label]).toEqual([
      "Duplicate",
      "Paste",
    ]);
  });
});

describe("ROU-03e, EDT-03 duplicate keeps the shape", () => {
  it("Duplicate keeps the shape: the copy's pins shift by the duplicate offset", () => {
    const model = makeModel();
    const { a, b } = pairWithNeighbour(model);
    const original = model.reader.connections()[0];
    if (!original) throw new Error("setup");
    model.execute({
      kind: "setRoute",
      connection: original.id,
      route: [
        { kind: "segment", orientation: "vertical", at: 50 },
        { kind: "segment", orientation: "horizontal", at: 5 },
      ],
    });
    const plan = ready(
      duplicate(
        { kind: "duplicate", nodes: [a.node, b.node], placement },
        contextOf(model),
      ),
    );
    expect(model.submit(plan.patch).status).toBe("accepted");
    const copy = plan.effects.created.connections[0];
    const record = copy && model.reader.getConnection(copy);
    expect(record?.route).toEqual([
      { kind: "segment", orientation: "vertical", at: 70 },
      { kind: "segment", orientation: "horizontal", at: 25 },
    ]);
    expect(model.reader.getConnection(original.id)?.route?.[0]?.at).toBe(50);
  });
});
