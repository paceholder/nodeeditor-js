import { describe, expect, it } from "vitest";
import { nodeId } from "../../base/ids/ids.js";
import { MisuseError } from "../../base/result.js";
import { mkConn, mkNode, mkPort } from "../model/test-helpers.js";
import { invertPatch } from "./invert.js";
import type { Patch } from "./types.js";

const patch: Patch = {
  ops: [
    { op: "add", entity: "node", record: mkNode("n1"), seq: 4 },
    { op: "add", entity: "port", record: mkPort("p1", "n1"), seq: 7 },
    {
      op: "update",
      entity: "node",
      id: nodeId("n1"),
      fields: {
        position: { old: { x: 0, y: 0 }, new: { x: 1, y: 1 } },
        title: { new: "A" },
        status: { old: "x" },
      },
    },
    {
      op: "remove",
      entity: "connection",
      record: mkConn("c1", "n1", "p1", "n1", "p1"),
      seq: 9,
    },
  ],
};

describe("PAT-03 inverse construction", () => {
  it("inverting twice yields the original patch", () => {
    expect(invertPatch(invertPatch(patch))).toEqual(patch);
  });

  it("reverses order and carries seq on add and remove", () => {
    const inv = invertPatch(patch);
    expect(inv.ops.map((o) => `${o.op}:${o.entity}`)).toEqual([
      "add:connection",
      "update:node",
      "remove:port",
      "remove:node",
    ]);
    expect(inv.ops[0]).toMatchObject({ seq: 9 });
    expect(inv.ops[2]).toMatchObject({ seq: 7 });
    expect(inv.ops[3]).toMatchObject({ seq: 4 });
  });

  it("swaps old and new, keeping absent keys absent", () => {
    const update = invertPatch(patch).ops[1];
    expect(update).toMatchObject({
      fields: {
        position: { old: { x: 1, y: 1 }, new: { x: 0, y: 0 } },
        title: { old: "A" },
        status: { new: "x" },
      },
    });
    expect(JSON.stringify(update)).not.toContain("undefined");
  });

  it("never carries the ID cursor", () => {
    const inv = invertPatch({ ...patch, idCursor: { n: 5 } });
    expect("idCursor" in inv).toBe(false);
  });

  it("refuses to invert an add that has no seq", () => {
    expect(() =>
      invertPatch({
        ops: [{ op: "add", entity: "node", record: mkNode("n1") }],
      }),
    ).toThrow(MisuseError);
  });
});
