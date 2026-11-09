import { describe, expect, it } from "vitest";
import { connectionId } from "../../base/ids/ids.js";
import { mkConn } from "../../data/model/test-helpers.js";
import { validateConnectionRecord } from "../../data/model/validate-records.js";
import { loadedModel } from "./test-kit.js";
import { validateSnapshot } from "./validate.js";

const pins = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    kind: "segment" as const,
    orientation: i % 2 === 0 ? ("vertical" as const) : ("horizontal" as const),
    at: i,
  }));

const snapshotWithRoute = (route: unknown) => ({
  format: "@paceholder/nodeeditor-js/graph",
  version: 1,
  nodes: [
    {
      id: "n1",
      type: "pipe",
      position: { x: 0, y: 0 },
      size: { width: 40, height: 20 },
      ports: [
        { id: "p1", direction: "undirected", typeKey: "k" },
        { id: "p2", direction: "undirected", typeKey: "k" },
      ],
      payload: null,
    },
  ],
  connections: [
    {
      id: "c1",
      from: { node: "n1", port: "p1" },
      to: { node: "n1", port: "p2" },
      route,
    },
  ],
});

describe("route constraints are bounded", () => {
  it("record validation accepts 256 constraints and rejects 257", () => {
    const base = mkConn("c1", "n1", "p1", "n2", "p2");
    expect(validateConnectionRecord({ ...base, route: pins(256) }).ok).toBe(
      true,
    );
    const r = validateConnectionRecord({ ...base, route: pins(257) });
    expect(!r.ok && r.error.code).toBe("limit-exceeded");
  });

  it("a snapshot route with a million pins fails fast at the route path", () => {
    const input = snapshotWithRoute(pins(1_000_000));
    const started = Date.now();
    const r = validateSnapshot(input);
    expect(Date.now() - started).toBeLessThan(100);
    expect(!r.ok && r.error.map((e) => [e.code, e.path])).toEqual([
      ["limit-exceeded", "connections[0].route"],
    ]);
  });

  it("a host can lower the snapshot limit", () => {
    const r = validateSnapshot(snapshotWithRoute(pins(5)), {
      limits: { maxRouteConstraints: 4 },
    });
    expect(!r.ok && r.error.map((e) => e.code)).toEqual(["limit-exceeded"]);
    expect(validateSnapshot(snapshotWithRoute(pins(4))).ok).toBe(true);
  });

  it("a patch setting 257 constraints is rejected", () => {
    const model = loadedModel();
    const id = connectionId("c1");
    const current = model.reader.getConnection(id);
    const r = model.submit({
      ops: [
        {
          op: "update",
          entity: "connection",
          id,
          fields: {
            route: current?.route
              ? { old: current.route, new: pins(257) }
              : { new: pins(257) },
          },
        },
      ],
    });
    expect(r.status === "rejected" && r.error.code).toBe("limit-exceeded");
  });
});
