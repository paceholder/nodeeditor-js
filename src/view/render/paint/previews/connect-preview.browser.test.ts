/// <reference types="@vitest/browser-playwright" />
import { describe, expect, it } from "vitest";
import {
  DEFAULT_CAPTURE_RADIUS_PX as CAPTURE,
  createGeometryScene,
  nodeId,
  portId,
  type Viewport,
} from "../../../../core/index.js";
import {
  buildModel,
  twoPortNode,
} from "../../../../core/space/scene/scene-fixtures.js";
import {
  cleanupScope,
  frames,
  makeHost,
  setDpr,
} from "../../../browser-support.js";
import { clientOf, mouse } from "../../../interact/input/input-test-support.js";
import type {
  CandidateState,
  ToolPreview,
} from "../../../interact/tools/tool-types.js";
import { mountView } from "../../../mount-view.js";
import { createPaintFrame, setMatrix } from "../../primitives/frame.js";
import { DEFAULT_THEME } from "../../theme/tokens.js";
import { paintConnectPreview } from "./connect-preview-painter.js";

const cleanup = cleanupScope();
const STATES: readonly CandidateState[] = [
  "compatible",
  "incompatible",
  "occupied",
  "unavailable",
  "pending",
];

function pixels(
  state: CandidateState,
  occupiedMark: boolean,
): Uint8ClampedArray {
  const model = buildModel([
    twoPortNode("a", 40, 50),
    twoPortNode("b", 160, 50),
  ]);
  const scene = createGeometryScene(model);
  cleanup(() => scene.dispose());
  const canvas = document.createElement("canvas");
  canvas.width = 220;
  canvas.height = 100;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  const viewport: Viewport = { zoom: 1, panX: 0, panY: 0 };
  const frame = createPaintFrame(
    { width: 220, height: 100, dpr: 1 },
    viewport,
    DEFAULT_THEME,
  );
  const target = { node: nodeId("b"), port: portId("bL") };
  const preview: ToolPreview = {
    kind: "connect",
    source: { node: nodeId("a"), port: portId("aR") },
    pointer: { x: 140, y: 50 },
    target: undefined,
    candidates: [
      {
        endpoint: target,
        evaluation: { state, occupiedMark, reason: undefined, code: undefined },
      },
    ],
  };
  setMatrix(ctx, frame.worldToDevice);
  if (preview.kind === "connect")
    paintConnectPreview(ctx, scene, frame, preview);
  return ctx.getImageData(0, 0, 220, 100).data;
}

const differs = (a: Uint8ClampedArray, b: Uint8ClampedArray): boolean =>
  a.some((v, i) => v !== b[i]);

describe("connect preview", () => {
  it("each candidate state paints a distinct glyph", () => {
    const painted = STATES.map((s) => pixels(s, false));
    for (let i = 0; i < painted.length; i++) {
      expect(
        painted[i]?.some((v) => v !== 0),
        STATES[i],
      ).toBe(true);
      for (let j = i + 1; j < painted.length; j++) {
        const a = painted[i];
        const b = painted[j];
        expect(a && b && differs(a, b), `${STATES[i]} vs ${STATES[j]}`).toBe(
          true,
        );
      }
    }
    // The occupied mark adds to a compatible glyph without changing the state's shape.
    const plain = painted[0];
    const marked = pixels("compatible", true);
    expect(plain && differs(plain, marked)).toBe(true);
  });

  it("states differ in shape, not only in color", () => {
    // Occupied and unavailable share the warning color: only the glyph shape differs.
    const occupied = pixels("occupied", false);
    const unavailable = pixels("unavailable", false);
    expect(differs(occupied, unavailable)).toBe(true);
  });
});

/** Radius (CSS px) of the capture ring around bL, measured on the interaction canvas. */
function ringRadius(
  canvas: HTMLCanvasElement,
  cx: number,
  cy: number,
  dpr: number,
): number {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  const hits: number[] = [];
  // The column through the port center: no wire or badge crosses it away from the center.
  for (let dy = -30; dy <= 30; dy += 0.25) {
    if (Math.abs(dy) < 6) continue;
    const d = ctx.getImageData(
      Math.round(cx * dpr),
      Math.round((cy + dy) * dpr),
      1,
      1,
    ).data;
    if ((d[3] ?? 0) > 60) hits.push(dy);
  }
  const up = hits.filter((d) => d < 0);
  const down = hits.filter((d) => d > 0);
  if (up.length === 0 || down.length === 0) return Number.NaN;
  const top = up.reduce((a, b) => a + b) / up.length;
  const bottom = down.reduce((a, b) => a + b) / down.length;
  return (bottom - top) / 2;
}

describe("connect preview: capture radius", () => {
  const cases = [0.5, 1, 4].flatMap((zoom) =>
    [1, 2].map((dpr) => ({ zoom, dpr })),
  );
  for (const { zoom, dpr } of cases) {
    it(`the capture radius stays the anchor's capture radius in CSS px at zoom ${zoom} and DPR ${dpr}`, async () => {
      await setDpr(dpr);
      const model = buildModel([
        twoPortNode("a", 80, 100),
        twoPortNode("b", 160, 100),
      ]);
      const host = makeHost(500, 300);
      const view = mountView(host, {
        model,
        initialViewport: {
          zoom,
          panX: 250 - 140 * zoom,
          panY: 150 - 100 * zoom,
        },
      });
      cleanup(() => view.dispose());
      await frames(3);
      expect(view.metrics().dpr).toBe(dpr);
      const port = clientOf(view, 140, 100);
      const rect = host.getBoundingClientRect();
      const cx = port.x - rect.left;
      const cy = port.y - rect.top;

      // Picking: just inside the radius captures the port, just outside does not, at every zoom.
      const kinds = (dy: number) =>
        view.pick(port.x, port.y + dy).map((h) => h.kind);
      expect(kinds(-(CAPTURE - 1))).toContain("port");
      expect(kinds(-(CAPTURE + 2))).not.toContain("port");

      // Painting: a drag toward the port shows the ring at the same 10 px.
      const pointer = mouse(view);
      pointer.down(100, 100);
      pointer.move(120, 100);
      const at = clientOf(view, 140, 100);
      // Hover just inside the capture radius, above the port.
      const world = (at.y - (CAPTURE - 1) - port.y) / zoom;
      pointer.move(140, 100 + world);
      await frames(3);
      const radius = ringRadius(view.canvases.interaction, cx, cy, dpr);
      expect(radius).toBeGreaterThan(CAPTURE - 1);
      expect(radius).toBeLessThan(CAPTURE + 1.5);
      pointer.up(140, 100 + world);
    });
  }
});
