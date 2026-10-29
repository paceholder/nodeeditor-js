/// <reference types="@vitest/browser-playwright" />
import { describe, expect, it } from "vitest";
import {
  createGeometryRegistry,
  createGeometryScene,
  createImageSymbolGeometry,
  nodeId,
} from "../../../core/index.js";
import {
  buildModel,
  twoPortNode,
} from "../../../core/space/scene/scene-fixtures.js";
import {
  cleanupScope,
  frames,
  makeHost,
  pixelAt,
  until,
} from "../../browser-support.js";
import { mountView } from "../../mount-view.js";
import { createPainterRegistries } from "../registries/painters.js";
import { createImageSymbolPainter } from "./image-symbol-painter.js";
import { createPortGlyphPainter } from "./port-glyph-painter.js";

const cleanup = cleanupScope();

describe("placeholder painter", () => {
  it("unknown type placeholder: visible, with ports, payload unchanged", async () => {
    const model = buildModel([
      twoPortNode("m", 150, 100, { w: 100, h: 60, type: "mystery" }),
    ]);
    const before = JSON.stringify(model.reader.getNode(nodeId("m")));
    const revision = model.revision();
    const scene = createGeometryScene(model);
    cleanup(() => scene.dispose());
    const painters = createPainterRegistries(); // nothing registered for "mystery"
    painters.portGlyphs.replace("k", createPortGlyphPainter());
    const view = mountView(makeHost(300, 200), {
      model,
      painters,
    });
    cleanup(() => view.dispose());
    await frames(5);
    const canvas = view.canvases.scene;
    expect(pixelAt(canvas, 150, 100)[3]).toBeGreaterThan(0); // body filled
    expect(pixelAt(canvas, 110, 80)[3]).toBeGreaterThan(0); // inside the box
    expect(pixelAt(canvas, 150, 40)[3]).toBe(0); // outside
    // Ports still sit on the geometry's anchors.
    const a = scene.node(nodeId("m"))?.anchors[0];
    expect(pixelAt(canvas, a?.position.x ?? 0, a?.position.y ?? 0)[3]).toBe(
      255,
    );
    expect(JSON.stringify(model.reader.getNode(nodeId("m")))).toBe(before);
    expect(model.revision()).toBe(revision);
  });

  it("missing asset placeholder: node keeps geometry and ports, payload unchanged", async () => {
    const model = buildModel([twoPortNode("p", 150, 100, { w: 100, h: 60 })]);
    const before = JSON.stringify(model.reader.getNode(nodeId("p")));
    const geometry = createGeometryRegistry();
    geometry.register("t", createImageSymbolGeometry());
    const scene = createGeometryScene(model, { registry: geometry });
    cleanup(() => scene.dispose());
    const painters = createPainterRegistries();
    painters.nodes.replace(
      "t",
      createImageSymbolPainter({ assetOf: () => "gone" }),
    );
    painters.portGlyphs.replace("k", createPortGlyphPainter());
    const view = mountView(makeHost(300, 200), {
      model,
      geometry,
      painters,
      assets: { resolve: async () => Promise.reject(new Error("404")) },
    });
    cleanup(() => view.dispose());
    await until(() => view.assets.status("gone") === "failed");
    await frames(5);
    const canvas = view.canvases.scene;
    expect(pixelAt(canvas, 150, 100)[3]).toBeGreaterThan(0);
    expect(pixelAt(canvas, 150, 20)[3]).toBe(0);
    const a = scene.node(nodeId("p"))?.anchors[1];
    expect(pixelAt(canvas, a?.position.x ?? 0, a?.position.y ?? 0)[3]).toBe(
      255,
    );
    expect(view.assets.diagnostics()).toEqual([
      { ref: "gone", code: "resolve-failed", message: "404" },
    ]);
    expect(JSON.stringify(model.reader.getNode(nodeId("p")))).toBe(before);
  });
});
