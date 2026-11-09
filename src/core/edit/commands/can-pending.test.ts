import { describe, expect, it } from "vitest";
import { fragmentOf } from "../../io/fragment/test-kit.js";
import { toRevision } from "../adapter/types.js";
import { createDefaultConnectionPolicy } from "../policy/default-policy.js";
import { createValidatedPolicy } from "../policy/validated-policy.js";
import { createVerdictCache } from "../policy/verdict-cache.js";
import { end, make, makeModel } from "./test-kit.js";

function setup() {
  let calls = 0;
  const base = createDefaultConnectionPolicy();
  const cache = createVerdictCache({
    validator: async () => {
      calls += 1;
      return { valid: true };
    },
    revision: () => toRevision("r1"),
  });
  const model = makeModel({
    connectionPolicy: createValidatedPolicy(base, cache),
  });
  /** What a tool does: request the verdict for the plan the base policy gives. */
  async function verify(
    from: ReturnType<typeof end>,
    to: ReturnType<typeof end>,
  ) {
    const outcome = base.evaluate({ from, to }, model.reader);
    if (outcome.kind !== "accept") throw new Error("not accepted");
    await cache.request(outcome.plan);
  }
  return { model, verify, calls: () => calls };
}

const offset = { kind: "offset", by: { x: 0, y: 80 } } as const;

describe("availability without a verdict", () => {
  it("reports connect and reconnect unavailable for now and asks nobody", async () => {
    const { model, verify, calls } = setup();
    const src = make(model, "source");
    const dst = make(model, "sink");
    const other = make(model, "sink", 0, 100);
    expect(
      model.can({ kind: "connect", from: end(src), to: end(dst) }),
    ).toMatchObject({
      available: false,
      rejection: {
        code: "pending-validation",
        entities: [end(src).port, end(dst).port],
      },
    });
    await verify(end(src), end(dst));
    model.connect(end(src), end(dst));
    const [existing] = model.reader.connections();
    if (!existing) throw new Error("no connection");
    const asked = calls();
    expect(
      model.can({
        kind: "reconnect",
        connection: existing.id,
        end: "to",
        target: end(other),
      }),
    ).toMatchObject({
      available: false,
      rejection: { code: "pending-validation" },
    });
    expect(calls()).toBe(asked);
  });

  it("reports paste and duplicate unavailable for now when connections lack verdicts", async () => {
    const { model, verify, calls } = setup();
    const src = make(model, "source");
    const dst = make(model, "sink", 100, 0);
    // Give the first connection a verdict so it can exist, then copy it.
    await verify(end(src), end(dst));
    model.connect(end(src), end(dst));
    const before = calls();
    const duplicate = model.can({
      kind: "duplicate",
      nodes: [src.node, dst.node],
      placement: offset,
    });
    const paste = model.can({
      kind: "paste",
      fragment: fragmentOf(model, [src.node, dst.node]),
      placement: offset,
    });
    for (const availability of [duplicate, paste]) {
      expect(availability).toMatchObject({
        available: false,
        rejection: { code: "pending-validation" },
      });
    }
    expect(calls()).toBe(before);
  });
});

describe("the unverified result lists what is missing", () => {
  it("lists a paste's missing proposals in fragment order", async () => {
    const { model, verify } = setup();
    const a = make(model, "pipe", 0, 0);
    const b = make(model, "pipe", 100, 0);
    const c = make(model, "pipe", 200, 0);
    for (const [from, to] of [
      [end(a, 1), end(b, 0)],
      [end(b, 1), end(c, 0)],
    ] as const) {
      await verify(from, to);
      model.connect(from, to);
    }
    const fragment = fragmentOf(model, [a.node, b.node, c.node]);
    const result = model.execute({
      kind: "paste",
      fragment,
      placement: offset,
    });
    expect(result.status).toBe("unverified");
    if (result.status !== "unverified") return;
    expect(result.missing).toHaveLength(2);
    const [first, second] = result.missing;
    // The second proposal starts where the first one ends: the chain order is kept.
    expect(first?.to.node).toBe(second?.from.node);
    expect(model.reader.nodes()).toHaveLength(3);
  });

  it("lists the proposal of a connect that lacks a verdict", () => {
    const { model } = setup();
    const src = make(model, "source");
    const dst = make(model, "sink");
    const result = model.connect(end(src), end(dst));
    expect(result).toMatchObject({
      status: "unverified",
      missing: [{ from: end(src), to: end(dst), kind: "default" }],
    });
  });
});
