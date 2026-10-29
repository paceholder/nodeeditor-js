/**
 * Named coordinate spaces (GEO-01).
 *
 * - `local`: node-local; origin is the node's body center, +x right, +y down, world units.
 * - `world`: document space in world units; the only space persisted in the model.
 * - `viewport`: CSS pixels relative to the view container's top-left corner.
 * - `device`: physical pixels, `viewport * devicePixelRatio`.
 *
 * The `__space` property is a phantom brand: it never exists at runtime, but the compiler
 * rejects passing, say, a viewport point where a world point is expected.
 */

export type Space = "local" | "world" | "viewport" | "device";

export interface Point<S extends Space> {
  readonly x: number;
  readonly y: number;
  readonly __space?: S;
}

/** Axis-aligned rectangle; `w` and `h` are non-negative. Zero size is valid. */
export interface Rect<S extends Space> {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly __space?: S;
}

export function point<S extends Space>(x: number, y: number): Point<S> {
  return { x, y };
}

export function rect<S extends Space>(
  x: number,
  y: number,
  w: number,
  h: number,
): Rect<S> {
  return { x, y, w, h };
}

export function isFinitePoint(p: { x: number; y: number }): boolean {
  return Number.isFinite(p.x) && Number.isFinite(p.y);
}

export function isFiniteRect(r: Rect<Space>): boolean {
  return (
    Number.isFinite(r.x) &&
    Number.isFinite(r.y) &&
    Number.isFinite(r.w) &&
    Number.isFinite(r.h) &&
    r.w >= 0 &&
    r.h >= 0
  );
}
