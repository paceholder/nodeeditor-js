import { describe, expect, it } from "vitest";
import { end, make, makeModel } from "../commands/test-kit.js";
import { createDefaultConnectionPolicy } from "./default-policy.js";
import type { PolicyOutcome } from "./types.js";

function code(outcome: PolicyOutcome): string {
  return outcome.kind === "reject" ? outcome.reason.code : outcome.kind;
}

describe("default directed preset", () => {
  it("accepts output to empty input", () => {
    const model = makeModel();
    const src = make(model, "source");
    const dst = make(model, "sink");
    const policy = createDefaultConnectionPolicy();
    expect(
      code(policy.evaluate({ from: end(src), to: end(dst) }, model.reader)),
    ).toBe("accept");
  });

  it("normalizes orientation to output to input", () => {
    const model = makeModel();
    const src = make(model, "source");
    const dst = make(model, "sink");
    const outcome = createDefaultConnectionPolicy().evaluate(
      { from: end(dst), to: end(src) },
      model.reader,
    );
    expect(outcome.kind).toBe("accept");
    if (outcome.kind === "accept") {
      expect(outcome.plan.from).toEqual(end(src));
      expect(outcome.plan.to).toEqual(end(dst));
    }
  });

  it("rejects wrong direction and mixed directed/undirected", () => {
    const model = makeModel();
    const a = make(model, "source");
    const b = make(model, "source");
    const pipe = make(model, "pipe");
    const policy = createDefaultConnectionPolicy();
    expect(
      code(policy.evaluate({ from: end(a), to: end(b) }, model.reader)),
    ).toBe("direction-mismatch");
    expect(
      code(policy.evaluate({ from: end(a), to: end(pipe) }, model.reader)),
    ).toBe("direction-mismatch");
  });

  it("rejects a second connection to an occupied input", () => {
    const model = makeModel();
    const a = make(model, "source");
    const b = make(model, "source");
    const dst = make(model, "sink");
    expect(model.connect(end(a), end(dst)).status).toBe("accepted");
    const second = model.connect(end(b), end(dst));
    expect(second.status).toBe("rejected");
    if (second.status === "rejected")
      expect(second.error.code).toBe("capacity-exhausted");
  });

  it("allows a cycle through three different nodes", () => {
    const model = makeModel();
    const rel = () =>
      model.registry.register({
        type: "relay",
        label: "Relay",
        defaultSize: { width: 1, height: 1 },
        ports: () => [
          { direction: "input", typeKey: "signal" },
          { direction: "output", typeKey: "signal" },
        ],
      });
    rel();
    const [x, y, z] = [
      make(model, "relay"),
      make(model, "relay"),
      make(model, "relay"),
    ];
    if (!x || !y || !z) throw new Error("setup");
    expect(model.connect(end(x, 1), end(y, 0)).status).toBe("accepted");
    expect(model.connect(end(y, 1), end(z, 0)).status).toBe("accepted");
    expect(model.connect(end(z, 1), end(x, 0)).status).toBe("accepted");
  });

  it("rejects a self-loop and a duplicate by default", () => {
    const model = makeModel();
    model.registry.register({
      type: "relay",
      label: "Relay",
      defaultSize: { width: 1, height: 1 },
      ports: () => [
        { direction: "input", typeKey: "signal" },
        { direction: "output", typeKey: "signal" },
      ],
    });
    const r = make(model, "relay");
    const policy = createDefaultConnectionPolicy();
    expect(
      code(policy.evaluate({ from: end(r, 1), to: end(r, 0) }, model.reader)),
    ).toBe("self-loop");
    expect(
      code(policy.evaluate({ from: end(r), to: end(r) }, model.reader)),
    ).toBe("same-port");
  });
});

describe("default undirected preset", () => {
  it("accepts equal domains and rejects different ones", () => {
    const model = makeModel();
    const s1 = make(model, "shaft");
    const s2 = make(model, "shaft");
    const p = make(model, "pipe");
    const policy = createDefaultConnectionPolicy();
    expect(
      code(policy.evaluate({ from: end(s1), to: end(s2) }, model.reader)),
    ).toBe("accept");
    expect(
      code(policy.evaluate({ from: end(s1), to: end(p) }, model.reader)),
    ).toBe("type-mismatch");
  });

  it("treats A to B and B to A as the same connection for duplicates", () => {
    const model = makeModel();
    const s1 = make(model, "shaft");
    const s2 = make(model, "shaft");
    expect(model.connect(end(s1), end(s2)).status).toBe("accepted");
    const reverse = model.connect(end(s2), end(s1));
    expect(reverse.status).toBe("rejected");
    if (reverse.status === "rejected")
      expect(reverse.error.code).toBe("duplicate-connection");
  });
});

describe("topology options", () => {
  it("allows self-loops when enabled", () => {
    const model = makeModel({
      connectionPolicy: createDefaultConnectionPolicy({ selfLoops: true }),
    });
    const s = make(model, "shaft");
    expect(model.connect(end(s, 0), end(s, 1)).status).toBe("accepted");
  });

  it("allows parallel connections, each with its own ID", () => {
    const model = makeModel({
      connectionPolicy: createDefaultConnectionPolicy({ parallel: true }),
    });
    const s1 = make(model, "shaft");
    const s2 = make(model, "shaft");
    expect(model.connect(end(s1), end(s2)).status).toBe("accepted");
    expect(model.connect(end(s1), end(s2)).status).toBe("accepted");
    const ids = model.reader.connections().map((c) => c.id);
    expect(new Set(ids).size).toBe(2);
  });
});

describe("attachment limits", () => {
  function withLimit(limit: number | "unlimited") {
    const model = makeModel();
    model.registry.register({
      type: "bus",
      label: "Bus",
      defaultSize: { width: 1, height: 1 },
      ports: () => [{ direction: "undirected", typeKey: "mechanical", limit }],
    });
    return model;
  }

  it("limit 0 never accepts", () => {
    const model = withLimit(0);
    const bus = make(model, "bus");
    const shaft = make(model, "shaft");
    expect(model.connect(end(bus), end(shaft)).status).toBe("rejected");
  });

  it("finite limit allows exactly that many, unlimited allows many", () => {
    const finite = withLimit(2);
    const bus = make(finite, "bus");
    const results = [0, 1, 2].map(
      () => finite.connect(end(bus), end(make(finite, "shaft"))).status,
    );
    expect(results).toEqual(["accepted", "accepted", "rejected"]);

    const open = withLimit("unlimited");
    const hub = make(open, "bus");
    for (let i = 0; i < 4; i++) {
      expect(open.connect(end(hub), end(make(open, "shaft"))).status).toBe(
        "accepted",
      );
    }
  });

  it("lowering a limit to 0 keeps existing connections", () => {
    const model = makeModel();
    const s1 = make(model, "shaft");
    const s2 = make(model, "shaft");
    model.connect(end(s1), end(s2));
    const port = s1.ports[0];
    if (!port) throw new Error("setup");
    const lowered = model.submit({
      ops: [
        {
          op: "update",
          entity: "port",
          id: port,
          fields: { limit: { old: "unlimited", new: 0 } },
        },
      ],
    });
    expect(lowered.status).toBe("accepted");
    expect(model.reader.connections()).toHaveLength(1);
  });
});
