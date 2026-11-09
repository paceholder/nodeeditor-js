import { describe, expect, it } from "vitest";
import { sampleSnapshot } from "./test-kit.js";
import { validateSnapshot } from "./validate.js";

function errorsOf(input: unknown) {
  const r = validateSnapshot(input);
  if (r.ok) throw new Error("expected validation to fail");
  return r.rejection;
}

describe("reference validation", () => {
  it("reports a duplicate node ID and a dangling connection together, in path order", () => {
    const s = sampleSnapshot();
    const nodes = s.nodes as Record<string, unknown>[];
    nodes[1] = { ...nodes[1], id: "n1", ports: [] };
    (s.connections as Record<string, unknown>[])[0] = {
      id: "c1",
      from: { node: "n1", port: "p2" },
      to: { node: "n9", port: "p9" },
    };
    const errors = errorsOf(s);
    expect(errors.map((e) => [e.code, e.path])).toEqual([
      ["dangling-endpoint", "connections[0].to.node"],
      ["duplicate-id", "nodes[1].id"],
    ]);
    expect(errors[1]?.entities).toEqual(["n1"]);
  });

  it("detects duplicate IDs across entity kinds", () => {
    const s = sampleSnapshot();
    (s.connections as Record<string, unknown>[])[0] = {
      id: "p1",
      from: { node: "n1", port: "p2" },
      to: { node: "n2", port: "p3" },
    };
    expect(errorsOf(s)[0]).toMatchObject({
      code: "duplicate-id",
      path: "connections[0].id",
    });
  });

  it("detects a dangling port and an endpoint port owned by another node", () => {
    const s = sampleSnapshot();
    (s.connections as Record<string, unknown>[])[0] = {
      id: "c1",
      from: { node: "n1", port: "p3" },
      to: { node: "n2", port: "nope" },
    };
    const codes = errorsOf(s).map((e) => [e.code, e.path]);
    expect(codes).toEqual([
      ["port-node-mismatch", "connections[0].from"],
      ["dangling-endpoint", "connections[0].to.port"],
    ]);
  });

  it("does not cascade dangling errors from an entry that failed the shape pass", () => {
    const s = sampleSnapshot();
    (s.nodes as Record<string, unknown>[])[1] = { id: "n2", type: 1 };
    const errors = errorsOf(s);
    expect(errors.every((e) => e.code === "invalid-shape")).toBe(true);
  });

  it("fragments must be self-contained", () => {
    const { idCursor: _omit, ...fragment } = sampleSnapshot();
    (fragment.nodes as unknown[]).pop();
    const r = validateSnapshot(fragment, { fragment: true });
    expect(r.ok).toBe(false);
  });
});
