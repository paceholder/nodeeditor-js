import { describe, expect, it } from "vitest";
import { createGeometryScene, nodeId } from "../../../core/index.js";
import {
  buildModel,
  twoPortNode,
} from "../../../core/space/scene/scene-fixtures.js";
import { fakeContext, testFrame } from "../../test-support.js";
import { createAssetService } from "../assets/asset-service.js";
import type { NodePaintInput } from "../registries/painter-types.js";
import { createPainterRegistries } from "../registries/painters.js";
import { DEFAULT_THEME } from "../theme/tokens.js";
import { detailLevel, detailPolicy } from "./level-of-detail.js";
import { DEFAULT_Z_ORDER, paintScene } from "./scene-layer.js";

describe("level of detail", () => {
  it("thresholds select full, reduced, minimal", () => {
    expect(detailLevel(1, DEFAULT_THEME)).toBe("full");
    expect(detailLevel(0.6, DEFAULT_THEME)).toBe("full");
    expect(detailLevel(0.4, DEFAULT_THEME)).toBe("reduced");
    expect(detailLevel(0.1, DEFAULT_THEME)).toBe("minimal");
  });

  it("zoomed far out: labels hidden, selection and error badges still requested", () => {
    const model = buildModel([
      twoPortNode("a", 0, 0),
      twoPortNode("b", 100, 0),
    ]);
    const r = model.submit({
      ops: [
        {
          op: "update",
          entity: "node",
          id: nodeId("b"),
          fields: { status: { new: "error" } },
        },
      ],
    });
    expect(r.status).toBe("accepted");
    const scene = createGeometryScene(model);
    const painters = createPainterRegistries();
    const inputs: NodePaintInput[] = [];
    painters.nodes.register("t", { paint: (_c, i) => void inputs.push(i) });
    const { ctx, calls } = fakeContext();
    paintScene(
      ctx,
      {
        reader: model.reader,
        scene,
        painters,
        zOrder: DEFAULT_Z_ORDER,
        state: { isSelected: (id) => id === "a", isHovered: () => false },
        assets: createAssetService(),
      },
      testFrame({ zoom: 0.1, panX: 400, panY: 300 }),
    );
    expect(inputs).toHaveLength(2);
    for (const i of inputs) {
      expect(i.detail.level).toBe("minimal");
      expect(i.detail.title).toBe(false);
      expect(i.detail.secondaryLabels).toBe(false);
    }
    // Selection outline for "a" (selection colour stroke) and a badge arc for "b".
    expect(calls).toContain(`strokeStyle=${DEFAULT_THEME.selection}`);
    expect(calls).toContain(`fillStyle=${DEFAULT_THEME.error}`);
    expect(detailPolicy(0.01, DEFAULT_THEME).selection).toBe(true);
    expect(detailPolicy(0.01, DEFAULT_THEME).diagnostics).toBe(true);
  });
});
