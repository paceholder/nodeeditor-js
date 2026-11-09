import { describe, expect, it } from "vitest";
import type { ConnectionRecord } from "../../data/model/records.js";
import { createIdAllocator } from "./id-allocator.js";
import { resolveSizeLimits } from "./size-limits.js";
import { end, make, makeModel } from "./test-kit.js";
import { planMoveNodes } from "./transform-nodes.js";

describe("moving nodes looks only at their own connections", () => {
  it("reads the moved nodes' connections, never the whole list, and shifts the pins between them", () => {
    const model = makeModel();
    const a = make(model, "source", 0, 0);
    const b = make(model, "sink", 200, 0);
    const pairs = Array.from({ length: 20 }, (_, i) => [
      make(model, "source", 0, 100 + i * 50),
      make(model, "sink", 200, 100 + i * 50),
    ]);
    const pin = [
      { kind: "segment", orientation: "vertical", at: 100 },
    ] as const;
    for (const [from, to] of [[a, b], ...pairs] as const) {
      model.connect(end(from), end(to));
      const c = model.reader.connections().at(-1) as ConnectionRecord;
      model.submit({
        ops: [
          {
            op: "update",
            entity: "connection",
            id: c.id,
            fields: { route: { new: pin } },
          },
        ],
      });
    }
    let fullScans = 0;
    const reader = {
      ...model.reader,
      connections: () => {
        fullScans += 1;
        return model.reader.connections();
      },
    };
    const planned = planMoveNodes(
      {
        kind: "moveNodes",
        moves: [
          { node: a.node, position: { x: 10, y: 0 } },
          { node: b.node, position: { x: 210, y: 0 } },
        ],
      },
      {
        reader,
        ids: createIdAllocator(model.idGenerator, model.idCursor()),
        registry: model.registry,
        policy: { evaluate: () => ({ kind: "reject" }) } as never,
        sizeLimits: (n) => resolveSizeLimits(n, model.registry),
      },
    );
    expect(fullScans).toBe(0);
    if (planned.kind !== "ready") throw new Error(planned.kind);
    const routeOps = planned.patch.ops.filter(
      (op) => op.entity === "connection",
    );
    expect(routeOps).toHaveLength(1);
    expect(routeOps[0]).toMatchObject({
      fields: { route: { new: [{ at: 110 }] } },
    });
  });
});
