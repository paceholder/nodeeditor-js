import { describe, expect, it } from "vitest";
import { connectionId } from "../../base/ids/ids.js";
import { fragmentOf } from "../../io/fragment/test-kit.js";
import { toRevision } from "../adapter/types.js";
import { createDefaultConnectionPolicy } from "../policy/default-policy.js";
import type { ConnectionPolicy, ConnectionProposal } from "../policy/types.js";
import { createValidatedPolicy } from "../policy/validated-policy.js";
import { createVerdictCache } from "../policy/verdict-cache.js";
import { verdictKey } from "../policy/verdict-key.js";
import type { ConnectionVerdict } from "../policy/verdict-types.js";
import { end, make, makeModel } from "./test-kit.js";

const refusal = {
  valid: false,
  reason: { code: "type-mismatch", message: "Not allowed", entities: [] },
} as const satisfies ConnectionVerdict;

/** A model whose connections need a host verdict, with a tool-like way to obtain one. */
function setup(base: ConnectionPolicy = createDefaultConnectionPolicy()) {
  const answers = new Map<string, ConnectionVerdict>();
  const cache = createVerdictCache({
    validator: async ({ proposal }) =>
      answers.get(
        verdictKey({ ...proposal, connectionKind: proposal.kind }),
      ) ?? {
        valid: true,
      },
    revision: () => toRevision("r1"),
  });
  const model = makeModel({
    connectionPolicy: createValidatedPolicy(base, cache),
  });
  /** What a tool does: ask the base policy for the plan and request its verdict. */
  async function obtain(proposal: ConnectionProposal) {
    const outcome = base.evaluate(proposal, model.reader);
    if (outcome.kind !== "accept") throw new Error(outcome.kind);
    await cache.request(outcome.plan);
    return outcome.plan;
  }
  return { model, cache, answers, obtain };
}

/** Policy that offers two kinds for an unspecified proposal (a named choice). */
const kinds: ConnectionPolicy = (() => {
  const base = createDefaultConnectionPolicy();
  return {
    evaluate(proposal, graph) {
      const kind = proposal.choice ?? proposal.kind;
      const outcome = base.evaluate(
        { ...proposal, ...(kind ? { kind } : {}) },
        graph,
      );
      if (outcome.kind !== "accept" || kind) return outcome;
      return {
        kind: "choice",
        alternatives: ["a", "b"].map((key) => ({
          key,
          ...outcome.plan,
          connectionKind: key,
        })),
      };
    },
  };
})();

describe("commit after the tool obtained a verdict", () => {
  it("commits a connect", async () => {
    const { model, obtain } = setup();
    const src = make(model, "source");
    const dst = make(model, "sink");
    await obtain({ from: end(src), to: end(dst) });
    expect(model.connect(end(src), end(dst)).status).toBe("accepted");
    expect(model.reader.connections()).toHaveLength(1);
  });

  it("commits a connect drawn from the input side", async () => {
    const { model, obtain } = setup();
    const src = make(model, "source");
    const dst = make(model, "sink");
    await obtain({ from: end(dst), to: end(src) });
    expect(model.connect(end(dst), end(src)).status).toBe("accepted");
    const [stored] = model.reader.connections();
    expect(stored?.from.port).toBe(end(src).port);
  });

  it("commits a reconnect that names the connection it replaces", async () => {
    const { model, obtain } = setup();
    const src = make(model, "source");
    const first = make(model, "sink");
    const second = make(model, "sink", 0, 100);
    await obtain({ from: end(src), to: end(first) });
    model.connect(end(src), end(first));
    const [existing] = model.reader.connections();
    if (!existing) throw new Error("no connection");
    await obtain({
      from: end(src),
      to: end(second),
      kind: existing.kind,
      replacing: existing.id,
    });
    const result = model.reconnect(existing.id, "to", end(second));
    expect(result.status).toBe("accepted");
    expect(model.reader.getConnection(existing.id)?.to.port).toBe(
      end(second).port,
    );
  });

  it("commits a connect that names one alternative of a choice", async () => {
    const { model, obtain } = setup(kinds);
    const src = make(model, "source");
    const dst = make(model, "sink");
    await obtain({ from: end(src), to: end(dst), choice: "b" });
    const result = model.execute({
      kind: "connect",
      from: end(src),
      to: end(dst),
      choice: "b",
    });
    expect(result.status).toBe("accepted");
    expect(model.reader.connections()[0]?.kind).toBe("b");
  });

  it("refuses a raw connection without a verdict as pending validation", () => {
    const { model } = setup();
    const src = make(model, "source");
    const dst = make(model, "sink");
    const result = model.submit({
      ops: [
        {
          op: "add",
          entity: "connection",
          record: {
            id: connectionId("c-raw"),
            kind: "default",
            from: end(src),
            to: end(dst),
          },
        },
      ],
    });
    expect(result).toMatchObject({
      status: "rejected",
      error: { code: "pending-validation" },
    });
  });

  it("returns unverified for a programmatic connect without a verdict", () => {
    const { model } = setup();
    const src = make(model, "source");
    const dst = make(model, "sink");
    const result = model.connect(end(src), end(dst));
    expect(result.status).toBe("unverified");
    expect(model.reader.connections()).toEqual([]);
  });
});

describe("undo and redo restore an accepted state", () => {
  async function connected() {
    const ctx = setup();
    const src = make(ctx.model, "source");
    const dst = make(ctx.model, "sink");
    await ctx.obtain({ from: end(src), to: end(dst) });
    ctx.model.connect(end(src), end(dst));
    const [connection] = ctx.model.reader.connections();
    if (!connection) throw new Error("no connection");
    return { ...ctx, src, dst, connection };
  }

  it("redoes a connection after its verdict was evicted", async () => {
    const { model, cache } = await connected();
    expect(model.undo().status).toBe("accepted");
    cache.reset();
    expect(model.redo().status).toBe("accepted");
    expect(model.reader.connections()).toHaveLength(1);
  });

  it("undoes a deletion after its verdict was evicted", async () => {
    const { model, cache, connection } = await connected();
    model.deleteEntities({ connections: [connection.id] });
    expect(model.reader.connections()).toEqual([]);
    cache.reset();
    expect(model.undo().status).toBe("accepted");
    expect(model.reader.connections()).toHaveLength(1);
  });

  it("still refuses to restore a connection with a cached rejection", async () => {
    const { model, cache, answers, src, dst, connection } = await connected();
    model.deleteEntities({ connections: [connection.id] });
    cache.reset();
    answers.set(
      verdictKey({
        from: end(src),
        to: end(dst),
        connectionKind: connection.kind,
      }),
      refusal,
    );
    await cache.request({
      from: end(src),
      to: end(dst),
      connectionKind: connection.kind,
      auxiliary: [],
    });
    const result = model.undo();
    expect(result).toMatchObject({
      status: "rejected",
      error: { code: "type-mismatch" },
    });
    expect(model.reader.connections()).toEqual([]);
  });
});

describe("paste and duplicate without verdicts", () => {
  it("returns unverified for a duplicate and creates nothing", async () => {
    const { model, obtain } = setup();
    const src = make(model, "source");
    const dst = make(model, "sink", 100, 0);
    await obtain({ from: end(src), to: end(dst) });
    model.connect(end(src), end(dst));
    const before = model.reader.nodes().length;
    const result = model.execute({
      kind: "duplicate",
      nodes: [src.node, dst.node],
      placement: { kind: "offset", by: { x: 0, y: 50 } },
    });
    expect(result.status).toBe("unverified");
    if (result.status !== "unverified") return;
    expect(result.missing).toHaveLength(1);
    expect(model.reader.nodes()).toHaveLength(before);
    expect(model.reader.connections()).toHaveLength(1);
  });

  it("returns unverified for a paste of a fragment with connections", async () => {
    const { model, obtain } = setup();
    const src = make(model, "source");
    const dst = make(model, "sink", 100, 0);
    await obtain({ from: end(src), to: end(dst) });
    model.connect(end(src), end(dst));
    const fragment = fragmentOf(model, [src.node, dst.node]);
    const before = model.reader.nodes().length;
    const result = model.execute({
      kind: "paste",
      fragment,
      placement: { kind: "offset", by: { x: 0, y: 50 } },
    });
    expect(result.status).toBe("unverified");
    if (result.status !== "unverified") return;
    expect(result.missing).toHaveLength(1);
    expect(model.reader.nodes()).toHaveLength(before);
  });
});
