/**
 * Scene-layer painting cost, headless: a recording context and a reader that counts the
 * lookups the layer makes.
 */
import { describe, expect, it } from "vitest";
import { createGeometryScene, type GraphReader } from "../../../core/index.js";
import { buildModel } from "../../../core/space/scene/scene-fixtures.js";
import { createAssetService } from "../assets/asset-service.js";
import { createPaintFrame } from "../primitives/frame.js";
import { createPainterRegistries } from "../registries/painters.js";
import { DEFAULT_THEME } from "../theme/tokens.js";
import {
  DEFAULT_Z_ORDER,
  EMPTY_VIEW_STATE,
  paintScene,
} from "./scene-layer.js";

/** A 2D context whose every method does nothing and whose properties can be set. */
function nullContext(): CanvasRenderingContext2D {
  const props: Record<string | symbol, unknown> = {};
  return new Proxy(props, {
    get: (t, k) => (k in t ? t[k] : () => undefined),
    set: (t, k, v) => {
      t[k] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

function countingReader(reader: GraphReader) {
  const counts = { getPort: 0, portsOf: 0 };
  const counted: GraphReader = {
    ...reader,
    getPort(id) {
      counts.getPort++;
      return reader.getPort(id);
    },
    portsOf(node) {
      counts.portsOf++;
      return reader.portsOf(node);
    },
  };
  return { reader: counted, counts };
}

function setup(ports: number) {
  const model = buildModel([
    {
      id: "n",
      x: 0,
      y: 0,
      w: 400,
      h: 400,
      ports: Array.from({ length: ports }, (_, i) => ({
        id: `p${i}`,
        placement: { x: 0, y: i / ports },
      })),
    },
  ]);
  const scene = createGeometryScene(model);
  const painters = createPainterRegistries();
  const frame = createPaintFrame(
    { width: 800, height: 800, dpr: 1 },
    { zoom: 1, panX: 400, panY: 400 },
    DEFAULT_THEME,
  );
  return { model, scene, painters, frame };
}

describe("direct port lookup while painting", () => {
  it("a node with 200 ports reads each port once and never asks for its port list", () => {
    const { model, scene, painters, frame } = setup(200);
    const { reader, counts } = countingReader(model.reader);
    const painted: string[] = [];
    painters.portGlyphs.replace("k", {
      paint: (_c, input) => void painted.push(input.port.id),
    });
    paintScene(
      nullContext(),
      {
        reader,
        scene,
        painters,
        zOrder: DEFAULT_Z_ORDER,
        state: EMPTY_VIEW_STATE,
        assets: createAssetService(),
      },
      frame,
    );
    expect(painted).toHaveLength(200);
    expect(counts.getPort).toBe(200);
    expect(counts.portsOf).toBe(0);
    scene.dispose();
  });

  it("a node painter sees the same bounds object in two frames of an unchanged node", () => {
    const { model, scene, painters, frame } = setup(2);
    const seen: unknown[] = [];
    painters.nodes.replace("t", {
      paint: (_c, input) => void seen.push(input.bounds),
    });
    const deps = {
      reader: model.reader,
      scene,
      painters,
      zOrder: DEFAULT_Z_ORDER,
      state: EMPTY_VIEW_STATE,
      assets: createAssetService(),
      localBounds: new WeakMap(),
    };
    paintScene(nullContext(), deps, frame);
    paintScene(nullContext(), deps, frame);
    expect(seen).toHaveLength(2);
    expect(seen[1]).toBe(seen[0]);
    scene.dispose();
  });
});
