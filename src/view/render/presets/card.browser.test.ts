/// <reference types="@vitest/browser-playwright" />
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkNode, mkPort } from "../../../core/data/model/test-helpers.js";
import {
  createCardGeometry,
  createGeometryRegistry,
  createGeometryScene,
  createGraphModel,
  nodeId,
  portId,
} from "../../../core/index.js";
import {
  cleanupScope,
  frames,
  makeHost,
  pixelAt,
} from "../../browser-support.js";
import { mountView } from "../../mount-view.js";
import { createPainterRegistries } from "../registries/painters.js";
import { createCardPainter } from "./card-painter.js";
import { createPortGlyphPainter } from "./port-glyph-painter.js";

const cleanup = cleanupScope();
afterEach(() => vi.restoreAllMocks());

function setup(zoom = 1) {
  const model = createGraphModel();
  const ports = [
    mkPort("in1", "card", { direction: "input", label: "in A" }),
    mkPort("in2", "card", { direction: "input", label: "in B" }),
    mkPort("out", "card", { direction: "output", label: "result" }),
  ];
  const r = model.submit({
    ops: [
      {
        op: "add",
        entity: "node",
        record: mkNode("card", {
          type: "card",
          position: { x: 150, y: 100 },
          size: { width: 160, height: 90 },
          title: "Adder",
          payload: { subtitle: "sum" },
          ports: ports.map((p) => p.id),
        }),
      },
      ...ports.map((record) => ({
        op: "add" as const,
        entity: "port" as const,
        record,
      })),
    ],
  });
  expect(r.status).toBe("accepted");
  const geometry = createGeometryRegistry();
  geometry.register("card", createCardGeometry());
  const scene = createGeometryScene(model, { registry: geometry });
  cleanup(() => scene.dispose());
  const painters = createPainterRegistries();
  painters.nodes.replace("card", createCardPainter());
  painters.portGlyphs.replace("k", createPortGlyphPainter());
  const view = mountView(makeHost(300, 200), {
    model,
    geometry,
    painters,
    initialViewport: { zoom, panX: 150 * (1 - zoom), panY: 100 * (1 - zoom) },
  });
  cleanup(() => view.dispose());
  return { view, scene, model };
}

describe("card preset", () => {
  it("card with labeled ports: title and labels painted, ports pickable", async () => {
    const texts: string[] = [];
    const real = CanvasRenderingContext2D.prototype.fillText;
    vi.spyOn(CanvasRenderingContext2D.prototype, "fillText").mockImplementation(
      function (this: CanvasRenderingContext2D, ...args) {
        texts.push(args[0]);
        return real.apply(this, args);
      },
    );
    const { view, scene } = setup();
    await frames(5);
    expect(texts).toEqual(
      expect.arrayContaining(["Adder", "sum", "in A", "in B", "result"]),
    );
    // Title bar is drawn (opaque) and the body below it too.
    expect(pixelAt(view.canvases.scene, 150, 62)[3]).toBe(255);
    expect(pixelAt(view.canvases.scene, 150, 130)[3]).toBe(255);

    const box = view.element.getBoundingClientRect();
    const anchors = scene.node(nodeId("card"))?.anchors ?? [];
    expect(anchors).toHaveLength(3);
    for (const a of anchors) {
      const hits = view.pick(box.left + a.position.x, box.top + a.position.y);
      expect(hits[0]).toMatchObject({ kind: "port", portId: a.portId });
    }
    expect(anchors.map((a) => a.portId)).toEqual(
      ["in1", "in2", "out"].map(portId),
    );
  });

  it("port labels and the secondary label hide at reduced detail, the title stays", async () => {
    const texts: string[] = [];
    const real = CanvasRenderingContext2D.prototype.fillText;
    vi.spyOn(CanvasRenderingContext2D.prototype, "fillText").mockImplementation(
      function (this: CanvasRenderingContext2D, ...args) {
        texts.push(args[0]);
        return real.apply(this, args);
      },
    );
    setup(0.4);
    await frames(5);
    expect(texts).toContain("Adder");
    expect(texts).not.toContain("in A");
    expect(texts).not.toContain("sum");
  });
});
