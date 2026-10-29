/// <reference types="@vitest/browser-playwright" />
import { describe, expect, it } from "vitest";
import {
  createGeometryRegistry,
  createGeometryScene,
  createImageSymbolGeometry,
  type QuarterTurns,
} from "../../../core/index.js";
import { buildModel } from "../../../core/space/scene/scene-fixtures.js";
import {
  cleanupScope,
  frames,
  makeHost,
  pixelAt,
  setDpr,
  until,
} from "../../browser-support.js";
import { mountView } from "../../mount-view.js";
import { createPainterRegistries } from "../registries/painters.js";
import { createConnectionPainter } from "./connection-painter.js";
import { createImageSymbolPainter } from "./image-symbol-painter.js";
import { createPortGlyphPainter } from "./port-glyph-painter.js";

const cleanup = cleanupScope();

// 100x60 picture with a coloured marker at each edge midpoint, matching the four ports.
const SYMBOL = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="60" viewBox="0 0 100 60">
  <rect x="0" y="23" width="14" height="14" fill="#ff0000"/>
  <rect x="86" y="23" width="14" height="14" fill="#00ff00"/>
  <rect x="43" y="0" width="14" height="14" fill="#0000ff"/>
  <rect x="43" y="46" width="14" height="14" fill="#ffff00"/>
</svg>`;
const MARKER: Record<string, readonly number[]> = {
  L: [255, 0, 0],
  R: [0, 255, 0],
  T: [0, 0, 255],
  B: [255, 255, 0],
};
const PORTS = [
  { id: "aL", placement: { x: 0, y: 0.5 } },
  { id: "aR", placement: { x: 1, y: 0.5 } },
  { id: "aT", placement: { x: 0.5, y: 0 } },
  { id: "aB", placement: { x: 0.5, y: 1 } },
];
const STATES = [0, 1, 2, 3].flatMap((rotation) =>
  [false, true].map((mirrored) => ({
    rotation: rotation as QuarterTurns,
    mirrored,
  })),
);

function near(actual: readonly number[], expected: readonly number[]): void {
  for (let i = 0; i < 3; i++) {
    expect(Math.abs((actual[i] ?? 0) - (expected[i] ?? 0))).toBeLessThanOrEqual(
      6,
    );
  }
}

async function mountSymbol(
  rotation: QuarterTurns,
  mirrored: boolean,
  glyphs: boolean,
) {
  const model = buildModel([
    {
      id: "a",
      x: 150,
      y: 100,
      w: 100,
      h: 60,
      rotation,
      mirrored,
      ports: PORTS,
    },
  ]);
  const geometry = createGeometryRegistry();
  geometry.register("t", createImageSymbolGeometry());
  const scene = createGeometryScene(model, { registry: geometry });
  cleanup(() => scene.dispose());
  const painters = createPainterRegistries();
  painters.nodes.replace(
    "t",
    createImageSymbolPainter({ assetOf: () => "sym" }),
  );
  if (glyphs) painters.portGlyphs.replace("k", createPortGlyphPainter());
  const view = mountView(makeHost(300, 200), {
    model,
    geometry,
    painters,
    assets: { resolve: async () => ({ kind: "svg", text: SYMBOL }) },
  });
  cleanup(() => view.dispose());
  await until(() => view.assets.stats().rasterizations >= 1);
  await frames(6);
  return { view, scene };
}

describe("image-symbol preset", () => {
  for (const dpr of [1, 2]) {
    it(`PRE-01 rotated symbol with ports: picture, glyphs and anchors coincide in all 8 states at DPR ${dpr}`, async () => {
      await setDpr(dpr);
      const signatures = new Set<string>();
      for (const { rotation, mirrored } of STATES) {
        const { view, scene } = await mountSymbol(rotation, mirrored, true);
        expect(window.devicePixelRatio).toBe(dpr);
        const entry = scene.node("a" as never);
        expect(entry?.anchors).toHaveLength(4);
        const canvas = view.canvases.scene;
        const sig: string[] = [];
        for (const anchor of entry?.anchors ?? []) {
          const key = String(anchor.portId).slice(1);
          const { x, y } = anchor.position;
          // Glyph centre sits exactly on the anchor.
          near(pixelAt(canvas, x, y), [216, 221, 230]);
          // Seven CSS pixels inward along the normal is inside this port's marker.
          const inward = pixelAt(
            canvas,
            x - anchor.normal.x * 7,
            y - anchor.normal.y * 7,
          );
          near(inward, MARKER[key] ?? []);
          expect(inward[3]).toBe(255);
          sig.push(`${key}:${Math.round(x)},${Math.round(y)}`);
        }
        signatures.add(sig.join("|"));
        view.dispose();
      }
      // Rotation and mirroring really move the ports: eight distinct arrangements.
      expect(signatures.size).toBe(8);
    });
  }

  it("PRE-01 connection endpoints are drawn exactly at the anchors", async () => {
    for (const dpr of [1, 2]) {
      await setDpr(dpr);
      const model = buildModel(
        [
          {
            id: "a",
            x: 60,
            y: 100,
            w: 60,
            h: 40,
            ports: [{ id: "aR", placement: { x: 1, y: 0.5 } }],
          },
          {
            id: "b",
            x: 240,
            y: 100,
            w: 60,
            h: 40,
            rotation: 1,
            ports: [{ id: "bT", placement: { x: 0.5, y: 0 } }],
          },
        ],
        [["c", "a", "aR", "b", "bT"]],
      );
      const scene = createGeometryScene(model);
      cleanup(() => scene.dispose());
      const painters = createPainterRegistries();
      painters.nodes.replace("t", { paint: () => {} });
      painters.portGlyphs.replace("k", { paint: () => {} });
      painters.connections.replace("default", createConnectionPainter());
      const view = mountView(makeHost(300, 200), {
        model,
        painters,
      });
      cleanup(() => view.dispose());
      await frames(4);
      const path = scene.connection("c" as never)?.path;
      const a = scene.node("a" as never)?.anchors[0];
      const b = scene.node("b" as never)?.anchors[0];
      expect(path?.p0).toEqual(a?.position);
      expect(path?.p1).toEqual(b?.position);
      for (const p of [a?.position, b?.position]) {
        near(
          pixelAt(view.canvases.scene, p?.x ?? 0, p?.y ?? 0),
          [127, 176, 224],
        );
      }
      view.dispose();
    }
  });
});
