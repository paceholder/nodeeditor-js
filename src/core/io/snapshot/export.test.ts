import { describe, expect, it } from "vitest";
import { end, make, makeModel } from "../../edit/commands/test-kit.js";
import type { GraphModel } from "../../graph-model.js";
import { exportSnapshot } from "./export.js";
import { validateSnapshot } from "./validate.js";

function buildSession(): GraphModel {
  const model = makeModel();
  const a = make(model, "pipe", 0, 0);
  const b = make(model, "pipe", 100, 0);
  const c = make(model, "shaft", 0, 100);
  model.connect(end(a, 1), end(b, 0));
  model.moveNodes([{ node: c.node, position: { x: 5, y: 120 } }]);
  model.rotateNodes([b.node], 1);
  model.updateNode(a.node, { title: "Inlet", payload: { k: [1, 2] } });
  model.reorderNodes([a.node], "front");
  return model;
}

describe("export", () => {
  it("gives identical JSON for the same edit sequence on two fresh models", () => {
    const one = JSON.stringify(exportSnapshot(buildSession()));
    const two = JSON.stringify(exportSnapshot(buildSession()));
    expect(one).toBe(two);
  });

  it("survives a JSON round trip deeply equal and re-validates", () => {
    const snapshot = exportSnapshot(buildSession());
    const back: unknown = JSON.parse(JSON.stringify(snapshot));
    expect(back).toEqual(snapshot);
    expect(validateSnapshot(back).ok).toBe(true);
  });

  it("lists nodes in paint order, ports in presentation order", () => {
    const model = buildSession();
    const snapshot = exportSnapshot(model);
    expect(snapshot.nodes.map((n) => n.id)).toEqual(
      model.reader.paintOrder().map((n) => n.id),
    );
    for (const node of snapshot.nodes) {
      expect(node.ports.map((p) => p.id)).toEqual(
        model.reader.getNode(node.id as never)?.ports,
      );
    }
  });

  it("omits fields that hold their default and the cursor in fragments", () => {
    const model = makeModel();
    make(model, "pipe");
    const snapshot = exportSnapshot(model);
    const node = snapshot.nodes[0];
    expect(node).not.toHaveProperty("rotation");
    expect(node).not.toHaveProperty("mirrored");
    expect(node).not.toHaveProperty("z");
    expect(snapshot.idCursor).toBeDefined();
    expect(exportSnapshot(model, { fragment: true })).not.toHaveProperty(
      "idCursor",
    );
  });
});

describe("excluded content", () => {
  it("contains committed state only while an edit is queued behind a handler", () => {
    const model = makeModel();
    const a = make(model, "pipe");
    let during: ReturnType<typeof exportSnapshot> | undefined;
    let fired = false;
    model.on("change", () => {
      if (fired) return;
      fired = true;
      model.moveNodes([{ node: a.node, position: { x: 77, y: 77 } }]);
      during = exportSnapshot(model);
    });
    model.updateNode(a.node, { title: "first" });
    expect(during?.nodes[0]?.title).toBe("first");
    expect(during?.nodes[0]?.position).toEqual({ x: 0, y: 0 });
  });

  it("never carries viewport, selection, or view-local keys", () => {
    const keys = Object.keys(exportSnapshot(buildSession())).sort();
    expect(keys).toEqual([
      "connections",
      "format",
      "idCursor",
      "nodes",
      "version",
    ]);
  });
});

describe("export of route", () => {
  it("omits a route that is absent", () => {
    const snapshot = exportSnapshot(buildSession());
    expect(snapshot.connections[0]).not.toHaveProperty("route");
  });
});
