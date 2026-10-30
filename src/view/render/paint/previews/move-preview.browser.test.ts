import { describe, expect, it } from "vitest";
import {
  createGeometryScene,
  type GraphModel,
  nodeId,
} from "../../../../core/index.js";
import {
  buildModel,
  twoPortNode,
} from "../../../../core/space/scene/scene-fixtures.js";
import { cleanupScope, frames, makeHost } from "../../../browser-support.js";
import { createEffectRunner } from "../../../interact/input/effect-runner.js";
import { createSelectionModel } from "../../../interact/selection/selection-model.js";
import { defaultToolSlots } from "../../../interact/tools/default-tools.js";
import {
  capabilityProbe,
  createToolContext,
} from "../../../interact/tools/tool-context.js";
import { createToolRouter } from "../../../interact/tools/tool-router.js";
import {
  NO_MODIFIERS,
  type ToolInput,
} from "../../../interact/tools/tool-types.js";
import { mountView, type ViewHandle } from "../../../mount-view.js";
import { createPainterRegistries } from "../../registries/painters.js";

const cleanup = cleanupScope();

type Painted = { layer: "scene" | "interaction"; id: string };

/** Mount a view and drive the real tools through the view's public surface. */
function setup() {
  const model: GraphModel = buildModel(
    [twoPortNode("a", 100, 100), twoPortNode("b", 400, 100)],
    [["c1", "a", "aR", "b", "bL"]],
  );
  const painted: Painted[] = [];
  const painters = createPainterRegistries();
  let view: ViewHandle | undefined;
  painters.nodes.replace("t", {
    paint(ctx, input) {
      painted.push({
        layer: ctx.canvas === view?.canvases.scene ? "scene" : "interaction",
        id: input.node.id,
      });
    },
  });
  const selection = createSelectionModel();
  selection.bindToModel(model);
  view = mountView(makeHost(800, 600), {
    model,
    painters,
    viewState: { isSelected: selection.isSelected, isHovered: () => false },
  });
  const mounted = view;
  cleanup(() => mounted.dispose());
  const off = selection.on(() => mounted.invalidate("scene"));
  cleanup(off);

  const scene = createGeometryScene(model);
  cleanup(() => scene.dispose());
  const router = createToolRouter(defaultToolSlots());
  const context = createToolContext({
    reader: model.reader,
    scene,
    selection,
    viewport: mounted.viewport.get,
    can: capabilityProbe(model),
  });
  const run = createEffectRunner({
    capture: () => {},
    release: () => {},
    cursor: () => {},
    preview: mounted.setToolPreview,
    commit: (command) => void model.execute(command),
    selection,
    viewport(op) {
      if (op.kind === "panBy") mounted.viewport.panBy(op.dx, op.dy);
      else if (op.kind === "zoomAt")
        mounted.viewport.zoomAt(op.anchor, op.factor);
      else mounted.viewport.set(op.viewport);
    },
  });
  const send = (input: ToolInput): void =>
    run(router.handle(input, context()).effects);
  const pointer = (
    type: "pointer-down" | "pointer-move" | "pointer-up",
    x: number,
    y: number,
  ): void =>
    send({
      type,
      pointerId: 1,
      button: 0,
      viewport: { x, y },
      world: { x, y },
      modifiers: NO_MODIFIERS,
      time: 0,
    });
  return { model, view: mounted, painted, send, pointer };
}

describe("move preview", () => {
  it("pointer moves during a drag repaint only the interaction layer", async () => {
    const { model, view, painted, pointer } = setup();
    await frames();
    pointer("pointer-down", 100, 100);
    pointer("pointer-move", 130, 100);
    await frames(3);
    // Drag start: the scene repainted once without the moved node (D6).
    painted.length = 0;
    view.invalidate("scene");
    await frames(2);
    expect(painted).toEqual([{ layer: "scene", id: "b" }]);

    painted.length = 0;
    const before = view.renderStats().framesPainted;
    for (let i = 1; i <= 10; i++) {
      pointer("pointer-move", 130 + i * 5, 100);
      await frames(2);
    }
    // Only ghosts of the moved node on the interaction layer; scene untouched.
    expect(painted.filter((p) => p.layer === "scene")).toEqual([]);
    expect(painted.filter((p) => p.layer === "interaction")).toHaveLength(10);
    expect(painted.every((p) => p.id === "a")).toBe(true);
    expect(view.renderStats().framesPainted - before).toBeGreaterThanOrEqual(
      10,
    );
    // Nothing reached the model yet.
    expect(model.reader.getNode(nodeId("a"))?.position).toEqual({
      x: 100,
      y: 100,
    });

    painted.length = 0;
    pointer("pointer-up", 180, 100);
    await frames(3);
    // Commit: model updated, ghost cleared, the scene shows the node again.
    expect(model.reader.getNode(nodeId("a"))?.position).toEqual({
      x: 180,
      y: 100,
    });
    expect(painted.some((p) => p.layer === "scene" && p.id === "a")).toBe(true);
    expect(painted.filter((p) => p.layer === "interaction")).toEqual([]);
    expect(view.setToolPreview).toBeTypeOf("function");
  });

  it("cancelling a drag restores the scene layer without changing the model", async () => {
    const { model, view, painted, send, pointer } = setup();
    await frames();
    pointer("pointer-down", 100, 100);
    pointer("pointer-move", 150, 100);
    await frames(3);
    send({ type: "cancel", reason: "escape" });
    painted.length = 0;
    await frames(3);
    expect(painted.some((p) => p.layer === "scene" && p.id === "a")).toBe(true);
    expect(model.reader.getNode(nodeId("a"))?.position).toEqual({
      x: 100,
      y: 100,
    });
    expect(view.disposed).toBe(false);
  });
});
