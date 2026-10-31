import { describe, expect, it } from "vitest";
import { mkNode } from "../../../core/data/model/test-helpers.js";
import {
  applyPoint,
  DEFAULT_SIZE_LIMITS,
  invert,
  type NodeRecord,
  nodeTransform,
  type QuarterTurns,
  type ResolvedSizeLimits,
} from "../../../core/index.js";
import { resizeHandleOf } from "../../render/paint/previews/resize-handle.js";
import { type ResizeStep, resizeStep } from "./resize-math.js";

/** A start frame for a node whose top-left corner (unrotated) is at (0, 0). */
function start(
  size: { width: number; height: number },
  rotation: QuarterTurns = 0,
  mirrored = false,
) {
  const record: NodeRecord = mkNode("n1", {
    position: { x: size.width / 2, y: size.height / 2 },
    size,
    rotation,
    mirrored,
  });
  const toWorld = nodeTransform(record);
  const inverse = invert(toWorld);
  if (!inverse.ok) throw new Error("not invertible");
  return { record, toWorld, toLocal: inverse.value };
}

function step(over: Partial<ResizeStep> = {}): ResizeStep {
  return {
    press: { x: 0, y: 0 },
    pointer: { x: 0, y: 0 },
    keepAspect: false,
    gridStep: undefined,
    suppressSnap: false,
    limits: DEFAULT_SIZE_LIMITS,
    ...over,
  };
}

/** Screen bounds of a node: min and max corners in world space. */
function bounds(
  r: Pick<NodeRecord, "position" | "size" | "rotation" | "mirrored">,
) {
  const t = nodeTransform(r);
  const pts = [
    [-1, -1],
    [1, 1],
    [-1, 1],
    [1, -1],
  ].map(([x = 0, y = 0]) =>
    applyPoint(t, { x: (x * r.size.width) / 2, y: (y * r.size.height) / 2 }),
  );
  return {
    left: Math.min(...pts.map((p) => p.x)),
    top: Math.min(...pts.map((p) => p.y)),
    right: Math.max(...pts.map((p) => p.x)),
    bottom: Math.max(...pts.map((p) => p.y)),
  };
}

describe("resize math", () => {
  it("Corner drag keeps the opposite corner", () => {
    const s = start({ width: 100, height: 60 });
    const { corner } = resizeHandleOf(s, 1);
    const r = resizeStep(
      s,
      corner,
      step({ press: { x: 100, y: 60 }, pointer: { x: 140, y: 80 } }),
    );
    expect(r.size).toEqual({ width: 140, height: 80 });
    expect(bounds({ ...s.record, ...r })).toMatchObject({ left: 0, top: 0 });
  });

  it("Shift keeps the aspect ratio across many pointer positions", () => {
    const s = start({ width: 100, height: 50 });
    const { corner } = resizeHandleOf(s, 1);
    for (const [x, y] of [
      [130, 50],
      [100, 90],
      [60, 70],
      [400, 52],
      [101, 300],
    ] as const) {
      const r = resizeStep(
        s,
        corner,
        step({ press: { x: 100, y: 50 }, pointer: { x, y }, keepAspect: true }),
      );
      expect(r.size.width / r.size.height).toBeCloseTo(2, 12);
    }
  });

  it("Handle on a rotated and mirrored node grows right and down on screen", () => {
    const s = start({ width: 100, height: 40 }, 1, true);
    const before = bounds(s.record);
    const handle = resizeHandleOf(s, 1);
    const r = resizeStep(
      s,
      handle.corner,
      step({
        press: handle.point,
        pointer: { x: handle.point.x + 30, y: handle.point.y + 20 },
      }),
    );
    const after = bounds({ ...s.record, ...r });
    expect(after.left).toBe(before.left);
    expect(after.top).toBe(before.top);
    expect(after.right).toBe(before.right + 30);
    expect(after.bottom).toBe(before.bottom + 20);
  });

  it("Clamped while dragging: stops at the minimum, opposite corner in place", () => {
    const s = start({ width: 100, height: 60 });
    const { corner } = resizeHandleOf(s, 1);
    const limits: ResolvedSizeLimits = {
      min: { width: 50, height: 10 },
      max: { width: 200, height: 200 },
    };
    // Past the opposite corner, too: never negative, never below the minimum.
    for (const x of [40, 0, -80]) {
      const r = resizeStep(
        s,
        corner,
        step({ press: { x: 100, y: 60 }, pointer: { x, y: 60 }, limits }),
      );
      expect(r.size).toEqual({ width: 50, height: 60 });
      expect(bounds({ ...s.record, ...r })).toMatchObject({ left: 0, top: 0 });
    }
    // With Shift the common factor is clamped, so the ratio still holds.
    const r = resizeStep(
      s,
      corner,
      step({
        press: { x: 100, y: 60 },
        pointer: { x: 500, y: 60 },
        limits,
        keepAspect: true,
      }),
    );
    expect(r.size.width).toBe(200);
    expect(r.size.height).toBeCloseTo(120, 12);
  });

  it("Grid snapping only when enabled, and Alt suppresses it", () => {
    const s = start({ width: 100, height: 60 });
    const { corner } = resizeHandleOf(s, 1);
    const drag = { press: { x: 100, y: 60 }, pointer: { x: 133, y: 77 } };
    expect(resizeStep(s, corner, step(drag)).size).toEqual({
      width: 133,
      height: 77,
    });
    const snapped = resizeStep(s, corner, step({ ...drag, gridStep: 20 }));
    expect(snapped.size).toEqual({ width: 140, height: 80 });
    expect(
      resizeStep(s, corner, step({ ...drag, gridStep: 20, suppressSnap: true }))
        .size,
    ).toEqual({ width: 133, height: 77 });
  });
});
