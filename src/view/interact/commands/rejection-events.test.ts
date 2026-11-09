import { describe, expect, it } from "vitest";
import {
  createGraphModel,
  type ExecuteResult,
  nodeId,
  type Rejection,
  rejectionOf,
} from "../../../core/index.js";
import {
  graphOps,
  twoPortNode,
} from "../../../core/space/scene/scene-fixtures.js";
import { observeConnectionRejections } from "./rejection-events.js";

function setup() {
  const model = createGraphModel();
  model.submit(
    { ops: graphOps([twoPortNode("a", 0, 0), twoPortNode("b", 100, 0)], []) },
    { history: "skip" },
  );
  const seen: Rejection[] = [];
  const observed = observeConnectionRejections(model, (r) => seen.push(r));
  return { model, observed, seen };
}

const port = (node: string, p: string) => ({
  node: nodeId(node),
  port: p as never,
});

describe("connection refusals are reported, never changed", () => {
  it("a refused connect is reported once and the result is the model's own", () => {
    const { model, observed, seen } = setup();
    const result = observed.execute({
      kind: "connect",
      from: port("a", "aR"),
      to: port("a", "aL"),
    });
    expect(result.status).toBe("rejected");
    expect(seen).toHaveLength(1);
    expect(seen[0]?.code).toBe("self-loop");
    expect(model.reader.connections()).toHaveLength(0);
  });

  it("an accepted connect and commands that cannot connect report nothing", () => {
    const { observed, seen } = setup();
    const ok = observed.execute({
      kind: "connect",
      from: port("a", "aR"),
      to: port("b", "bL"),
    });
    expect(ok.status).toBe("accepted");
    const refused = observed.execute({
      kind: "moveNodes",
      moves: [{ node: nodeId("zzz"), position: { x: 1, y: 1 } }],
    });
    expect(refused.status).toBe("rejected");
    expect(seen).toEqual([]);
  });

  it("an unverified paste is reported as pending validation with the ports it lacks", () => {
    const { observed, seen } = setup();
    const fake: ExecuteResult = {
      status: "unverified",
      reason: "Waiting for the host",
      missing: [
        { from: port("a", "aR"), to: port("b", "bL"), kind: "default" },
      ],
    };
    const wrapped = observeConnectionRejections(
      Object.assign(Object.create(observed), { execute: () => fake }),
      (r) => seen.push(r),
    );
    wrapped.execute({ kind: "duplicate", nodes: [], connections: [] } as never);
    expect(seen).toEqual([
      rejectionOf("pending-validation", "Waiting for the host", ["aR", "bL"]),
    ]);
  });

  it("a refused undo is reported only when the policy caused it", () => {
    const { observed, seen } = setup();
    // Nothing to undo: a history refusal, not a connection one.
    expect(observed.undo().status).toBe("rejected");
    expect(seen).toEqual([]);
  });
});
