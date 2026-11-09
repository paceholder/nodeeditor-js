import { describe, expect, it } from "vitest";
import { nodeId, portId } from "../../base/ids/ids.js";
import { createGraphModel } from "../../graph-model.js";
import { mkConn, mkNode, mkPort } from "./test-helpers.js";
import {
  validateConnectionRecord,
  validateNodeRecord,
  validatePortRecord,
} from "./validate-records.js";

describe("stored records are the model's own copies", () => {
  it("validation returns a copy with only the known fields", () => {
    const input = {
      ...mkNode("n1", { ports: [portId("p1")], capabilities: { move: false } }),
      extra: 1,
    };
    const checked = validateNodeRecord(input);
    if (!checked.ok) throw new Error("expected ok");
    const out = checked.value;
    expect(out).not.toBe(input);
    expect(Object.keys(out)).not.toContain("extra");
    expect(out.position).not.toBe(input.position);
    expect(out.size).not.toBe(input.size);
    expect(out.ports).not.toBe(input.ports);
    expect(out.capabilities).not.toBe(input.capabilities);
    expect(out).toEqual(
      mkNode("n1", { ports: [portId("p1")], capabilities: { move: false } }),
    );
  });

  it("ports and connections are copied too", () => {
    const p = {
      ...mkPort("p1", "n1", {
        placement: { x: 0, y: 1, normal: { x: 0, y: 1 } },
      }),
      extra: 2,
    };
    const pc = validatePortRecord(p);
    if (!pc.ok) throw new Error("expected ok");
    expect(Object.keys(pc.value)).not.toContain("extra");
    expect(pc.value.placement).not.toBe(p.placement);
    expect(pc.value.placement?.normal).not.toBe(p.placement?.normal);
    const c = {
      ...mkConn("c1", "n1", "p1", "n2", "p2"),
      route: [{ kind: "segment", orientation: "vertical", at: 3 }] as const,
      extra: 3,
    };
    const cc = validateConnectionRecord(c);
    if (!cc.ok) throw new Error("expected ok");
    expect(Object.keys(cc.value)).not.toContain("extra");
    expect(cc.value.from).not.toBe(c.from);
    expect(cc.value.route).not.toBe(c.route);
    expect(cc.value.route?.[0]).not.toBe(c.route[0]);
  });

  it("rejects a title, status or capability override of the wrong type", () => {
    expect(validateNodeRecord({ ...mkNode("n1"), title: 5 }).ok).toBe(false);
    expect(validateNodeRecord({ ...mkNode("n1"), status: {} }).ok).toBe(false);
    expect(
      validateNodeRecord({ ...mkNode("n1"), capabilities: { fly: true } }).ok,
    ).toBe(false);
    expect(validatePortRecord({ ...mkPort("p1", "n1"), label: [] }).ok).toBe(
      false,
    );
  });

  it("a caller mutating its record after submit changes nothing in the model", () => {
    const model = createGraphModel({ freezeRecords: false });
    const changes: unknown[] = [];
    model.on("change", (e) => changes.push(e));
    const record = { ...mkNode("a"), extra: 1 } as ReturnType<typeof mkNode>;
    expect(
      model.submit({ ops: [{ op: "add", entity: "node", record }] }).status,
    ).toBe("accepted");
    const mutable = record as { title?: string; position: { x: number } };
    mutable.title = "mutated";
    mutable.position.x = 99;
    const stored = model.reader.getNode(nodeId("a"));
    expect(stored?.title).toBeUndefined();
    expect(stored?.position.x).toBe(0);
    expect(Object.keys(stored ?? {})).not.toContain("extra");
    expect(changes).toHaveLength(1);
  });

  it("freezing the stored record does not freeze the caller's value objects", () => {
    const model = createGraphModel();
    const record = mkNode("a");
    model.submit({ ops: [{ op: "add", entity: "node", record }] });
    expect(Object.isFrozen(record)).toBe(false);
    expect(Object.isFrozen(record.position)).toBe(false);
    expect(Object.isFrozen(model.reader.getNode(nodeId("a")))).toBe(true);
  });
});
