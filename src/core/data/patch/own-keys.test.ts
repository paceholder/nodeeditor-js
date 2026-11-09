import { describe, expect, it } from "vitest";
import { nodeId } from "../../base/ids/ids.js";
import { mkNode } from "../model/test-helpers.js";
import { seeded } from "./test-setup.js";
import type { Patch } from "./types.js";

const addNode = (id: string) =>
  ({ op: "add", entity: "node", record: mkNode(id) }) as const;

describe("update fields are the record's own fields", () => {
  it("rejects __proto__ parsed from JSON as an update field", () => {
    const { reader, apply } = seeded();
    const fields = JSON.parse('{"__proto__":{"old":{},"new":{"title":"x"}}}');
    const r = apply({
      ops: [{ op: "update", entity: "node", id: nodeId("n1"), fields }],
    });
    expect(!r.ok && r.error.code).toBe("malformed-record");
    const node = reader.getNode(nodeId("n1"));
    expect(Object.getPrototypeOf(node)).toBe(Object.prototype);
    expect(node?.title).toBeUndefined();
  });

  it("rejects other inherited names such as constructor and toString", () => {
    const { apply } = seeded();
    for (const key of ["constructor", "toString", "hasOwnProperty"]) {
      const fields = { [key]: { new: 1 } } as never;
      const r = apply({
        ops: [{ op: "update", entity: "node", id: nodeId("n1"), fields }],
      });
      expect(!r.ok && r.error.code).toBe("malformed-record");
    }
  });

  it("rejects a patch ID cursor with a __proto__ key", () => {
    const { apply } = seeded();
    const idCursor = JSON.parse('{"__proto__":{"n":5}}');
    const r = apply({ ops: [addNode("n3")], idCursor });
    expect(!r.ok && r.error.code).toBe("malformed-record");
  });

  it("rejects a patch ID cursor whose values are not safe integers or text", () => {
    const { reader, apply } = seeded();
    const bad: unknown[] = [
      [],
      null,
      { n: Number.NaN },
      { n: {} },
      { n: 1e300 },
    ];
    for (const idCursor of bad) {
      const r = apply({ ops: [addNode("n3")], idCursor } as unknown as Patch);
      expect(!r.ok && r.error.code).toBe("malformed-record");
    }
    expect(reader.getNode(nodeId("n3"))).toBeUndefined();
  });

  it("accepts a cursor of safe integers and text", () => {
    const { apply } = seeded();
    const r = apply({ ops: [addNode("n3")], idCursor: { n: 3, x: "abc" } });
    expect(r.ok).toBe(true);
  });
});
