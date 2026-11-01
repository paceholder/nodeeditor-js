import { describe, expect, it } from "vitest";
import { connectionId } from "../../base/ids/ids.js";
import { end, make, makeModel } from "../commands/test-kit.js";
import { createDefaultConnectionPolicy } from "./default-policy.js";
import type { ConnectionPolicy, PolicyOutcome } from "./types.js";

describe("CON-03 one policy for all input routes", () => {
  it("rejects a raw patch adding an invalid connection with the policy's reason", () => {
    const model = makeModel();
    const a = make(model, "source");
    const b = make(model, "source");
    const viaCommand = model.connect(end(a), end(b));
    const viaPatch = model.submit({
      ops: [
        {
          op: "add",
          entity: "connection",
          record: {
            id: connectionId("c9"),
            kind: "default",
            from: end(a),
            to: end(b),
          },
        },
      ],
    });
    expect(viaPatch.status).toBe("rejected");
    if (viaPatch.status === "rejected" && viaCommand.status === "rejected") {
      expect(viaPatch.error.code).toBe("direction-mismatch");
      expect(viaPatch.error.code).toBe(viaCommand.error.code);
    }
    expect(model.reader.connections()).toEqual([]);
  });

  it("rejects a raw connection that is not in normalized orientation", () => {
    const model = makeModel();
    const src = make(model, "source");
    const dst = make(model, "sink");
    const result = model.submit({
      ops: [
        {
          op: "add",
          entity: "connection",
          record: {
            id: connectionId("c9"),
            kind: "default",
            from: end(dst),
            to: end(src),
          },
        },
      ],
    });
    expect(result.status).toBe("rejected");
  });

  it("revalidates connections when a port type changes", () => {
    const model = makeModel();
    const s1 = make(model, "shaft");
    const s2 = make(model, "shaft");
    model.connect(end(s1), end(s2));
    const port = s1.ports[0];
    if (!port) throw new Error("setup");
    const result = model.submit({
      ops: [
        {
          op: "update",
          entity: "port",
          id: port,
          fields: { typeKey: { old: "mechanical", new: "thermal" } },
        },
      ],
    });
    expect(result.status).toBe("rejected");
    if (result.status === "rejected")
      expect(result.error.code).toBe("type-mismatch");
  });
});

describe("CON-05 commit-time revalidation", () => {
  it("rejects a stale plan whose target was filled meanwhile", () => {
    const model = makeModel();
    const a = make(model, "source");
    const b = make(model, "source");
    const dst = make(model, "sink");
    const plan = model.plan({ kind: "connect", from: end(a), to: end(dst) });
    expect(plan.kind).toBe("ready");
    // Another edit fills the input first (a different connection ID, as a second client would).
    const filler = model.submit({
      ops: [
        {
          op: "add",
          entity: "connection",
          record: {
            id: connectionId("c50"),
            kind: "default",
            from: end(b),
            to: end(dst),
          },
        },
      ],
    });
    expect(filler.status).toBe("accepted");
    if (plan.kind !== "ready") return;
    const stale = model.submit(plan.patch);
    expect(stale.status).toBe("rejected");
    if (stale.status === "rejected")
      expect(stale.error.code).toBe("capacity-exhausted");
    expect(model.reader.connections()).toHaveLength(1);
  });
});

describe("CON-01 host policy", () => {
  it("accepts signal to hydraulic when the host policy says so", () => {
    const fallback = createDefaultConnectionPolicy();
    const policy: ConnectionPolicy = {
      evaluate(p, graph) {
        const a = graph.getPort(p.from.port);
        const b = graph.getPort(p.to.port);
        if (a?.typeKey === "signal" && b?.typeKey === "hydraulic") {
          return {
            kind: "accept",
            plan: {
              from: p.from,
              to: p.to,
              connectionKind: "default",
              auxiliary: [],
            },
          };
        }
        return fallback.evaluate(p, graph);
      },
    };
    const strict = makeModel();
    const s0 = make(strict, "source");
    const h0 = make(strict, "pipe");
    expect(strict.connect(end(s0), end(h0)).status).toBe("rejected");

    const model = makeModel({ connectionPolicy: policy });
    const src = make(model, "source");
    const pipe = make(model, "pipe");
    expect(model.connect(end(src), end(pipe)).status).toBe("accepted");
  });
});

describe("CON-04 structured policy outcomes", () => {
  const plan = (n: number) => ({
    from: { node: `n${n}`, port: `p${n}` } as never,
    to: { node: "n9", port: "p9" } as never,
    connectionKind: "default",
    auxiliary: [],
  });
  const fixed = (outcome: PolicyOutcome): ConnectionPolicy => ({
    evaluate: () => outcome,
  });

  it("choice yields choice-required with alternatives and changes nothing", () => {
    const model = makeModel({
      connectionPolicy: fixed({
        kind: "choice",
        alternatives: [
          { ...plan(1), key: "one" },
          { ...plan(2), key: "two", label: "Second" },
        ],
      }),
    });
    const a = make(model, "source");
    const b = make(model, "sink");
    const result = model.connect(end(a), end(b));
    expect(result.status).toBe("choice-required");
    if (result.status === "choice-required")
      expect(result.alternatives.map(({ key, label }) => [key, label])).toEqual(
        [
          ["one", "n1.p1 to n9.p9"],
          ["two", "Second"],
        ],
      );
    expect(model.reader.connections()).toEqual([]);
  });

  it("pending yields unverified and is never treated as accepted", () => {
    const model = makeModel({
      connectionPolicy: fixed({ kind: "pending", reason: "validator offline" }),
    });
    const a = make(model, "source");
    const b = make(model, "sink");
    const result = model.connect(end(a), end(b));
    expect(result).toEqual({
      status: "unverified",
      reason: "validator offline",
    });
    expect(model.reader.connections()).toEqual([]);
  });

  it("a raw patch hitting choice or pending is rejected at commit", () => {
    for (const [outcome, code] of [
      [{ kind: "choice", alternatives: [] }, "choice-required"],
      [{ kind: "pending", reason: "wait" }, "pending-validation"],
    ] as const) {
      const model = makeModel({ connectionPolicy: fixed(outcome) });
      const a = make(model, "source");
      const b = make(model, "sink");
      const result = model.submit({
        ops: [
          {
            op: "add",
            entity: "connection",
            record: {
              id: connectionId("c9"),
              kind: "default",
              from: end(a),
              to: end(b),
            },
          },
        ],
      });
      expect(result.status).toBe("rejected");
      if (result.status === "rejected") expect(result.error.code).toBe(code);
    }
  });
});
