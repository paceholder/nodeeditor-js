import { describe, expect, it } from "vitest";
import { end, make, makeModel } from "./test-kit.js";

describe("NOD-05 model side", () => {
  it("title, status and payload updates keep the ID and connections", () => {
    const model = makeModel();
    const a = make(model, "source");
    const b = make(model, "sink");
    model.connect(end(a), end(b));
    const result = model.updateNode(a.node, {
      title: "Renamed",
      status: "warning",
      payload: { k: [1, 2] },
    });
    expect(result.status).toBe("accepted");
    const node = model.reader.getNode(a.node);
    expect(node).toMatchObject({
      id: a.node,
      title: "Renamed",
      status: "warning",
      payload: { k: [1, 2] },
    });
    expect(model.reader.connectionsOfNode(a.node)).toHaveLength(1);
    model.updateNode(a.node, { title: "Again" });
    expect(model.reader.getNode(a.node)?.title).toBe("Again");
    model.undo();
    expect(model.reader.getNode(a.node)?.title).toBe("Renamed");
    expect(model.updateNode("x" as never, { title: "t" }).status).toBe(
      "rejected",
    );
  });

  it("an update that changes nothing is an empty accepted edit", () => {
    const model = makeModel();
    const a = make(model, "source");
    const before = model.historyState();
    expect(model.updateNode(a.node, {}).status).toBe("accepted");
    expect(model.historyState().undoLabel).toBe(before.undoLabel);
  });
});
