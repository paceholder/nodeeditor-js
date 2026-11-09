import { describe, expect, it } from "vitest";
import { makeModel } from "../../edit/commands/test-kit.js";
import { parseFragmentValue } from "./fragment-text.js";

const node = (id: string, port: string, x = 0) => ({
  id,
  type: "pipe",
  position: { x, y: 0 },
  size: { width: 40, height: 20 },
  ports: [
    { id: port, direction: "undirected", typeKey: "hydraulic" },
    { id: `${port}b`, direction: "undirected", typeKey: "hydraulic" },
  ],
  payload: null,
});

const envelope = (
  external: unknown[],
  nodes = [node("n1", "p1"), node("n2", "p2", 100)],
) => ({
  format: "@paceholder/nodeeditor-js/fragment",
  version: 1,
  fragment: {
    format: "@paceholder/nodeeditor-js/graph",
    version: 1,
    nodes,
    connections: [],
  },
  external,
});

const ext = (from: [string, string], to: [string, string]) => ({
  id: "c9",
  from: { node: from[0], port: from[1] },
  to: { node: to[0], port: to[1] },
});

const errors = (value: unknown) => {
  const r = parseFragmentValue(value);
  return r.ok ? [] : r.error.map((e) => [e.code, e.path]);
};

describe("fragment external entries have exactly one inside end", () => {
  it("accepts an entry with one end inside and one outside", () => {
    expect(errors(envelope([ext(["n1", "p1"], ["n7", "p7"])]))).toEqual([]);
  });

  it("rejects an entry with both ends inside the fragment", () => {
    expect(errors(envelope([ext(["n1", "p1"], ["n2", "p2"])]))).toEqual([
      ["invalid-shape", "external[0]"],
    ]);
  });

  it("rejects an entry with no end inside the fragment", () => {
    expect(errors(envelope([ext(["n7", "p7"], ["n8", "p8"])]))).toEqual([
      ["invalid-shape", "external[0]"],
    ]);
  });

  it("rejects an inside end whose port belongs to another fragment node", () => {
    expect(errors(envelope([ext(["n1", "p2"], ["n7", "p7"])]))).toEqual([
      ["port-node-mismatch", "external[0].from"],
    ]);
  });

  it("a paste that would place a node outside the world range is rejected", () => {
    const model = makeModel();
    const far = envelope([], [node("n1", "p1", 9e6)]);
    const planned = model.plan({
      kind: "paste",
      fragment: far,
      placement: { kind: "offset", by: { x: 5e6, y: 0 } },
    });
    expect(planned.kind === "rejected" && planned.error.code).toBe(
      "out-of-range",
    );
    expect(model.reader.nodes()).toHaveLength(0);
  });
});
