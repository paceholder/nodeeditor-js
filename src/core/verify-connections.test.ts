import { describe, expect, it } from "vitest";
import { end, make, makeModel } from "./edit/commands/test-kit.js";
import type { ConnectionVerdict } from "./edit/policy/verdict-types.js";

function setup(verdict: ConnectionVerdict = { valid: true }) {
  let calls = 0;
  const model = makeModel({
    connectionValidator: async () => {
      calls += 1;
      return verdict;
    },
  });
  return { model, calls: () => calls };
}

describe("verifyConnections", () => {
  it("lets the repeated command succeed once the verdicts are in", async () => {
    const { model, calls } = setup();
    const src = make(model, "source");
    const dst = make(model, "sink");
    const first = model.connect(end(src), end(dst));
    if (first.status !== "unverified") throw new Error(first.status);
    await model.verifyConnections(first.missing);
    expect(calls()).toBe(1);
    expect(model.connect(end(src), end(dst)).status).toBe("accepted");
    expect(calls()).toBe(1);
  });

  it("lets a duplicate succeed after verifying the connections it would create", async () => {
    const { model } = setup();
    const src = make(model, "source");
    const dst = make(model, "sink", 100, 0);
    const first = model.connect(end(src), end(dst));
    if (first.status !== "unverified") throw new Error(first.status);
    await model.verifyConnections(first.missing);
    model.connect(end(src), end(dst));
    const copy = {
      kind: "duplicate",
      nodes: [src.node, dst.node],
      placement: { kind: "offset", by: { x: 0, y: 80 } },
    } as const;
    const unverified = model.execute(copy);
    if (unverified.status !== "unverified") throw new Error(unverified.status);
    expect(model.reader.nodes()).toHaveLength(2);
    await model.verifyConnections(unverified.missing);
    expect(model.execute(copy).status).toBe("accepted");
    expect(model.reader.nodes()).toHaveLength(4);
    expect(model.reader.connections()).toHaveLength(2);
  });

  it("rejects with the verdict's reason when the host refuses the connection", async () => {
    const reason = {
      code: "type-mismatch" as const,
      message: "Not these two",
      entities: [],
    };
    const { model } = setup({ valid: false, reason });
    const src = make(model, "source");
    const dst = make(model, "sink");
    const first = model.connect(end(src), end(dst));
    if (first.status !== "unverified") throw new Error(first.status);
    await model.verifyConnections(first.missing);
    expect(model.connect(end(src), end(dst))).toMatchObject({
      status: "rejected",
      error: reason,
    });
    expect(model.reader.connections()).toEqual([]);
  });

  it("settles every proposal of a batch before it resolves", async () => {
    const { model, calls } = setup();
    const a = make(model, "source");
    const b = make(model, "source", 0, 100);
    const x = make(model, "sink", 200, 0);
    const y = make(model, "sink", 200, 100);
    const missing = [
      { from: end(a), to: end(x), kind: "default" },
      { from: end(b), to: end(y), kind: "default" },
    ];
    await model.verifyConnections(missing);
    expect(calls()).toBe(2);
    expect(model.connect(end(a), end(x)).status).toBe("accepted");
    expect(model.connect(end(b), end(y)).status).toBe("accepted");
  });

  it("resolves at once for a model without a validator", async () => {
    const model = makeModel();
    const src = make(model, "source");
    const dst = make(model, "sink");
    await model.verifyConnections([
      { from: end(src), to: end(dst), kind: "default" },
    ]);
    expect(model.connect(end(src), end(dst)).status).toBe("accepted");
  });
});
