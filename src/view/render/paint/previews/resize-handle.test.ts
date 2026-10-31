import { describe, expect, it } from "vitest";
import { mkNode } from "../../../../core/data/model/test-helpers.js";
import {
  applyPoint,
  nodeTransform,
  type QuarterTurns,
  worldToViewport,
} from "../../../../core/index.js";
import {
  hitsResizeHandle,
  RESIZE_HANDLE_PX,
  resizeHandleOf,
} from "./resize-handle.js";

const TURNS: QuarterTurns[] = [0, 1, 2, 3];

function entry(rotation: QuarterTurns, mirrored: boolean) {
  const record = mkNode("n1", {
    position: { x: 100, y: 50 },
    size: { width: 40, height: 20 },
    rotation,
    mirrored,
  });
  return { record, toWorld: nodeTransform(record) };
}

describe("INT-10, GEO-05 resize handle geometry", () => {
  it("is the screen bottom-right corner of the body for all eight frames", () => {
    for (const rotation of TURNS) {
      for (const mirrored of [false, true]) {
        const e = entry(rotation, mirrored);
        const handle = resizeHandleOf(e, 1);
        const swapped = rotation % 2 === 1;
        const halfW = swapped ? 10 : 20;
        const halfH = swapped ? 20 : 10;
        expect(handle.point).toEqual({ x: 100 + halfW, y: 50 + halfH });
        // The local corner maps to that point.
        const { corner } = handle;
        const local = { x: corner.x * 20, y: corner.y * 10 };
        expect(applyPoint(e.toWorld, local)).toEqual(handle.point);
        // The square lies inside the body, up and left of the corner.
        expect(handle.rect.x + handle.rect.w).toBe(handle.point.x);
        expect(handle.rect.y + handle.rect.h).toBe(handle.point.y);
      }
    }
  });

  it("keeps its screen size at zoom 0.25 and 4", () => {
    for (const zoom of [0.25, 4]) {
      const handle = resizeHandleOf(entry(1, true), zoom);
      const viewport = { zoom, panX: 13, panY: -7 };
      const a = worldToViewport(viewport, {
        x: handle.rect.x,
        y: handle.rect.y,
      });
      const b = worldToViewport(viewport, {
        x: handle.rect.x + handle.rect.w,
        y: handle.rect.y + handle.rect.h,
      });
      expect(b.x - a.x).toBeCloseTo(RESIZE_HANDLE_PX, 9);
      expect(b.y - a.y).toBeCloseTo(RESIZE_HANDLE_PX, 9);
    }
  });

  it("picks inside the square and nothing just outside it", () => {
    const handle = resizeHandleOf(entry(0, false), 1);
    expect(hitsResizeHandle(handle, { x: 116, y: 56 })).toBe(true);
    expect(hitsResizeHandle(handle, { x: 120, y: 60 })).toBe(true);
    expect(hitsResizeHandle(handle, { x: 120.5, y: 58 })).toBe(false);
    expect(hitsResizeHandle(handle, { x: 116, y: 60.5 })).toBe(false);
    expect(hitsResizeHandle(handle, { x: 111.5, y: 56 })).toBe(false);
  });
});
