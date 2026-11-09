import { describe, expect, it } from "vitest";
import { parseFragmentValue } from "../fragment/fragment-text.js";
import { loadDocument } from "./document.js";
import { makeTestModel } from "./test-kit.js";
import { validateSnapshot } from "./validate.js";

const junk = (count: number) =>
  Array.from({ length: count }, () => ({ junk: 1 }));
const graph = (nodes: unknown[]) => ({
  format: "@paceholder/nodeeditor-js/graph",
  version: 1,
  nodes,
  connections: [],
});

describe("error lists are bounded", () => {
  it("100,000 malformed nodes give 100 errors and one saying how many were left out", () => {
    const r = validateSnapshot(graph(junk(100_000)));
    if (r.ok) throw new Error("expected errors");
    expect(r.rejection).toHaveLength(101);
    const last = r.rejection.at(-1);
    expect(last?.code).toBe("limit-exceeded");
    expect(last?.path).toBe("");
    expect(last?.message).toMatch(/^699900 more errors were omitted/);
  });

  it("a host can choose the bound", () => {
    const r = validateSnapshot(graph(junk(3)), { limits: { maxErrors: 4 } });
    expect(!r.ok && r.rejection).toHaveLength(5);
  });

  it("fragments and document selections are bounded too", () => {
    const fragment = parseFragmentValue({
      format: "@paceholder/nodeeditor-js/fragment",
      version: 1,
      fragment: graph(junk(1000)),
      external: junk(1000),
    });
    expect(!fragment.ok && fragment.rejection).toHaveLength(101);
    const model = makeTestModel();
    const selection = Array.from({ length: 1000 }, (_, i) => `n${i + 1}`);
    const doc = loadDocument(
      model,
      JSON.stringify({
        format: "@paceholder/nodeeditor-js/document",
        version: 1,
        graph: graph([]),
        selection,
      }),
    );
    expect(!doc.ok && doc.rejection).toHaveLength(101);
  });
});
