import { describe, expect, it } from "vitest";
import { nodeId } from "../../base/ids/ids.js";
import { createGraphModel } from "../../graph-model.js";
import { mkConn, mkNode } from "./test-helpers.js";
import {
  validateConnectionRecord,
  validateNodeRecord,
} from "./validate-records.js";
import { MAX_WORLD_COORD, MAX_WORLD_SIZE } from "./values.js";

const code = (r: { ok: boolean; rejection?: { code: string } }) =>
  r.ok ? "ok" : r.rejection?.code;

describe("records stay inside the supported world range", () => {
  it("rejects a node position outside the world range", () => {
    for (const position of [
      { x: -1.7e308, y: 0 },
      { x: 0, y: MAX_WORLD_COORD * 2 },
      { x: MAX_WORLD_COORD + 1, y: 0 },
    ]) {
      expect(code(validateNodeRecord(mkNode("n1", { position })))).toBe(
        "out-of-range",
      );
    }
    const edge = { x: -MAX_WORLD_COORD, y: MAX_WORLD_COORD };
    expect(code(validateNodeRecord(mkNode("n1", { position: edge })))).toBe(
      "ok",
    );
  });

  it("rejects a node size larger than the world", () => {
    const huge = { width: 1.7e308, height: 10 };
    expect(code(validateNodeRecord(mkNode("n1", { size: huge })))).toBe(
      "out-of-range",
    );
    const full = { width: MAX_WORLD_SIZE, height: MAX_WORLD_SIZE };
    expect(code(validateNodeRecord(mkNode("n1", { size: full })))).toBe("ok");
  });

  it("rejects a route constraint coordinate outside the world range", () => {
    const route = [
      { kind: "segment", orientation: "vertical", at: 1e300 },
    ] as const;
    const c = { ...mkConn("c1", "n1", "p1", "n2", "p2"), route };
    expect(code(validateConnectionRecord(c))).toBe("out-of-range");
  });

  it("a patch moving a node out of range is rejected", () => {
    const model = createGraphModel();
    model.submit({ ops: [{ op: "add", entity: "node", record: mkNode("a") }] });
    const r = model.submit({
      ops: [
        {
          op: "update",
          entity: "node",
          id: nodeId("a"),
          fields: { position: { old: { x: 0, y: 0 }, new: { x: 2e7, y: 0 } } },
        },
      ],
    });
    expect(r.status === "rejected" && r.rejection.code).toBe("out-of-range");
  });
});
