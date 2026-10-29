import { describe, expect, it } from "vitest";
import { nodeId } from "../../base/ids/ids.js";
import { mkConn, mkNode, mkPort } from "../model/test-helpers.js";
import type { Patch } from "./types.js";

describe("PAT-01 plain data", () => {
  it("a patch survives JSON stringify and parse unchanged", () => {
    const patch: Patch = {
      idCursor: { n: 2, p: 1, c: 1 },
      ops: [
        { op: "add", entity: "node", record: mkNode("n1"), seq: 1 },
        { op: "add", entity: "port", record: mkPort("p1", "n1"), seq: 1 },
        {
          op: "add",
          entity: "connection",
          record: mkConn("c1", "n1", "p1", "n1", "p1"),
        },
        {
          op: "update",
          entity: "node",
          id: nodeId("n1"),
          fields: {
            position: { old: { x: 0, y: 0 }, new: { x: 40, y: 20 } },
            title: { new: "A" },
          },
        },
        { op: "remove", entity: "node", record: mkNode("n2"), seq: 2 },
      ],
    };
    expect(JSON.parse(JSON.stringify(patch))).toEqual(patch);
  });

  it("PAT-01 a move is one update with old and new position", () => {
    const op: Patch["ops"][number] = {
      op: "update",
      entity: "node",
      id: nodeId("n1"),
      fields: { position: { old: { x: 0, y: 0 }, new: { x: 40, y: 20 } } },
    };
    expect(JSON.parse(JSON.stringify(op))).toEqual(op);
  });
});
