import { describe, expect, it } from "vitest";
import { connectionId, nodeId, portId } from "../../base/ids/ids.js";
import type { ConnectionRecord, NodeRecord, PortRecord } from "./records.js";
import {
  checkConnectionEndpoints,
  checkPortOwnership,
  validateConnectionRecord,
  validateNodeRecord,
  validatePortRecord,
} from "./validate-records.js";

const node = (over: Record<string, unknown> = {}): unknown => ({
  id: "n1",
  type: "t",
  position: { x: 0, y: 0 },
  size: { width: 10, height: 10 },
  rotation: 0,
  mirrored: false,
  z: 0,
  ports: ["p1"],
  payload: null,
  ...over,
});
const port = (over: Record<string, unknown> = {}): unknown => ({
  id: "p1",
  node: "n1",
  direction: "input",
  typeKey: "k",
  limit: 1,
  ...over,
});
const code = (r: { ok: boolean; rejection?: { code: string } }) =>
  r.ok ? "ok" : r.rejection?.code;

describe("structural validation", () => {
  it("accepts well-formed records", () => {
    expect(validateNodeRecord(node()).ok).toBe(true);
    expect(validatePortRecord(port({ limit: "unlimited" })).ok).toBe(true);
    expect(
      validateConnectionRecord({
        id: "c1",
        kind: "default",
        from: { node: "n1", port: "p1" },
        to: { node: "n2", port: "p2" },
      }).ok,
    ).toBe(true);
  });

  it("rejects NaN and Infinity positions and sizes with non-finite", () => {
    expect(
      code(validateNodeRecord(node({ position: { x: Number.NaN, y: 0 } }))),
    ).toBe("non-finite");
    expect(
      code(
        validateNodeRecord(
          node({ position: { x: 0, y: Number.POSITIVE_INFINITY } }),
        ),
      ),
    ).toBe("non-finite");
    expect(
      code(
        validateNodeRecord(node({ size: { width: Number.NaN, height: 1 } })),
      ),
    ).toBe("non-finite");
    expect(
      code(validateNodeRecord(node({ size: { width: 1, height: -1 } }))),
    ).toBe("non-finite");
    expect(code(validateNodeRecord(node({ z: Number.NaN })))).toBe(
      "non-finite",
    );
  });

  it("rejects negative or fractional limits with invalid-limit", () => {
    expect(code(validatePortRecord(port({ limit: -1 })))).toBe("invalid-limit");
    expect(code(validatePortRecord(port({ limit: 1.5 })))).toBe(
      "invalid-limit",
    );
    expect(code(validatePortRecord(port({ limit: Number.NaN })))).toBe(
      "invalid-limit",
    );
  });

  it("rejects malformed IDs", () => {
    expect(code(validateNodeRecord(node({ id: "" })))).toBe("malformed-id");
    expect(code(validateNodeRecord(node({ ports: ["a b"] })))).toBe(
      "malformed-id",
    );
    expect(code(validatePortRecord(port({ node: " " })))).toBe("malformed-id");
  });

  it("rejects duplicate port IDs in a node", () => {
    expect(code(validateNodeRecord(node({ ports: ["p1", "p1"] })))).toBe(
      "duplicate-id",
    );
  });

  it("rejects a port whose node disagrees with its owner", () => {
    const owner = node() as NodeRecord;
    expect(checkPortOwnership(port() as PortRecord, owner).ok).toBe(true);
    const wrongNode = port({ node: "n2" }) as PortRecord;
    expect(code(checkPortOwnership(wrongNode, owner))).toBe(
      "port-node-mismatch",
    );
    const unlisted = port({ id: "p9" }) as PortRecord;
    expect(code(checkPortOwnership(unlisted, owner))).toBe(
      "port-node-mismatch",
    );
  });

  it("reports dangling endpoints naming the missing port", () => {
    const n = node() as NodeRecord;
    const p = port() as PortRecord;
    const lookup = {
      getNode: (id: string) => (id === n.id ? n : undefined),
      getPort: (id: string) => (id === p.id ? p : undefined),
    };
    const conn: ConnectionRecord = {
      id: connectionId("c1"),
      kind: "default",
      from: { node: nodeId("n1"), port: portId("p1") },
      to: { node: nodeId("n1"), port: portId("p404") },
    };
    const r = checkConnectionEndpoints(conn, lookup);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.rejection.code).toBe("dangling-endpoint");
      expect(r.rejection.entities).toContain("p404");
    }
    const bad = { ...conn, to: { node: nodeId("n2"), port: portId("p1") } };
    expect(code(checkConnectionEndpoints(bad, lookup))).toBe(
      "dangling-endpoint",
    );
  });
});

describe("never throws", () => {
  const inputs: unknown[] = [
    null,
    undefined,
    0,
    "x",
    [],
    {},
    { id: 5 },
    { id: "n1", position: null },
    { id: "n1", type: "t", position: { x: 0, y: 0 }, size: null },
    Symbol("s"),
    () => 1,
    { id: "p1", node: "n1", direction: 3 },
    { id: "c1", kind: "k", from: null, to: 7 },
  ];
  it("returns a failed Result for arbitrary input", () => {
    for (const input of inputs) {
      expect(validateNodeRecord(input).ok).toBe(false);
      expect(validatePortRecord(input).ok).toBe(false);
      expect(validateConnectionRecord(input).ok).toBe(false);
    }
  });
});

describe("structural versus application validity", () => {
  it("does not judge application rules such as type keys", () => {
    expect(validatePortRecord(port({ typeKey: "" })).ok).toBe(true);
  });
});
