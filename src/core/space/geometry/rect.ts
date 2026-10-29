/** Rectangle operations. Intersection and containment are inclusive of the boundary. */
import type { Affine2 } from "./affine.js";
import { applyPoint } from "./affine.js";
import { type Point, type Rect, rect, type Space } from "./spaces.js";

export function rectFromPoints<S extends Space>(
  a: Point<S>,
  b: Point<S>,
): Rect<S> {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return rect(x, y, Math.max(a.x, b.x) - x, Math.max(a.y, b.y) - y);
}

export function rectRight(r: Rect<Space>): number {
  return r.x + r.w;
}

export function rectBottom(r: Rect<Space>): number {
  return r.y + r.h;
}

export function rectCenter<S extends Space>(r: Rect<S>): Point<S> {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

export function unionRects<S extends Space>(a: Rect<S>, b: Rect<S>): Rect<S> {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return rect(
    x,
    y,
    Math.max(rectRight(a), rectRight(b)) - x,
    Math.max(rectBottom(a), rectBottom(b)) - y,
  );
}

export function rectsIntersect<S extends Space>(
  a: Rect<S>,
  b: Rect<S>,
): boolean {
  return (
    a.x <= rectRight(b) &&
    b.x <= rectRight(a) &&
    a.y <= rectBottom(b) &&
    b.y <= rectBottom(a)
  );
}

/** Overlap of two rectangles, or undefined when they are disjoint. */
export function intersectRects<S extends Space>(
  a: Rect<S>,
  b: Rect<S>,
): Rect<S> | undefined {
  if (!rectsIntersect(a, b)) return undefined;
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  return rect(
    x,
    y,
    Math.min(rectRight(a), rectRight(b)) - x,
    Math.min(rectBottom(a), rectBottom(b)) - y,
  );
}

/** Grow (or, with a negative margin, shrink toward the center, never below zero size). */
export function inflateRect<S extends Space>(
  r: Rect<S>,
  margin: number,
): Rect<S> {
  const w = Math.max(0, r.w + 2 * margin);
  const h = Math.max(0, r.h + 2 * margin);
  return rect(r.x + (r.w - w) / 2, r.y + (r.h - h) / 2, w, h);
}

export function rectContainsPoint<S extends Space>(
  r: Rect<S>,
  p: Point<S>,
): boolean {
  return (
    p.x >= r.x && p.x <= rectRight(r) && p.y >= r.y && p.y <= rectBottom(r)
  );
}

export function rectContainsRect<S extends Space>(
  outer: Rect<S>,
  inner: Rect<S>,
): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    rectRight(inner) <= rectRight(outer) &&
    rectBottom(inner) <= rectBottom(outer)
  );
}

/** Axis-aligned bounds of a rectangle after an affine map. */
export function transformRect<F extends Space, T extends Space>(
  m: Affine2<F, T>,
  r: Rect<F>,
): Rect<T> {
  const corners = [
    applyPoint(m, { x: r.x, y: r.y }),
    applyPoint(m, { x: r.x + r.w, y: r.y }),
    applyPoint(m, { x: r.x + r.w, y: r.y + r.h }),
    applyPoint(m, { x: r.x, y: r.y + r.h }),
  ];
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const c of corners) {
    minX = Math.min(minX, c.x);
    minY = Math.min(minY, c.y);
    maxX = Math.max(maxX, c.x);
    maxY = Math.max(maxY, c.y);
  }
  return rect(minX, minY, maxX - minX, maxY - minY);
}
