import { describe, expect, it } from "vitest";
import type { NodeRecord } from "../../data/model/records.js";
import type { PlanResult } from "../../edit/commands/types.js";
import type { GraphModel } from "../../graph-model.js";
import { boundsCentre, fragmentBounds } from "./bounds.js";
import { createFragmentPlanners } from "./plan-paste.js";
import {
  contextOf,
  fragmentOf,
  makeModel,
  pairWithNeighbour,
} from "./test-kit.js";

const { paste } = createFragmentPlanners();

function apply(model: GraphModel, plan: PlanResult): readonly string[] {
  if (plan.kind !== "ready") throw new Error(`plan ${plan.kind}`);
  expect(model.submit(plan.patch, { label: plan.label }).status).toBe(
    "accepted",
  );
  return [
    ...plan.effects.created.nodes,
    ...plan.effects.created.ports,
    ...plan.effects.created.connections,
  ];
}

const addedNodes = (model: GraphModel, ids: readonly string[]): NodeRecord[] =>
  model.reader.nodes().filter((n) => ids.includes(n.id));

describe("paste planning", () => {
  it("pasting twice allocates disjoint fresh IDs each time", () => {
    const model = makeModel();
    const { a, b } = pairWithNeighbour(model);
    const fragment = fragmentOf(model, [a.node, b.node]);
    const before = model.reader.state();
    const placement = { kind: "offset", by: { x: 20, y: 20 } } as const;
    const first = apply(
      model,
      paste({ kind: "paste", fragment, placement }, contextOf(model)),
    );
    const second = apply(
      model,
      paste({ kind: "paste", fragment, placement }, contextOf(model)),
    );
    expect(first).toHaveLength(7);
    expect(second).toHaveLength(7);
    expect(first.filter((id) => second.includes(id))).toEqual([]);
    for (const n of before.nodes) {
      expect(first).not.toContain(n.id);
      expect(model.reader.getNode(n.id)).toEqual(n);
    }
    expect(model.reader.connections()).toHaveLength(2 + 2);
  });

  it("puts the bounding-box centre on `at`", () => {
    const model = makeModel();
    const { a, b } = pairWithNeighbour(model);
    const fragment = fragmentOf(model, [a.node, b.node]);
    const at = { x: 500, y: -300 };
    const ids = apply(
      model,
      paste(
        { kind: "paste", fragment, placement: { kind: "center", at } },
        contextOf(model),
      ),
    );
    const box = fragmentBounds(addedNodes(model, ids));
    expect(box && boundsCentre(box)).toEqual(at);
  });

  it("moves every node by an `offset`, keeps stacking order on top", () => {
    const model = makeModel();
    const { a, b } = pairWithNeighbour(model);
    const fragment = fragmentOf(model, [a.node, b.node]);
    const top = Math.max(...model.reader.nodes().map((n) => n.z));
    const ids = apply(
      model,
      paste(
        {
          kind: "paste",
          fragment,
          placement: { kind: "offset", by: { x: 7, y: -3 } },
        },
        contextOf(model),
      ),
    );
    const [na, nb] = addedNodes(model, ids);
    const oa = model.reader.getNode(a.node);
    const ob = model.reader.getNode(b.node);
    expect(na?.position).toEqual({
      x: (oa?.position.x ?? 0) + 7,
      y: (oa?.position.y ?? 0) - 3,
    });
    expect(nb?.position).toEqual({
      x: (ob?.position.x ?? 0) + 7,
      y: (ob?.position.y ?? 0) - 3,
    });
    expect(na && nb && na.z > top && nb.z > na.z).toBe(true);
    expect(model.reader.paintOrder().slice(-2)).toEqual([na, nb]);
  });
});

describe("paste validation", () => {
  it("rejects an unregistered type, naming it", () => {
    const model = makeModel();
    const { a } = pairWithNeighbour(model);
    const fragment = JSON.parse(JSON.stringify(fragmentOf(model, [a.node])));
    fragment.fragment.nodes[0].type = "gadget";
    const plan = paste(
      {
        kind: "paste",
        fragment,
        placement: { kind: "offset", by: { x: 0, y: 0 } },
      },
      contextOf(model),
    );
    expect(plan.kind === "rejected" && plan.error).toMatchObject({
      code: "unknown-type",
      entities: ["gadget"],
    });
    expect(plan.kind === "rejected" && plan.error.message).toContain("gadget");
  });

  it("rejects an invalid fragment with the first error and a count", () => {
    const model = makeModel();
    const plan = paste(
      {
        kind: "paste",
        fragment: {
          format: "@paceholder/nodeeditor-js/fragment",
          version: 1,
          fragment: {
            format: "@paceholder/nodeeditor-js/graph",
            version: 1,
            nodes: [{}, {}],
          },
        },
        placement: { kind: "offset", by: { x: 0, y: 0 } },
      },
      contextOf(model),
    );
    expect(plan.kind).toBe("rejected");
    expect(plan.kind === "rejected" && plan.error.message).toMatch(
      /more error/,
    );
  });
});

describe("paste is a pure plan", () => {
  it("planning changes nothing and gives one add-only patch", () => {
    const model = makeModel();
    const { a, b } = pairWithNeighbour(model);
    const fragment = fragmentOf(model, [a.node, b.node]);
    const state = model.reader.state();
    const cursor = model.idCursor();
    const plan = paste(
      {
        kind: "paste",
        fragment,
        placement: { kind: "offset", by: { x: 1, y: 1 } },
      },
      contextOf(model),
    );
    expect(plan.kind === "ready" && plan.label).toBe("Paste");
    if (plan.kind === "ready") {
      expect(plan.patch.ops.every((op) => op.op === "add")).toBe(true);
      expect(plan.patch.idCursor).toBeDefined();
    }
    expect(model.reader.state()).toBe(state);
    expect(model.idCursor()).toEqual(cursor);
  });
});
