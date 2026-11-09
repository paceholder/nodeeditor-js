import { describe, expect, it } from "vitest";
import { loadSnapshot } from "./load.js";
import { loadedModel } from "./test-kit.js";

const node = (id: string, x: number, width = 40) => ({
  id,
  type: "pipe",
  position: { x, y: 0 },
  size: { width, height: 20 },
  ports: [],
  payload: null,
});

describe("records stay inside the supported world range", () => {
  it("a snapshot with one node at an extreme coordinate fails to load", () => {
    const model = loadedModel();
    const before = model.revision();
    const r = loadSnapshot(model, {
      format: "@paceholder/nodeeditor-js/graph",
      version: 1,
      nodes: [node("n1", 0), node("n2", 100), node("n3", -1.7e308, 1.7e308)],
      connections: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.map((e) => [e.code, e.path])).toEqual([
        ["out-of-range", "nodes[2]"],
      ]);
    }
    expect(model.revision()).toBe(before);
  });

  it("a route constraint outside the world range fails to load", () => {
    const model = loadedModel();
    const r = loadSnapshot(model, {
      format: "@paceholder/nodeeditor-js/graph",
      version: 1,
      nodes: [
        {
          ...node("n1", 0),
          ports: [{ id: "p1", direction: "undirected", typeKey: "k" }],
        },
      ],
      connections: [
        {
          id: "c1",
          from: { node: "n1", port: "p1" },
          to: { node: "n1", port: "p1" },
          route: [{ kind: "segment", orientation: "vertical", at: 5e7 }],
        },
      ],
    });
    expect(!r.ok && r.error.map((e) => e.code)).toEqual(["out-of-range"]);
  });
});
