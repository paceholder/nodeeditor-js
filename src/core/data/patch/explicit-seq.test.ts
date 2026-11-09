import { describe, expect, it } from "vitest";
import { nodeId, portId } from "../../base/ids/ids.js";
import { mkNode } from "../model/test-helpers.js";
import { invertPatch } from "./invert.js";
import { seeded } from "./test-setup.js";

const addNode = (id: string, seq?: number) =>
  ({
    op: "add",
    entity: "node",
    record: mkNode(id),
    ...(seq === undefined ? {} : { seq }),
  }) as const;

describe("explicit insertion sequences are bounded and unique", () => {
  it("rejects a sequence that a live entity of the same kind uses", () => {
    const { reader, apply } = seeded();
    const taken = reader.seqOf(nodeId("n1")) ?? 0;
    const r = apply({ ops: [addNode("n9", taken)] });
    expect(!r.ok && r.error.code).toBe("conflict");
    expect(reader.getNode(nodeId("n9"))).toBeUndefined();
  });

  it("rejects two adds of one kind with the same sequence in one patch", () => {
    const { apply } = seeded();
    const r = apply({ ops: [addNode("n8", 500), addNode("n9", 500)] });
    expect(!r.ok && r.error.code).toBe("conflict");
  });

  it("accepts a sequence another kind uses, and one freed in the same patch", () => {
    const { reader, apply } = seeded();
    const portSeq = reader.seqOf(portId("p1")) ?? 0;
    expect(apply({ ops: [addNode("n8", portSeq)] }).ok).toBe(true);
    const n8 = mkNode("n8");
    const r = apply({
      ops: [
        { op: "remove", entity: "node", record: n8, seq: portSeq },
        addNode("n9", portSeq),
      ],
    });
    expect(r.ok).toBe(true);
    expect(reader.seqOf(nodeId("n9"))).toBe(portSeq);
  });

  it("rejects a sequence above 2^40 and later automatic sequences stay distinct", () => {
    const { reader, apply } = seeded();
    const r = apply({ ops: [addNode("n9", Number.MAX_SAFE_INTEGER)] });
    expect(!r.ok && r.error.code).toBe("malformed-record");
    expect(apply({ ops: [addNode("n9", 2 ** 40)] }).ok).toBe(true);
    apply({ ops: [addNode("na")] });
    apply({ ops: [addNode("nb")] });
    const a = reader.seqOf(nodeId("na")) ?? 0;
    const b = reader.seqOf(nodeId("nb")) ?? 0;
    expect(b).toBeGreaterThan(a);
    expect(a).toBeGreaterThan(2 ** 40);
  });

  it("the inverse of a removal still restores the old sequence", () => {
    const { reader, apply } = seeded();
    const seq = reader.seqOf(nodeId("n1")) ?? 0;
    const lone = apply({ ops: [addNode("n7")] });
    if (!lone.ok) throw new Error("fixture");
    const removed = apply({
      ops: [
        {
          op: "remove",
          entity: "node",
          record: mkNode("n7"),
          seq: reader.seqOf(nodeId("n7")) ?? 0,
        },
      ],
    });
    if (!removed.ok) throw new Error("fixture");
    const restored = apply(invertPatch(removed.value.patch));
    expect(restored.ok).toBe(true);
    expect(reader.seqOf(nodeId("n7"))).toBeGreaterThan(seq);
  });
});
