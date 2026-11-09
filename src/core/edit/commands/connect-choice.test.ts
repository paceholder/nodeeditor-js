import { describe, expect, it } from "vitest";
import { rejectionOf } from "../../base/result.js";
import { createDefaultConnectionPolicy } from "../policy/default-policy.js";
import type { ConnectionPolicy } from "../policy/types.js";
import { end, make, makeModel } from "./test-kit.js";

const KINDS = ["fast", "slow"] as const;

/**
 * Kind-based test policy over the default one: a proposal without a kind offers both
 * kinds as a choice; a named key or kind (the commit validator passes the stored kind)
 * is accepted with that kind; an unknown key is rejected.
 */
function kindPolicy(): ConnectionPolicy {
  const base = createDefaultConnectionPolicy();
  return {
    evaluate(proposal, graph) {
      const outcome = base.evaluate(proposal, graph);
      if (outcome.kind !== "accept") return outcome;
      const kind = proposal.choice ?? proposal.kind;
      if (kind === undefined) {
        return {
          kind: "choice",
          alternatives: KINDS.map((k) => ({
            ...outcome.plan,
            connectionKind: k,
            key: k,
            label: `${k} link`,
          })),
        };
      }
      if (!(KINDS as readonly string[]).includes(kind)) {
        return {
          kind: "reject",
          rejection: rejectionOf("type-mismatch", `No ${kind} links`),
        };
      }
      return {
        kind: "accept",
        plan: { ...outcome.plan, connectionKind: kind },
      };
    },
  };
}

const setup = () => {
  const model = makeModel({ connectionPolicy: kindPolicy() });
  const a = make(model, "source");
  const b = make(model, "sink");
  return { model, a, b };
};

describe("choosing a policy alternative", () => {
  it("Alternatives carry keys: equal keys in equal order on repeated evaluation", () => {
    const { model, a, b } = setup();
    const keys = () => {
      const r = model.connect(end(a), end(b));
      return r.status === "choice-required"
        ? r.alternatives.map((x) => [x.key, x.label, x.plan.connectionKind])
        : r.status;
    };
    const first = keys();
    expect(first).toEqual([
      ["fast", "fast link", "fast"],
      ["slow", "slow link", "slow"],
    ]);
    expect(keys()).toEqual(first);
    expect(model.reader.connections()).toEqual([]);
  });

  it("Connect with a chosen alternative: one connection of that kind, one history entry", () => {
    const { model, a, b } = setup();
    const before = model.historyState().undoLabel;
    const r = model.execute({
      kind: "connect",
      from: end(a),
      to: end(b),
      choice: "slow",
    });
    expect(r.status).toBe("accepted");
    expect(model.reader.connections().map((c) => c.kind)).toEqual(["slow"]);
    expect(model.historyState().undoLabel).toBe("Connect");
    model.undo();
    expect(model.reader.connections()).toEqual([]);
    expect(model.historyState().undoLabel).toBe(before);
  });

  it("Unknown or unresolved key: rejected, no connection", () => {
    const { model, a, b } = setup();
    const unknown = model.execute({
      kind: "connect",
      from: end(a),
      to: end(b),
      choice: "warp",
    });
    expect(unknown.status).toBe("rejected");
    // A policy that ignores `choice` and asks again is refused, never picked.
    const asking = makeModel({
      connectionPolicy: {
        evaluate: (p, g) =>
          kindPolicy().evaluate({ from: p.from, to: p.to }, g),
      },
    });
    const c = make(asking, "source");
    const d = make(asking, "sink");
    const again = asking.execute({
      kind: "connect",
      from: end(c),
      to: end(d),
      choice: "fast",
    });
    expect(again.status).toBe("rejected");
    if (again.status === "rejected") {
      expect(again.rejection.code).toBe("choice-required");
      expect(again.rejection.message).toContain("fast");
    }
    expect(model.reader.connections()).toEqual([]);
    expect(asking.reader.connections()).toEqual([]);
  });

  it("a capacity filled before the commit rejects the chosen alternative", () => {
    const { model, a, b } = setup();
    const other = make(model, "source");
    // The input takes one connection; another edit fills it first.
    expect(
      model.execute({
        kind: "connect",
        from: end(other),
        to: end(b),
        choice: "fast",
      }).status,
    ).toBe("accepted");
    const r = model.execute({
      kind: "connect",
      from: end(a),
      to: end(b),
      choice: "slow",
    });
    expect(r.status).toBe("rejected");
    if (r.status === "rejected")
      expect(r.rejection.code).toBe("capacity-exhausted");
    expect(model.reader.connections()).toHaveLength(1);
  });
});
