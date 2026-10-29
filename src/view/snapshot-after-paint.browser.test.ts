import { describe, expect, it } from "vitest";
import {
  checkJson,
  createGeometryRegistry,
  createImageSymbolGeometry,
  exportSnapshot,
  jsonEqual,
  nodeId,
} from "../core/index.js";
import { buildModel, twoPortNode } from "../core/space/scene/scene-fixtures.js";
import {
  cleanupScope,
  frames,
  makeHost,
  solidSvg,
  until,
} from "./browser-support.js";
import { mountView } from "./mount-view.js";
import { createImageSymbolPainter } from "./render/presets/image-symbol-painter.js";
import { createPainterRegistries } from "./render/registries/painters.js";

const cleanup = cleanupScope();

describe("snapshot after painting", () => {
  it("REN-02 snapshot after painting with assets is JSON-compatible and holds asset references only", async () => {
    const model = buildModel([twoPortNode("a", 100, 75, { w: 80, h: 40 })]);
    model.updateNode(nodeId("a"), { payload: { asset: "sym" } });
    const before = exportSnapshot(model);

    const geometry = createGeometryRegistry();
    geometry.register("t", createImageSymbolGeometry());
    const painters = createPainterRegistries();
    painters.nodes.replace("t", createImageSymbolPainter());
    const view = mountView(makeHost(220, 150), {
      model,
      geometry,
      painters,
      assets: {
        resolve: async () => ({
          kind: "svg",
          text: solidSvg(80, 40, "#00ff00"),
        }),
      },
    });
    cleanup(() => view.dispose());
    await until(() => view.assets.stats().rasterizations >= 1);
    await frames(4);
    expect(view.assets.status("sym")).toBe("ready");

    const after = exportSnapshot(model);
    expect(checkJson(after, "snapshot")).toBeUndefined();
    expect(jsonEqual(after, before)).toBe(true);
    const text = JSON.stringify(after);
    expect(text).toContain('"asset":"sym"');
    expect(text).not.toMatch(/blob:|data:image|ImageBitmap|<svg/);
  });
});
