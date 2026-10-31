import { describe, expect, it } from "vitest";
import { createNodeTypeRegistry } from "../../data/node-types/registry.js";
import { createGraphModel, type GraphModelOptions } from "../../graph-model.js";
import { exportSnapshot } from "../../io/snapshot/export.js";
import { loadSnapshot } from "../../io/snapshot/load.js";
import { createGeometryScene } from "../../space/scene/geometry-scene.js";

const SIZE = { width: 40, height: 20 };

/** A model whose `tank` type opted in to resizing, with a 20 x 10 minimum. */
function tankModel(options: GraphModelOptions = {}) {
  const registry = createNodeTypeRegistry();
  registry.register({
    type: "tank",
    label: "Tank",
    defaultSize: SIZE,
    capabilities: { resize: true },
    sizeLimits: { min: { width: 20, height: 10 } },
    ports: () => [
      { direction: "undirected", typeKey: "k", placement: { x: 1, y: 0.5 } },
      { direction: "undirected", typeKey: "k", placement: { x: 0, y: 0.5 } },
    ],
  });
  const model = createGraphModel({ ...options, registry });
  model.createNode("tank", { x: 0, y: 0 });
  model.createNode("tank", { x: 200, y: 0 });
  const [a, b] = model.reader.nodes();
  if (!a || !b) throw new Error("nodes missing");
  return { model, a, b };
}

describe("resizing through the model", () => {
  it("one resize is one history entry and one undo restores size and position", () => {
    const { model, a } = tankModel();
    const changes: number[] = [];
    model.on("change", (e) => changes.push(e.patch.ops.length));
    const result = model.resizeNode(
      a.id,
      { width: 80, height: 40 },
      { x: -1, y: -1 },
    );
    expect(result.status).toBe("accepted");
    expect(changes).toEqual([1]);
    expect(model.historyState().undoLabel).toBe("Resize");
    expect(model.reader.getNode(a.id)).toMatchObject({
      size: { width: 80, height: 40 },
      position: { x: 20, y: 10 },
    });
    expect(model.undo().status).toBe("accepted");
    expect(model.reader.getNode(a.id)).toEqual(a);
  });

  it("an incident connection's endpoint follows the moved anchor in the scene", () => {
    const { model, a, b } = tankModel();
    const [right] = a.ports;
    const [, left] = b.ports;
    if (!right || !left) throw new Error("ports missing");
    model.connect({ node: a.id, port: right }, { node: b.id, port: left });
    const conn = model.reader.connections()[0];
    if (!conn) throw new Error("no connection");
    const scene = createGeometryScene(model);
    const startOf = () => scene.connection(conn.id)?.path?.p0;
    expect(startOf()).toEqual({ x: 20, y: 0 });
    // Left edge fixed: the right edge, and its port, move 30 to the right.
    model.resizeNode(a.id, { width: 100, height: 20 }, { x: -1, y: 0 });
    expect(startOf()).toEqual({ x: 80, y: 0 });
  });

  it("a denied resize capability and read-only mode reject with the size unchanged", () => {
    const { model, a } = tankModel();
    model.submit({
      ops: [
        {
          op: "update",
          entity: "node",
          id: a.id,
          fields: { capabilities: { new: { resize: false } } },
        },
      ],
    });
    const denied = model.resizeNode(a.id, { width: 80, height: 40 });
    expect(denied.status === "rejected" && denied.error.code).toBe(
      "capability-denied",
    );
    expect(model.reader.getNode(a.id)?.size).toEqual(SIZE);

    // Read-only mode: the same document loaded into a read-only model.
    const viewOnly = createGraphModel({
      readOnly: true,
      registry: model.registry,
    });
    expect(loadSnapshot(viewOnly, exportSnapshot(model)).ok).toBe(true);
    const refused = viewOnly.resizeNode(a.id, { width: 80, height: 40 });
    expect(refused.status === "rejected" && refused.error.code).toBe(
      "capability-denied",
    );
    expect(viewOnly.reader.getNode(a.id)?.size).toEqual(SIZE);
  });

  it("Load keeps sizes outside new limits, and undo restores the stored size", () => {
    const { model, a } = tankModel();
    const snapshot = exportSnapshot(model);
    const tiny = { width: 5, height: 4 };
    const stored = {
      ...snapshot,
      nodes: snapshot.nodes.map((n) =>
        n.id === a.id ? { ...n, size: tiny } : n,
      ),
    };
    const fresh = tankModel();
    const loaded = loadSnapshot(fresh.model, stored);
    expect(loaded.ok).toBe(true);
    expect(fresh.model.reader.getNode(a.id)?.size).toEqual(tiny);
    expect(fresh.model.resizeNode(a.id, { width: 30, height: 15 }).status).toBe(
      "accepted",
    );
    expect(fresh.model.undo().status).toBe("accepted");
    expect(fresh.model.reader.getNode(a.id)?.size).toEqual(tiny);
  });
});
