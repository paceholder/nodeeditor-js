import { describe, expect, it } from "vitest";
import {
  createGeometryScene,
  createGraphModel,
  createNodeTypeRegistry,
  type NodeId,
} from "../../../../core/index.js";
import { createPaintFrame, setMatrix } from "../../primitives/frame.js";
import { DEFAULT_THEME } from "../../theme/tokens.js";
import type { ToolPreview } from "./preview-types.js";
import { createResizeHandlePainter } from "./resize-handle-painter.js";

const SIZE = { width: 40, height: 20 };

function setup() {
  const registry = createNodeTypeRegistry();
  registry.register({
    type: "tank",
    label: "Tank",
    defaultSize: SIZE,
    capabilities: { resize: true },
  });
  registry.register({ type: "plain", label: "Plain", defaultSize: SIZE });
  const model = createGraphModel({ registry });
  model.createNode("tank", { x: 100, y: 100 });
  model.createNode("plain", { x: 200, y: 100 });
  const [tank, plain] = model.reader.nodes().map((n) => n.id);
  if (!tank || !plain) throw new Error("nodes missing");
  const scene = createGeometryScene(model);
  let target: NodeId | undefined;
  let preview: ToolPreview | null = null;
  const painter = createResizeHandlePainter({
    scene,
    target: () => target,
    resizable: (id) =>
      model.can({
        kind: "resizeNode",
        node: id,
        size: { width: 41, height: 20 },
      }).available,
    preview: () => preview,
  });
  const canvas = document.createElement("canvas");
  canvas.width = 300;
  canvas.height = 200;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  const frame = createPaintFrame(
    { width: 300, height: 200, dpr: 1 },
    { zoom: 1, panX: 0, panY: 0 },
    DEFAULT_THEME,
  );
  /** Paint once on a cleared canvas; alpha at a CSS pixel. */
  const paintAndRead = (x: number, y: number): number => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, 300, 200);
    setMatrix(ctx, frame.worldToDevice);
    painter.paint(ctx, frame);
    return ctx.getImageData(x, y, 1, 1).data[3] ?? 0;
  };
  return {
    tank,
    plain,
    paintAndRead,
    select: (id: NodeId | undefined) => {
      target = id;
    },
    setPreview: (p: ToolPreview | null) => {
      preview = p;
    },
  };
}

describe("resize handle painter", () => {
  it("paints the handle for one selected opted-in node, inside its bottom-right corner", () => {
    const h = setup();
    expect(h.paintAndRead(117, 107)).toBe(0);
    h.select(h.tank);
    // Body corner at (120, 110); the 8 px square spans (112..120, 102..110).
    expect(h.paintAndRead(117, 107)).toBeGreaterThan(0);
    expect(h.paintAndRead(110, 107)).toBe(0);
    expect(h.paintAndRead(122, 107)).toBe(0);
  });

  it("follows the preview frame during a resize and hides during a move", () => {
    const h = setup();
    h.select(h.tank);
    h.setPreview({
      kind: "resize",
      node: h.tank,
      size: { width: 80, height: 40 },
      position: { x: 120, y: 110 },
      fixed: { x: -1, y: -1 },
    });
    // New corner at (160, 130).
    expect(h.paintAndRead(157, 127)).toBeGreaterThan(0);
    expect(h.paintAndRead(117, 107)).toBe(0);
    h.setPreview({
      kind: "move",
      offset: { x: 30, y: 0 },
      moving: [h.tank],
      locked: [],
    });
    expect(h.paintAndRead(117, 107)).toBe(0);
    expect(h.paintAndRead(147, 107)).toBe(0);
  });

  it("paints nothing for a node of a type that did not opt in", () => {
    const h = setup();
    h.select(h.plain);
    expect(h.paintAndRead(217, 107)).toBe(0);
  });
});
