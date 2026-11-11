import { describe, expect, it } from "vitest";
import { nodeId } from "../../base/ids/ids.js";
import {
  diffOk as diffSnapshot,
  loadedModel,
  nodesOf,
  portsOf,
  target,
} from "./test-kit.js";

describe("diff details", () => {
  it("turns port order and z differences into node field updates", () => {
    const model = loadedModel();
    const patch = diffSnapshot(
      model.reader,
      target((s) => {
        const n = nodesOf(s);
        const ports = [...portsOf(n[0])].reverse();
        n[0] = { ...n[0], ports, z: 4 };
      }),
    );
    expect(patch.ops).toHaveLength(1);
    const op = patch.ops[0];
    expect(
      op?.op === "update" &&
        op.entity === "node" &&
        Object.keys(op.fields).sort(),
    ).toEqual(["ports", "z"]);
    expect(model.submit(patch).status).toBe("accepted");
    expect(model.reader.getNode(nodeId("n1"))?.ports).toEqual(["p2", "p1"]);
    expect(model.reader.paintOrder().at(-1)?.id).toBe("n1");
  });

  it("updates a changed endpoint in place, keeping the connection ID", () => {
    const model = loadedModel();
    const seq = model.reader.seqOf("c1" as never);
    const patch = diffSnapshot(
      model.reader,
      target((s) => {
        (s.connections as Record<string, unknown>[])[0] = {
          id: "c1",
          from: { node: "n1", port: "p1" },
          to: { node: "n2", port: "p3" },
        };
      }),
    );
    expect(patch.ops).toEqual([
      {
        op: "update",
        entity: "connection",
        id: "c1",
        fields: {
          from: {
            old: { node: "n1", port: "p2" },
            new: { node: "n1", port: "p1" },
          },
        },
      },
    ]);
    expect(model.submit(patch).status).toBe("accepted");
    expect(model.reader.seqOf("c1" as never)).toBe(seq);
  });

  it("handles removing the port a connection used, in one atomic patch", () => {
    const model = loadedModel();
    const patch = diffSnapshot(
      model.reader,
      target((s) => {
        const n = nodesOf(s);
        n[0] = { ...n[0], ports: [portsOf(n[0])[0]] };
        s.connections = [];
      }),
    );
    expect(model.submit(patch).status).toBe("accepted");
    expect(model.reader.ports().map((p) => p.id)).toEqual(["p1", "p3"]);
  });
});

describe("diffSnapshot route", () => {
  it("emits a route update with old and new values", () => {
    const model = loadedModel();
    const route = [{ kind: "segment", orientation: "vertical", at: 7 }];
    const patch = diffSnapshot(
      model.reader,
      target((s) => {
        const c = s.connections as Record<string, unknown>[];
        c[0] = { ...c[0], route };
      }),
    );
    expect(patch.ops).toEqual([
      {
        op: "update",
        entity: "connection",
        id: "c1",
        fields: { route: { new: route } },
      },
    ]);
  });
});
