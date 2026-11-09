/** Small value types shared by records. All are plain JSON-compatible data. */

/**
 * Supported world range: |x|, |y| <= 1e7. Beyond that, double precision leaves
 * less than a millionth of a world unit and picking tolerances degrade. Record validation
 * enforces it, so no stored position or route coordinate lies outside.
 */
export const MAX_WORLD_COORD = 1e7;
/** Largest node width or height: a node may span the whole world range. */
export const MAX_WORLD_SIZE = 2 * MAX_WORLD_COORD;
/** Supported zoom range; view requests outside are clamped, documents outside rejected. */
export const MIN_ZOOM = 1e-3;
export const MAX_ZOOM = 1e3;

export function inWorldRange(value: number): boolean {
  return Math.abs(value) <= MAX_WORLD_COORD;
}

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

/** Width and height in world units; both finite and non-negative. */
export interface Size {
  readonly width: number;
  readonly height: number;
}

/** Rotation in clockwise quarter turns. */
export type QuarterTurns = 0 | 1 | 2 | 3;

export function isQuarterTurns(value: unknown): value is QuarterTurns {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isFiniteVec2(value: unknown): value is Vec2 {
  return (
    isRecord(value) && Number.isFinite(value.x) && Number.isFinite(value.y)
  );
}

export function isFiniteSize(value: unknown): value is Size {
  return (
    isRecord(value) &&
    typeof value.width === "number" &&
    typeof value.height === "number" &&
    Number.isFinite(value.width) &&
    Number.isFinite(value.height) &&
    value.width >= 0 &&
    value.height >= 0
  );
}
