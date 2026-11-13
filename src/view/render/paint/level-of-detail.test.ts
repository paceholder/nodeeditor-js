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
import { detailLevel, detailPolicy, portsVisible } from "./level-of-detail.js";
import {
  DEFAULT_Z_ORDER,
  EMPTY_VIEW_STATE,
  paintScene,
} from "./scene-layer.js";

describe("level of detail", () => {
  it("thresholds select full, reduced, minimal, overview", () => {
    expect(detailLevel(1, DEFAULT_THEME)).toBe("full");
    expect(detailLevel(0.6, DEFAULT_THEME)).toBe("full");
    expect(detailLevel(0.4, DEFAULT_THEME)).toBe("reduced");
    expect(detailLevel(0.2, DEFAULT_THEME)).toBe("minimal");
    expect(detailLevel(0.15, DEFAULT_THEME)).toBe("minimal");
    expect(detailLevel(0.1, DEFAULT_THEME)).toBe("overview");
    expect(detailLevel(0.01, DEFAULT_THEME)).toBe("overview");
    const noOverview = { ...DEFAULT_THEME, lodOverviewBelow: 0 };
    expect(detailLevel(0.01, noOverview)).toBe("minimal");
  });

  it("selection, diagnostics and endpoints stay on at every level", () => {
    for (const zoom of [1, 0.4, 0.2, 0.1]) {
      const p = detailPolicy(zoom, DEFAULT_THEME);
      expect(p.selection).toBe(true);
      expect(p.diagnostics).toBe(true);
      expect(p.endpoints).toBe(true);
    }
    expect(detailPolicy(0.1, DEFAULT_THEME)).toMatchObject({
      level: "overview",
      title: false,
      secondaryLabels: false,
    });
  });

  it("ports are visible from lodHidePortsBelow up, and always at 0", () => {
    expect(portsVisible(0.25, DEFAULT_THEME)).toBe(true);
    expect(portsVisible(0.24, DEFAULT_THEME)).toBe(false);
    expect(portsVisible(0.001, { lodHidePortsBelow: 0 })).toBe(true);
  });

  it("overview calls no node or connection painter, and ports only at threshold 0", () => {
    const model = buildModel(
      [twoPortNode("a", 0, 0), twoPortNode("b", 100, 0)],
      [["c1", "a", "aR", "b", "bL"]],
    );
    const scene = createGeometryScene(model);
    const painters = createPainterRegistries();
    const called: string[] = [];
    painters.nodes.register("t", { paint: () => void called.push("node") });
    painters.connections.replace("default", {
      paint: () => void called.push("connection"),
    });
    painters.portGlyphs.replace("k", {
      paint: () => void called.push("port"),
    });
    const { ctx, calls } = fakeContext();
    const stats = paintScene(
      ctx,
      {
        reader: model.reader,
        scene,
        painters,
        zOrder: DEFAULT_Z_ORDER,
        state: EMPTY_VIEW_STATE,
        assets: createAssetService(),
      },
      testFrame({ zoom: 0.1, panX: 400, panY: 300 }),
    );
    expect(called).toEqual([]);
    expect(stats).toEqual({ nodes: 2, connections: 1, groups: 0 });
    // One batch per layer: nodes filled and stroked once, connections stroked once.
    expect(calls.filter((c) => c === "fill")).toHaveLength(1);
    expect(calls.filter((c) => c === "stroke")).toHaveLength(2);
    expect(calls.filter((c) => c === "save")).toHaveLength(2);

    // A port threshold of 0 keeps ports at every zoom, through their glyph painter.
    called.length = 0;
    paintScene(
      fakeContext().ctx,
      {
        reader: model.reader,
        scene,
        painters,
        zOrder: DEFAULT_Z_ORDER,
        state: EMPTY_VIEW_STATE,
        assets: createAssetService(),
      },
      testFrame(
        { zoom: 0.1, panX: 400, panY: 300 },
        { ...DEFAULT_THEME, lodHidePortsBelow: 0 },
      ),
    );
    expect(called).toEqual(["port", "port", "port", "port"]);
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
      testFrame({ zoom: 0.2, panX: 400, panY: 300 }),
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
