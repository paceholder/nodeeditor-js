/** Small value types shared by records. All are plain JSON-compatible data. */

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
