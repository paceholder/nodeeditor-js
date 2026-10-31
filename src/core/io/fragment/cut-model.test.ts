import { describe, expect, it } from "vitest";
import { extractFragment } from "./extract.js";
import { end, make, makeModel } from "./test-kit.js";

describe("EDT-06 / EDT-02 cut as copy plus atomic delete", () => {
  it("Cut is one history entry; one undo restores the original IDs", () => {
    const model = makeModel();
    const a = make(model, "pipe", 0, 0);
    const b = make(model, "pipe", 100, 0);
    model.connect(end(a, 1), end(b, 0));
    const before = model.reader.state();
    const nodes = [a.node, b.node];
    expect(model.can({ kind: "deleteEntities", nodes }).available).toBe(true);
    const copied = extractFragment(model.reader, { nodes });
    expect(copied.ok).toBe(true);
    const undoBefore = model.historyState().undoLabel;
    let entries = 0;
    model.on("change", () => {
      entries += 1;
    });
    expect(model.execute({ kind: "deleteEntities", nodes }).status).toBe(
      "accepted",
    );
    expect(entries).toBe(1);
    expect(model.historyState().undoLabel).toBe("Delete");
    expect(model.reader.nodes()).toHaveLength(0);
    expect(
      copied.ok && copied.value.fragment.fragment.connections,
    ).toHaveLength(1);
    model.undo();
    expect(model.historyState().undoLabel).toBe(undoBefore);
    expect(model.reader.nodes().map((n) => n.id)).toEqual(
      before.nodes.map((n) => n.id),
    );
    expect(model.reader.connections()).toEqual(before.connections);
  });

  it("Cut of a protected node: delete is unavailable before any extraction", () => {
    const model = makeModel({
      capabilityPolicy: {
        decide: (action) => (action === "delete" ? false : undefined),
      },
    });
    const a = make(model, "pipe");
    const can = model.can({ kind: "deleteEntities", nodes: [a.node] });
    expect(can.available).toBe(false);
    if (!can.available) expect(can.reason.code).toBe("capability-denied");
    expect(model.reader.nodes()).toHaveLength(1);
  });
});
