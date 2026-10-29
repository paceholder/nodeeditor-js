/**
 * Renderer-neutral hit shapes in node-local space (GEO-02b, GEO-04, NOD-02).
 *
 * `shapeContains` is exact for the boundary-inclusive interior. `shapeDistance` is 0 for
 * points inside and the Euclidean distance to the outline otherwise.
 */
import {
  err,
  ok,
  type Rejection,
  type Result,
  rejectionOf,
} from "../../base/result.js";
import {
  isFinitePoint,
  isFiniteRect,
  type Point,
  type Rect,
  rect,
} from "./spaces.js";
import { distance, distanceToSegment } from "./vec.js";

type L = "local";

export type Shape =
  | { readonly kind: "rect"; readonly bounds: Rect<L> }
  | {
      readonly kind: "roundRect";
      readonly bounds: Rect<L>;
      readonly radius: number;
    }
  | { readonly kind: "ellipse"; readonly bounds: Rect<L> }
  | { readonly kind: "polygon"; readonly points: readonly Point<L>[] };

export function rectShape(bounds: Rect<L>): Shape {
  return { kind: "rect", bounds };
}

export function ellipseShape(bounds: Rect<L>): Shape {
  return { kind: "ellipse", bounds };
}

export function roundRectShape(bounds: Rect<L>, radius: number): Shape {
  return { kind: "roundRect", bounds, radius };
}

/** A polygon needs at least three finite vertices. */
export function polygonShape(
  points: readonly Point<L>[],
): Result<Shape, Rejection> {
  if (points.length < 3 || !points.every(isFinitePoint)) {
    return err(
      rejectionOf(
        "invalid-shape",
        "A polygon needs at least three finite vertices",
      ),
    );
  }
  return ok({ kind: "polygon", points });
}

export function shapeBounds(shape: Shape): Rect<L> {
  switch (shape.kind) {
    case "rect":
    case "roundRect":
    case "ellipse":
      return shape.bounds;
    case "polygon": {
      let minX = Number.POSITIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;
      for (const p of shape.points) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
      return rect(minX, minY, maxX - minX, maxY - minY);
    }
  }
}

function polygonContains(points: readonly Point<L>[], p: Point<L>): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i];
    const b = points[j];
    if (!a || !b) continue;
    if (distanceToSegment(p, a, b) === 0) return true;
    if (a.y > p.y !== b.y > p.y) {
      const x = ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
      if (p.x < x) inside = !inside;
    }
  }
  return inside;
}

function polygonDistance(points: readonly Point<L>[], p: Point<L>): number {
  if (polygonContains(points, p)) return 0;
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i];
    const b = points[j];
    if (a && b) best = Math.min(best, distanceToSegment(p, a, b));
  }
  return best;
}

function rectDistance(b: Rect<L>, p: Point<L>): number {
  const dx = Math.max(b.x - p.x, 0, p.x - (b.x + b.w));
  const dy = Math.max(b.y - p.y, 0, p.y - (b.y + b.h));
  return Math.hypot(dx, dy);
}

function roundRectDistance(b: Rect<L>, radius: number, p: Point<L>): number {
  const r = Math.min(Math.max(0, radius), b.w / 2, b.h / 2);
  const qx = Math.abs(p.x - (b.x + b.w / 2)) - (b.w / 2 - r);
  const qy = Math.abs(p.y - (b.y + b.h / 2)) - (b.h / 2 - r);
  const signed =
    Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
    Math.min(Math.max(qx, qy), 0) -
    r;
  return Math.max(0, signed);
}

/** Closest-point iteration for a point outside an axis-aligned ellipse. */
function ellipseDistance(b: Rect<L>, p: Point<L>): number {
  const a = b.w / 2;
  const c = b.h / 2;
  const px = Math.abs(p.x - (b.x + a));
  const py = Math.abs(p.y - (b.y + c));
  if (a < 1e-12 || c < 1e-12) return rectDistance(b, p);
  if ((px / a) ** 2 + (py / c) ** 2 <= 1) return 0;
  let tx = Math.SQRT1_2;
  let ty = Math.SQRT1_2;
  for (let i = 0; i < 12; i++) {
    const x = a * tx;
    const y = c * ty;
    const ex = ((a * a - c * c) * tx ** 3) / a;
    const ey = ((c * c - a * a) * ty ** 3) / c;
    const r = Math.hypot(x - ex, y - ey);
    const q = Math.hypot(px - ex, py - ey);
    if (q < 1e-12) break;
    tx = Math.min(1, Math.max(0, (((px - ex) * r) / q + ex) / a));
    ty = Math.min(1, Math.max(0, (((py - ey) * r) / q + ey) / c));
    const t = Math.hypot(tx, ty);
    if (t < 1e-12) break;
    tx /= t;
    ty /= t;
  }
  return distance({ x: px, y: py }, { x: a * tx, y: c * ty });
}

export function shapeDistance(shape: Shape, p: Point<L>): number {
  switch (shape.kind) {
    case "rect":
      return rectDistance(shape.bounds, p);
    case "roundRect":
      return roundRectDistance(shape.bounds, shape.radius, p);
    case "ellipse":
      return ellipseDistance(shape.bounds, p);
    case "polygon":
      return polygonDistance(shape.points, p);
  }
}

export function shapeContains(shape: Shape, p: Point<L>): boolean {
  if (!isFinitePoint(p)) return false;
  switch (shape.kind) {
    case "rect":
      return rectDistance(shape.bounds, p) === 0;
    case "roundRect":
      return roundRectDistance(shape.bounds, shape.radius, p) === 0;
    case "ellipse":
      return ellipseDistance(shape.bounds, p) === 0;
    case "polygon":
      return polygonContains(shape.points, p);
  }
}

export function isValidShape(shape: Shape): boolean {
  switch (shape.kind) {
    case "rect":
    case "ellipse":
      return isFiniteRect(shape.bounds);
    case "roundRect":
      return isFiniteRect(shape.bounds) && Number.isFinite(shape.radius);
    case "polygon":
      return shape.points.length >= 3 && shape.points.every(isFinitePoint);
  }
}
