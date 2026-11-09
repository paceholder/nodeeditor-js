import { describe, expect, it } from "vitest";
import { end, make, makeModel } from "../commands/test-kit.js";
import { createDefaultConnectionPolicy } from "./default-policy.js";
import type { ConnectionPolicy } from "./types.js";
import { createValidatedPolicy } from "./validated-policy.js";
import { createVerdictCache } from "./verdict-cache.js";
import type { ConnectionVerdict } from "./verdict-types.js";

const flush = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

function setup(answer: ConnectionVerdict = { valid: true }) {
  let calls = 0;
  const cache = createVerdictCache({
    validator: async () => {
      calls += 1;
      return answer;
    },
    revision: () => 1,
  });
  const base = createDefaultConnectionPolicy();
  const policy = createValidatedPolicy(base, cache);
  const model = makeModel({ connectionPolicy: policy });
  const src = make(model, "source");
  const dst = make(model, "sink");
  return { cache, base, policy, model, src, dst, calls: () => calls };
}

describe("validated policy", () => {
  it("returns a base rejection without asking the validator or the cache", () => {
    const { policy, model, src, calls } = setup();
    const other = make(model, "source");
    const outcome = policy.evaluate(
      { from: end(src), to: end(other) },
      model.reader,
    );
    expect(outcome).toMatchObject({
      kind: "reject",
      rejection: { code: "direction-mismatch" },
    });
    expect(calls()).toBe(0);
  });

  it("answers pending for an unknown plan and starts no request", () => {
    const { policy, model, src, dst, calls } = setup();
    const outcome = policy.evaluate(
      { from: end(src), to: end(dst) },
      model.reader,
    );
    expect(outcome.kind).toBe("pending");
    if (outcome.kind === "pending") {
      expect(outcome.plan?.from.port).toBe(end(src).port);
    }
    expect(calls()).toBe(0);
  });

  it("accepts with the base plan once a valid verdict is cached", async () => {
    const { policy, base, cache, model, src, dst } = setup();
    const proposal = { from: end(src), to: end(dst) };
    const pending = policy.evaluate(proposal, model.reader);
    if (pending.kind !== "pending" || !pending.plan) throw new Error("no plan");
    await cache.request(pending.plan);
    expect(policy.evaluate(proposal, model.reader)).toEqual(
      base.evaluate(proposal, model.reader),
    );
  });

  it("rejects with the validator's reason once an invalid verdict is cached", async () => {
    const reason = {
      code: "type-mismatch" as const,
      message: "Not these two",
      entities: [],
    };
    const { policy, cache, model, src, dst } = setup({
      valid: false,
      rejection: reason,
    });
    const proposal = { from: end(src), to: end(dst) };
    const pending = policy.evaluate(proposal, model.reader);
    if (pending.kind !== "pending" || !pending.plan) throw new Error("no plan");
    await cache.request(pending.plan);
    expect(policy.evaluate(proposal, model.reader)).toEqual({
      kind: "reject",
      rejection: reason,
    });
  });

  it("passes a choice outcome through untouched", () => {
    const choosing: ConnectionPolicy = {
      evaluate: () => ({ kind: "choice", alternatives: [] }),
    };
    const cache = createVerdictCache({
      validator: async () => ({ valid: true }),
      revision: () => 1,
    });
    const model = makeModel();
    const policy = createValidatedPolicy(choosing, cache);
    const a = make(model, "source");
    const b = make(model, "sink");
    expect(policy.evaluate({ from: end(a), to: end(b) }, model.reader)).toEqual(
      { kind: "choice", alternatives: [] },
    );
  });

  it("causes no validator call from 50 evaluations, can, plan and dry runs", async () => {
    const { policy, model, src, dst, calls } = setup();
    for (let i = 0; i < 50; i++) {
      policy.evaluate({ from: end(src), to: end(dst) }, model.reader);
    }
    const command = {
      kind: "connect",
      from: end(src),
      to: end(dst),
    } as const;
    model.can(command);
    const planned = model.plan(command);
    const executed = model.execute(command);
    await flush();
    expect(planned.kind).toBe("pending");
    expect(executed.status).toBe("unverified");
    expect(model.reader.connections()).toEqual([]);
    expect(calls()).toBe(0);
  });
});
