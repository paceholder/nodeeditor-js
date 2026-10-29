import { describe, expect, it } from "vitest";
import { createGraphModel } from "../../graph-model.js";
import { mkNode } from "../model/test-helpers.js";
import { findUnknownTypes } from "./diagnostics.js";
import { createNodeTypeRegistry } from "./registry.js";

describe("unknown node types", () => {
  it("keeps the node and payload across edits and reports unknown-type", () => {
    const model = createGraphModel();
    const registry = createNodeTypeRegistry();
    registry.register({
      type: "known",
      label: "K",
      defaultSize: { width: 1, height: 1 },
    });
    const payload = { custom: [1, 2, { deep: true }] };
    const ghost = mkNode("n1", { type: "ghost", payload });
    model.submit({ ops: [{ op: "add", entity: "node", record: ghost }] });
    model.submit({
      ops: [
        { op: "add", entity: "node", record: mkNode("n2", { type: "known" }) },
      ],
    });

    const move = model.submit({
      ops: [
        {
          op: "update",
          entity: "node",
          id: ghost.id,
          fields: { position: { old: { x: 0, y: 0 }, new: { x: 5, y: 5 } } },
        },
      ],
    });
    expect(move.status).toBe("accepted");
    expect(model.reader.getNode(ghost.id)?.payload).toEqual(payload);
    expect(findUnknownTypes(model.reader, registry)).toEqual([
      { code: "unknown-type", node: ghost.id, type: "ghost" },
    ]);
  });
});
