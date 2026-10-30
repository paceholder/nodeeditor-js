/// <reference types="@vitest/browser-playwright" />
import { describe, expect, it } from "vitest";
import { nodeId } from "../../../core/index.js";
import {
  buildModel,
  twoPortNode,
} from "../../../core/space/scene/scene-fixtures.js";
import {
  cleanupScope,
  frames,
  makeHost,
  pixelAt,
} from "../../browser-support.js";
import { mountView } from "../../mount-view.js";
import { DEFAULT_THEME } from "../theme/tokens.js";

const cleanup = cleanupScope();

/** Largest per-channel difference between a pixel and a `#rrggbb` colour. */
function distance(
  pixel: readonly [number, number, number, number],
  color: string,
): number {
  const n = Number.parseInt(color.slice(1), 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return Math.max(...rgb.map((c, i) => Math.abs(c - (pixel[i] ?? 0))));
}

describe("LAY-04 overview level", () => {
  it("LAY-04, PERF-06 overview keeps what matters: selection and error badge drawn, port glyphs not, all visible entities counted", async () => {
    // 200 x 100 nodes; at zoom 0.1 each is 20 x 10 CSS px. World origin at (300, 200).
    const big = { w: 200, h: 100 };
    const model = buildModel(
      [
        twoPortNode("sel", -1500, -1000, big),
        twoPortNode("err", 1500, -1000, big),
        twoPortNode("a", -1500, 1000, big),
        twoPortNode("b", 1500, 1000, big),
        twoPortNode("plain", 0, 0, big),
      ],
      [["csel", "a", "aR", "b", "bL"]],
    );
    const r = model.submit({
      ops: [
        {
          op: "update",
          entity: "node",
          id: nodeId("err"),
          fields: { status: { new: "error" } },
        },
      ],
    });
    expect(r.status).toBe("accepted");
    const view = mountView(makeHost(600, 400), {
      model,
      initialViewport: { zoom: 0.1, panX: 300, panY: 200 },
    });
    cleanup(() => view.dispose());
    view.selection.replace(["n:sel", "c:csel"]);
    await frames();
    const scene = view.canvases.scene;

    // Selected node: outline 3 px outside its right edge (x 150 + 10).
    expect(distance(pixelAt(scene, 163, 100), DEFAULT_THEME.selection)).toBe(0);
    // Selected connection, halfway between a and b.
    expect(distance(pixelAt(scene, 300, 300), DEFAULT_THEME.selection)).toBe(0);
    // Error badge on the top-right corner of "err" (450 + 10, 100 - 5).
    expect(distance(pixelAt(scene, 460, 95), DEFAULT_THEME.error)).toBe(0);
    // No port glyph on the right anchor of "plain" (310, 200).
    expect(
      distance(pixelAt(scene, 310, 200), DEFAULT_THEME.portFill),
    ).toBeGreaterThan(40);
    // An unselected node body still shows its fill.
    expect(distance(pixelAt(scene, 300, 200), DEFAULT_THEME.nodeFill)).toBe(0);

    const stats = view.renderStats();
    expect(stats.nodes).toEqual({ painted: 5, culled: 0 });
    expect(stats.paths).toEqual({ painted: 1, culled: 0 });
  });
});
