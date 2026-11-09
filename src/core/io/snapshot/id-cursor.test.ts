import { describe, expect, it } from "vitest";
import { loadDocument } from "./document.js";
import { loadSnapshot } from "./load.js";
import { makeTestModel } from "./test-kit.js";

const node = (id: string) => ({
  id,
  type: "pipe",
  position: { x: 0, y: 0 },
  size: { width: 4, height: 4 },
  ports: [],
  payload: null,
});
const graph = (nodes: unknown[], idCursor?: unknown) => ({
  format: "@paceholder/nodeeditor-js/graph",
  version: 1,
  ...(idCursor === undefined ? {} : { idCursor }),
  nodes,
  connections: [],
});

const created = (model: ReturnType<typeof makeTestModel>): string => {
  const r = model.execute({
    kind: "createNode",
    type: "pipe",
    position: { x: 0, y: 0 },
  });
  if (r.status !== "accepted") throw new Error(`create ${r.status}`);
  return r.changed.nodes[0] ?? "";
};

describe("ID counters never wrap or reset", () => {
  it("after loading an ID at the largest safe integer, creates get fresh IDs", () => {
    const model = makeTestModel();
    const big = `n${Number.MAX_SAFE_INTEGER}`;
    expect(loadSnapshot(model, graph([node(big)])).ok).toBe(true);
    const first = created(model);
    const second = created(model);
    expect(new Set([big, first, second]).size).toBe(3);
  });

  it("a cursor value that is not a safe integer fails to load", () => {
    const model = makeTestModel();
    const r = loadSnapshot(model, graph([node("n5")], { n: 1e300 }));
    expect(!r.ok && r.error.map((e) => e.path)).toEqual(["idCursor.n"]);
  });
});

describe("ID cursor keys are checked, not dropped", () => {
  it("a __proto__ key in a snapshot cursor is an error at its path", () => {
    const model = makeTestModel();
    const text = `{"format":"@paceholder/nodeeditor-js/document","version":1,"graph":{"format":"@paceholder/nodeeditor-js/graph","version":1,"idCursor":{"__proto__":5},"nodes":[],"connections":[]}}`;
    const r = loadDocument(model, text);
    expect(!r.ok && r.error.map((e) => e.path)).toEqual([
      "graph.idCursor.__proto__",
    ]);
  });
});
