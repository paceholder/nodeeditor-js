import { describe, expect, it } from "vitest";
import { end, make, makeModel } from "../commands/test-kit.js";
import { createDefaultConnectionPolicy } from "./default-policy.js";
import type {
  ConnectionPlan,
  ConnectionPolicy,
  ConnectionProposal,
} from "./types.js";
import { verdictKey } from "./verdict-key.js";

function planOf(
  policy: ConnectionPolicy,
  proposal: ConnectionProposal,
  model: ReturnType<typeof makeModel>,
): ConnectionPlan {
  const outcome = policy.evaluate(proposal, model.reader);
  if (outcome.kind !== "accept")
    throw new Error(`not accepted: ${outcome.kind}`);
  return outcome.plan;
}

describe("verdict key", () => {
  it("is one key for the same normalized plan, however it was drawn", () => {
    const model = makeModel();
    const policy = createDefaultConnectionPolicy();
    const src = make(model, "source");
    const dst = make(model, "sink");
    const drawnForward = planOf(
      policy,
      { from: end(src), to: end(dst) },
      model,
    );
    const drawnBackward = planOf(
      policy,
      { from: end(dst), to: end(src) },
      model,
    );
    expect(verdictKey(drawnBackward)).toBe(verdictKey(drawnForward));
  });

  it("is one key for an undirected pair in either drawn order", () => {
    const model = makeModel();
    const policy = createDefaultConnectionPolicy();
    const a = make(model, "pipe");
    const b = make(model, "pipe", 100, 0);
    const ab = planOf(policy, { from: end(a), to: end(b) }, model);
    const ba = planOf(policy, { from: end(b), to: end(a) }, model);
    expect(ab.from.port).not.toBe(ba.from.port);
    expect(verdictKey(ab)).toBe(verdictKey(ba));
  });

  it("differs for another kind or other ports", () => {
    const model = makeModel();
    const policy = createDefaultConnectionPolicy();
    const a = make(model, "pipe");
    const b = make(model, "pipe", 100, 0);
    const base = planOf(policy, { from: end(a, 0), to: end(b, 0) }, model);
    const otherKind = planOf(
      policy,
      { from: end(a, 0), to: end(b, 0), kind: "flow" },
      model,
    );
    const otherPorts = planOf(
      policy,
      { from: end(a, 1), to: end(b, 0) },
      model,
    );
    expect(verdictKey(otherKind)).not.toBe(verdictKey(base));
    expect(verdictKey(otherPorts)).not.toBe(verdictKey(base));
  });

  it("ignores the replaced connection that led to the plan", () => {
    const model = makeModel();
    const base = createDefaultConnectionPolicy();
    const src = make(model, "source");
    const dst = make(model, "sink");
    const plain = planOf(base, { from: end(src), to: end(dst) }, model);
    const first = model.connect(end(src), end(dst));
    expect(first.status).toBe("accepted");
    const existing = model.reader.connections()[0];
    if (!existing) throw new Error("no connection");
    // Re-pointing onto the same ports: the stored connection is ignored for occupancy.
    const replacing = planOf(
      base,
      { from: end(src), to: end(dst), replacing: existing.id },
      model,
    );
    expect(verdictKey(replacing)).toBe(verdictKey(plain));
  });

  it("ignores the named choice that led to the plan", () => {
    const model = makeModel();
    const base = createDefaultConnectionPolicy();
    const src = make(model, "source");
    const dst = make(model, "sink");
    const choosing: ConnectionPolicy = {
      evaluate(proposal, graph) {
        const outcome = base.evaluate(
          { from: proposal.from, to: proposal.to },
          graph,
        );
        if (outcome.kind !== "accept") return outcome;
        if (proposal.choice === undefined) {
          return {
            kind: "choice",
            alternatives: [{ key: "only", ...outcome.plan }],
          };
        }
        return outcome;
      },
    };
    const offered = choosing.evaluate(
      { from: end(src), to: end(dst) },
      model.reader,
    );
    expect(offered.kind).toBe("choice");
    const chosen = planOf(
      choosing,
      { from: end(src), to: end(dst), choice: "only" },
      model,
    );
    if (offered.kind !== "choice") return;
    const alternative = offered.alternatives[0];
    if (!alternative) throw new Error("no alternative");
    expect(verdictKey(alternative)).toBe(verdictKey(chosen));
  });
});
