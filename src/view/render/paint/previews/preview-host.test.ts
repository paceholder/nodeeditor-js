import { describe, expect, it } from "vitest";
import {
  createGeometryScene,
  createRouteRegistry,
  nodeId,
} from "../../../../core/index.js";
import {
  buildModel,
  twoPortNode,
} from "../../../../core/space/scene/scene-fixtures.js";
import { createAssetService } from "../../assets/asset-service.js";
import { createPainterRegistries } from "../../registries/painters.js";
import { DEFAULT_Z_ORDER, EMPTY_VIEW_STATE } from "../scene-layer.js";
import { createHiddenIds, createPreviewHost } from "./preview-host.js";
import type { ToolPreview } from "./preview-types.js";

function setup() {
  const model = buildModel(
    [twoPortNode("a", 0, 0), twoPortNode("b", 200, 0)],
    [["c1", "a", "aR", "b", "bL"]],
  );
  const scene = createGeometryScene(model);
  const hidden = createHiddenIds();
  const counts = { scene: 0, interaction: 0 };
  const host = createPreviewHost({
    interaction: {
      add: () => () => {},
      invalidate: () => void counts.interaction++,
    },
    hidden,
    invalidateScene: () => void counts.scene++,
    bound: () => ({
      reader: model.reader,
      scene,
      routes: createRouteRegistry(),
      painters: createPainterRegistries(),
      zOrder: DEFAULT_Z_ORDER,
      state: EMPTY_VIEW_STATE,
      assets: createAssetService(),
    }),
  });
  return { host, hidden, counts };
}

const resize = (width: number): ToolPreview => ({
  kind: "resize",
  node: nodeId("a"),
  size: { width, height: 20 },
  position: { x: width / 2 - 20, y: 0 },
  fixed: { x: -1, y: -1 },
});

describe("resize preview hides the node from the scene layer", () => {
  it("changes the hidden set only at resize start and end, not per pointer move", () => {
    const { host, hidden, counts } = setup();
    host.set(resize(41));
    expect(counts.scene).toBe(1);
    expect(hidden.isHidden("a")).toBe(true);
    expect(hidden.isHidden("c1")).toBe(true);
    expect(hidden.isHidden("b")).toBe(false);
    for (let w = 42; w < 142; w++) host.set(resize(w));
    expect(counts.scene).toBe(1);
    expect(counts.interaction).toBe(101);
    host.set(null);
    expect(counts.scene).toBe(2);
    expect(hidden.isHidden("a")).toBe(false);
    expect(hidden.isHidden("c1")).toBe(false);
  });
});
