import { describe, expect, it } from "vitest";
import { loadDocument, saveDocument } from "./document.js";
import { loadedModel, makeTestModel } from "./test-kit.js";

const graph = {
  format: "@paceholder/nodeeditor-js/graph",
  version: 1,
  nodes: [
    {
      id: "n1",
      type: "pipe",
      position: { x: 0, y: 0 },
      size: { width: 40, height: 20 },
      ports: [],
      payload: null,
    },
  ],
  connections: [],
};

const load = (extras: Record<string, unknown>) =>
  loadDocument(
    makeTestModel(),
    JSON.stringify({
      format: "@paceholder/nodeeditor-js/document",
      version: 1,
      graph,
      ...extras,
    }),
  );

const paths = (r: ReturnType<typeof load>) =>
  r.ok ? [] : r.error.map((e) => [e.code, e.path]);

describe("document extras are validated as strictly as the graph", () => {
  it("rejects a duplicate selection entry, an unknown viewport key and a tiny zoom", () => {
    const r = load({
      selection: ["n1", "n1"],
      viewport: { x: 0, y: 0, zoom: 1e-300, extra: 1 },
    });
    expect(paths(r)).toEqual([
      ["duplicate-id", "selection[1]"],
      ["invalid-shape", "viewport.extra"],
      ["out-of-range", "viewport.zoom"],
    ]);
  });

  it("rejects a viewport position outside the world range and a huge zoom", () => {
    expect(paths(load({ viewport: { x: 2e7, y: 0, zoom: 1e9 } }))).toEqual([
      ["out-of-range", "viewport.x"],
      ["out-of-range", "viewport.zoom"],
    ]);
  });

  it("accepts a viewport and selection inside the ranges", () => {
    const r = load({ selection: ["n1"], viewport: { x: 5, y: -5, zoom: 0.5 } });
    expect(r.ok && [r.value.selection, r.value.viewport]).toEqual([
      ["n1"],
      { x: 5, y: -5, zoom: 0.5 },
    ]);
  });

  it("saving applies the same checks", () => {
    const r = saveDocument(loadedModel(), {
      viewport: { x: 0, y: 0, zoom: 0 },
    });
    expect(!r.ok && r.error.map((e) => e.path)).toEqual(["viewport.zoom"]);
  });
});
