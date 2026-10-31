import { describe, expect, it } from "vitest";
import { createDefaultConnectionPolicy } from "../../edit/policy/default-policy.js";
import type { GraphModel } from "../../graph-model.js";
import { fragmentToText, parseFragmentText } from "./fragment-text.js";
import { end, fragmentOf, make, makeModel } from "./test-kit.js";

const placement = { kind: "offset", by: { x: 20, y: 20 } } as const;

/** Three pipes in a chain: a fragment of three nodes and two connections. */
function chainOfThree(model: GraphModel) {
  const a = make(model, "pipe", 0, 0);
  const b = make(model, "pipe", 100, 0);
  const c = make(model, "pipe", 200, 0);
  model.connect(end(a, 1), end(b, 0));
  model.connect(end(b, 1), end(c, 0));
  return fragmentOf(model, [a.node, b.node, c.node]);
}

const count = (model: GraphModel) => ({
  nodes: model.reader.nodes().length,
  ports: model.reader.ports().length,
  connections: model.reader.connections().length,
});

describe("EDT-03 / INT-08 / TXN-01 paste through the model", () => {
  it("Paste is one history entry: one undo removes all five entities", () => {
    const model = makeModel();
    const fragment = chainOfThree(model);
    const before = count(model);
    const result = model.execute({ kind: "paste", fragment, placement });
    expect(result.status).toBe("accepted");
    expect(model.historyState().undoLabel).toBe("Paste");
    expect(count(model)).toEqual({
      nodes: before.nodes + 3,
      ports: before.ports + 6,
      connections: before.connections + 2,
    });
    if (result.status !== "accepted") return;
    expect(result.changed.nodes).toHaveLength(3);
    expect(result.changed.connections).toHaveLength(2);
    for (const id of result.changed.nodes)
      expect(model.reader.getNode(id)).toBeDefined();
    expect(model.undo().status).toBe("accepted");
    expect(count(model)).toEqual(before);
    expect(model.historyState().undoLabel).toBe("Connect");
  });

  it("pastes parsed clipboard text the same as the fragment object", () => {
    const model = makeModel();
    const fragment = chainOfThree(model);
    const parsed = parseFragmentText(fragmentToText(fragment));
    if (!parsed.ok) throw new Error("setup");
    expect(
      model.plan({ kind: "paste", fragment: parsed.value, placement }),
    ).toEqual(model.plan({ kind: "paste", fragment, placement }));
  });
});

describe("EDT-05 paste is validated before anything changes", () => {
  it("Oversized fragment: rejected with a size error, graph unchanged", () => {
    const model = makeModel({ fragmentLimits: { maxNodes: 2 } });
    const fragment = chainOfThree(model);
    const revision = model.revision();
    const result = model.execute({ kind: "paste", fragment, placement });
    expect(result.status === "rejected" && result.error.code).toBe(
      "limit-exceeded",
    );
    expect(model.revision()).toBe(revision);
  });

  it("Read-only model: paste is unavailable with the read-only reason", () => {
    const source = makeModel();
    const fragment = chainOfThree(source);
    const model = makeModel({ readOnly: true });
    const can = model.can({ kind: "paste", fragment, placement });
    expect(can.available).toBe(false);
    if (!can.available) {
      expect(can.reason.code).toBe("capability-denied");
      expect(can.reason.message).toMatch(/read-only/);
    }
    expect(model.reader.nodes()).toHaveLength(0);
  });

  it("CON-03 Internal connection refused by policy: the whole paste is rejected", () => {
    const fallback = createDefaultConnectionPolicy();
    let refuse = false;
    const model = makeModel({
      connectionPolicy: {
        evaluate: (proposal, graph) =>
          refuse
            ? {
                kind: "reject",
                reason: {
                  code: "type-mismatch",
                  message: "Host forbids this connection",
                  entities: [],
                },
              }
            : fallback.evaluate(proposal, graph),
      },
    });
    const fragment = chainOfThree(model);
    refuse = true;
    const before = count(model);
    const result = model.execute({ kind: "paste", fragment, placement });
    expect(result.status === "rejected" && result.error.message).toBe(
      "Host forbids this connection",
    );
    expect(count(model)).toEqual(before);
    expect(model.historyState().undoLabel).toBe("Connect");
  });
});
