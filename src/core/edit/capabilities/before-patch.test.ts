import { describe, expect, it } from "vitest";
import { nodeId } from "../../base/ids/ids.js";
import { mkNode } from "../../data/model/test-helpers.js";
import { createNodeTypeRegistry } from "../../data/node-types/registry.js";
import type { PatchOp } from "../../data/patch/types.js";
import { createGraphModel } from "../../graph-model.js";

const size = { width: 10, height: 10 };
const moveA = (from = { x: 0, y: 0 }) =>
  ({ position: { old: from, new: { x: 5, y: 5 } } }) as const;

function model() {
  const registry = createNodeTypeRegistry();
  registry.register({
    type: "locked",
    label: "Locked",
    defaultSize: size,
    ports: () => [],
    capabilities: { edit: false, move: false },
  });
  registry.register({
    type: "free",
    label: "Free",
    defaultSize: size,
    ports: () => [],
  });
  const m = createGraphModel({ registry });
  m.submit({
    ops: [
      { op: "add", entity: "node", record: mkNode("a", { type: "locked" }) },
      {
        op: "add",
        entity: "node",
        record: mkNode("b", { type: "free", capabilities: { move: false } }),
      },
    ],
  });
  return m;
}

const update = (id: string, fields: object): PatchOp =>
  ({ op: "update", entity: "node", id: nodeId(id), fields }) as PatchOp;

describe("capabilities are judged before the patch", () => {
  it("changing to an unlocked type in the same operation does not unlock a move", () => {
    const m = model();
    const r = m.submit({
      ops: [update("a", { type: { old: "locked", new: "free" }, ...moveA() })],
    });
    expect(r.status === "rejected" && r.rejection.code).toBe(
      "capability-denied",
    );
    expect(m.reader.getNode(nodeId("a"))?.type).toBe("locked");
  });

  it("clearing an override in another operation does not unlock a move", () => {
    const m = model();
    const split = m.submit({
      ops: [
        update("b", { capabilities: { old: { move: false } } }),
        update("b", moveA()),
      ],
    });
    expect(split.status === "rejected" && split.rejection.code).toBe(
      "capability-denied",
    );
    const joined = m.submit({
      ops: [
        update("b", { capabilities: { old: { move: false } }, ...moveA() }),
      ],
    });
    expect(joined.status === "rejected" && joined.rejection.code).toBe(
      "capability-denied",
    );
  });

  it("a lock that a patch adds does not judge that same patch", () => {
    const m = model();
    const r = m.submit({
      ops: [
        update("b", {
          capabilities: { old: { move: false }, new: { resize: false } },
        }),
      ],
    });
    expect(r.status).toBe("accepted");
    expect(m.submit({ ops: [update("b", moveA())] }).status).toBe("accepted");
  });

  it("plan and can agree with commit", () => {
    const m = model();
    expect(
      m.can({
        kind: "moveNodes",
        moves: [{ node: nodeId("a"), position: { x: 1, y: 1 } }],
      }).available,
    ).toBe(false);
  });
});
