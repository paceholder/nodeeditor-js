import { describe, expect, it } from "vitest";
import { exportSnapshot } from "./export.js";
import { loadedModel, sampleSnapshot } from "./test-kit.js";
import { validateSnapshot } from "./validate.js";

describe("composed validator", () => {
  it("never throws on hostile input", () => {
    const hostile: unknown[] = [
      {
        format: "nodeeditor-js/graph",
        version: 1,
        nodes: null,
        connections: 5,
      },
      {
        format: "nodeeditor-js/graph",
        version: 1,
        nodes: [null, 1, "x", []],
        connections: [[]],
      },
      JSON.parse(
        '{"format":"nodeeditor-js/graph","version":1,"nodes":[{"__proto__":1}],"connections":[]}',
      ),
      Object.create(null),
      () => 1,
    ];
    for (const input of hostile) {
      expect(() => validateSnapshot(input)).not.toThrow();
      expect(validateSnapshot(input).ok).toBe(false);
    }
  });

  it("returns the typed, normalized snapshot for valid input", () => {
    const r = validateSnapshot(sampleSnapshot());
    expect(r.ok && r.value.nodes.map((n) => n.id)).toEqual(["n1", "n2"]);
    expect(r.ok && r.value.idCursor).toEqual({ c: 1, n: 2, p: 3 });
  });

  it("accepts what export produces", () => {
    const model = loadedModel();
    expect(validateSnapshot(exportSnapshot(model)).ok).toBe(true);
  });

  it("reports shape, reference and limit errors in one run", () => {
    const s = sampleSnapshot();
    (s.nodes as Record<string, unknown>[])[0] = { id: "n1" };
    s.groups = [1];
    const r = validateSnapshot(s);
    expect(!r.ok && r.error.map((e) => e.code)).toEqual(
      expect.arrayContaining(["invalid-shape", "unsupported-section"]),
    );
  });
});
