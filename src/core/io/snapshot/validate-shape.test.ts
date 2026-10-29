import { describe, expect, it } from "vitest";
import { sampleSnapshot } from "./test-kit.js";
import { validateSnapshot } from "./validate.js";

function errorsOf(input: unknown, options = {}) {
  const r = validateSnapshot(input, options);
  if (r.ok) throw new Error("expected validation to fail");
  return r.error;
}

function withNode(patch: Record<string, unknown>): Record<string, unknown> {
  const s = sampleSnapshot();
  const nodes = s.nodes as Record<string, unknown>[];
  nodes[0] = { ...nodes[0], ...patch };
  return s;
}

describe("shape validation", () => {
  it("returns the typed snapshot for valid input and never mutates it", () => {
    const input = sampleSnapshot();
    const before = JSON.stringify(input);
    const r = validateSnapshot(input);
    expect(r.ok).toBe(true);
    expect(JSON.stringify(input)).toBe(before);
  });

  it.each([null, 42, "x", [], undefined])("never throws on %s", (bad) => {
    const e = errorsOf(bad);
    expect(e[0]?.code).toBe("invalid-shape");
  });

  it("rejects a wrong format tag and a future version without guessing", () => {
    expect(errorsOf({ ...sampleSnapshot(), format: "other" })[0]?.code).toBe(
      "unsupported-format",
    );
    const v = errorsOf({ ...sampleSnapshot(), version: 2 });
    expect(v).toHaveLength(1);
    expect(v[0]?.code).toBe("unsupported-version");
  });

  it("every error carries code, message, JSON path and IDs", () => {
    const errors = errorsOf(
      withNode({ position: { x: Number.NaN, y: 0 }, id: "n 1" }),
    );
    for (const e of errors) {
      expect(e.code).toBeTruthy();
      expect(e.message).toBeTruthy();
      expect(typeof e.path).toBe("string");
      expect(Array.isArray(e.entities)).toBe(true);
    }
  });

  it("reports non-finite coordinates and bad rotation with the entry path", () => {
    const nan = errorsOf(withNode({ position: { x: Number.NaN, y: 0 } }));
    expect(nan).toEqual([
      expect.objectContaining({
        code: "non-finite",
        path: "nodes[0]",
        entities: ["n1"],
      }),
    ]);
    const rot = errorsOf(withNode({ rotation: 7 }));
    expect(rot[0]?.code).toBe("malformed-record");
  });

  it("collects every error, not just the first, in path order", () => {
    const s = withNode({ type: 5, size: "big" });
    (s.connections as unknown[])[0] = { id: "c1", from: 1 };
    const errors = errorsOf(s);
    expect(errors.map((e) => e.path)).toEqual(
      [
        "connections[0].from",
        "connections[0].to",
        "nodes[0].size",
        "nodes[0].type",
      ].sort((a, b) => a.localeCompare(b)),
    );
    expect(errors.every((e) => e.code === "invalid-shape")).toBe(true);
  });

  it("rejects unknown fields instead of dropping them", () => {
    const e = errorsOf(withNode({ extra: 1 }));
    expect(e[0]).toMatchObject({
      code: "invalid-shape",
      path: "nodes[0].extra",
    });
  });

  it("flags a malformed ID and an invalid port limit", () => {
    expect(
      errorsOf(withNode({ id: "has space" })).some(
        (e) => e.code === "malformed-id",
      ),
    ).toBe(true);
    const s = withNode({
      ports: [{ id: "p1", direction: "input", typeKey: "k", limit: -1 }],
    });
    expect(errorsOf(s)[0]?.code).toBe("invalid-limit");
  });

  it("flags non-JSON payloads with the field path", () => {
    const e = errorsOf(withNode({ payload: { when: new Date(), ok: 1 } }));
    expect(e[0]).toMatchObject({
      code: "non-json-payload",
      path: "nodes[0].payload.when",
      entities: ["n1"],
    });
    expect(errorsOf(withNode({ payload: undefined }))[0]?.code).toBe(
      "non-json-payload",
    );
  });

  it("enforces size limits", () => {
    expect(
      errorsOf(sampleSnapshot(), { limits: { maxNodes: 1 } })[0]?.code,
    ).toBe("limit-exceeded");
    expect(
      errorsOf(sampleSnapshot(), { limits: { maxConnections: 0 } })[0]?.code,
    ).toBe("limit-exceeded");
    expect(
      errorsOf(sampleSnapshot(), { limits: { maxPortsPerNode: 1 } })[0],
    ).toMatchObject({ code: "limit-exceeded", path: "nodes[0].ports" });
    let deep: unknown = 1;
    for (let i = 0; i < 20; i += 1) deep = { d: deep };
    const e = errorsOf(withNode({ payload: deep }), {
      limits: { maxPayloadDepth: 5 },
    });
    expect(e[0]?.code).toBe("limit-exceeded");
  });

  it("rejects a non-empty reserved section but accepts an empty one", () => {
    expect(validateSnapshot({ ...sampleSnapshot(), groups: [] }).ok).toBe(true);
    const e = errorsOf({ ...sampleSnapshot(), groups: [{ id: "g1" }] });
    expect(e[0]).toMatchObject({ code: "unsupported-section", path: "groups" });
  });

  it("treats a fragment as a snapshot without an ID cursor", () => {
    const { idCursor: _omit, ...fragment } = sampleSnapshot();
    expect(validateSnapshot(fragment, { fragment: true }).ok).toBe(true);
    expect(errorsOf(sampleSnapshot(), { fragment: true })[0]?.path).toBe(
      "idCursor",
    );
  });
});
