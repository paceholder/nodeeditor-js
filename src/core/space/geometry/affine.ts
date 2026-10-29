/**
 * 2D affine transforms.
 *
 * Canvas `setTransform(a, b, c, d, e, f)` order, so the view can pass a composed matrix to
 * Canvas2D unchanged:
 *   x' = a*x + c*y + e
 *   y' = b*x + d*y + f
 * `F` and `T` are phantom space brands: a `Affine2<"local", "world">` maps local points.
 */
import {
  err,
  ok,
  type Rejection,
  type Result,
  rejectionOf,
} from "../../base/result.js";
import { MIN_DETERMINANT } from "./limits.js";
import type { Point, Space } from "./spaces.js";

export interface Affine2<F extends Space = Space, T extends Space = Space> {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly e: number;
  readonly f: number;
  readonly __from?: F;
  readonly __to?: T;
}

export function affine<F extends Space, T extends Space>(
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
): Affine2<F, T> {
  return { a, b, c, d, e, f };
}

export function identity<S extends Space>(): Affine2<S, S> {
  return affine(1, 0, 0, 1, 0, 0);
}

export function isFiniteAffine(m: Affine2): boolean {
  return (
    Number.isFinite(m.a) &&
    Number.isFinite(m.b) &&
    Number.isFinite(m.c) &&
    Number.isFinite(m.d) &&
    Number.isFinite(m.e) &&
    Number.isFinite(m.f)
  );
}

export function determinant(m: Affine2): number {
  return m.a * m.d - m.b * m.c;
}

/** `outer` after `inner`: `compose(o, i)` applied to p equals `o(i(p))`. */
export function compose<F extends Space, M extends Space, T extends Space>(
  outer: Affine2<M, T>,
  inner: Affine2<F, M>,
): Affine2<F, T> {
  return affine(
    outer.a * inner.a + outer.c * inner.b,
    outer.b * inner.a + outer.d * inner.b,
    outer.a * inner.c + outer.c * inner.d,
    outer.b * inner.c + outer.d * inner.d,
    outer.a * inner.e + outer.c * inner.f + outer.e,
    outer.b * inner.e + outer.d * inner.f + outer.f,
  );
}

/** Adding 0 turns a negative zero into a positive zero, so results compare bit-equal. */
const clean = (v: number): number => v + 0;

export function applyPoint<F extends Space, T extends Space>(
  m: Affine2<F, T>,
  p: { readonly x: number; readonly y: number },
): Point<T> {
  return {
    x: clean(m.a * p.x + m.c * p.y + m.e),
    y: clean(m.b * p.x + m.d * p.y + m.f),
  };
}

/** Apply only the linear part (directions and normals ignore translation). */
export function applyVector<F extends Space, T extends Space>(
  m: Affine2<F, T>,
  v: { readonly x: number; readonly y: number },
): Point<T> {
  return {
    x: clean(m.a * v.x + m.c * v.y),
    y: clean(m.b * v.x + m.d * v.y),
  };
}

/** Inverse, or a `non-invertible` rejection for non-finite or (nearly) singular input. */
export function invert<F extends Space, T extends Space>(
  m: Affine2<F, T>,
): Result<Affine2<T, F>, Rejection> {
  if (!isFiniteAffine(m)) {
    return err(rejectionOf("non-invertible", "Matrix has non-finite entries"));
  }
  const det = determinant(m);
  if (!Number.isFinite(det) || Math.abs(det) < MIN_DETERMINANT) {
    return err(rejectionOf("non-invertible", "Matrix is singular"));
  }
  const a = m.d / det;
  const b = -m.b / det;
  const c = -m.c / det;
  const d = m.a / det;
  return ok(
    affine(
      a,
      b,
      c,
      d,
      clean(-(a * m.e + c * m.f)),
      clean(-(b * m.e + d * m.f)),
    ),
  );
}
