import { describe, expect, it, vi } from "vitest";
import {
  createGeometryRegistry,
  createImageSymbolGeometry,
  createRouteRegistry,
  nodeId,
} from "../../core/index.js";
import {
  buildModel,
  twoPortNode,
} from "../../core/space/scene/scene-fixtures.js";
import type { LayerName } from "./frame-scheduler.js";
import { bindModel } from "./model-binding.js";

function setup() {
  const model = buildModel([
    twoPortNode("a", 50, 50),
    twoPortNode("b", 200, 50),
  ]);
  const markDirty = vi.fn<(...layers: LayerName[]) => void>();
  const geometry = createGeometryRegistry();
  const binding = bindModel(model, {
    geometry,
    routes: createRouteRegistry(),
    zOrder: ["connection", "node", "port"],
    markDirty,
  });
  return { model, markDirty, geometry, binding };
}

describe("model binding", () => {
  it("status decoration update: scene repaints, geometry is not recomputed", () => {
    const { model, markDirty, binding } = setup();
    const before = binding.scene.stats();
    expect(model.updateNode(nodeId("a"), { status: "error" }).status).toBe(
      "accepted",
    );
    expect(model.updateNode(nodeId("a"), { title: "Renamed" }).status).toBe(
      "accepted",
    );
    expect(markDirty).toHaveBeenCalledTimes(2);
    expect(markDirty).toHaveBeenCalledWith("scene");
    expect(binding.scene.stats()).toEqual(before);
    // The cached record is current, so the next paint shows the new status.
    expect(binding.scene.node(nodeId("a"))?.record.status).toBe("error");
  });

  it("geometry edit: only the touched node is recomputed, scene dirtied", () => {
    const { model, markDirty, binding } = setup();
    const before = binding.scene.stats().nodeRebuilds;
    model.moveNodes([{ node: nodeId("a"), position: { x: 90, y: 50 } }]);
    expect(markDirty).toHaveBeenCalledWith("scene");
    expect(binding.scene.stats().nodeRebuilds).toBe(before + 1);
  });

  it("rejected edit changes nothing and dirties nothing", () => {
    const { model, markDirty } = setup();
    expect(model.updateNode(nodeId("zz"), { title: "x" }).status).toBe(
      "rejected",
    );
    expect(markDirty).not.toHaveBeenCalled();
  });

  it("geometry registered later dirties the scene", () => {
    const { geometry, markDirty } = setup();
    geometry.replace("t", createImageSymbolGeometry());
    expect(markDirty).toHaveBeenCalledWith("scene");
  });

  it("dispose unsubscribes and is idempotent", () => {
    const { model, markDirty, binding } = setup();
    binding.dispose();
    binding.dispose();
    model.updateNode(nodeId("a"), { status: "warning" });
    expect(markDirty).not.toHaveBeenCalled();
  });
});
