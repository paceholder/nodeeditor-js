/** Small 2D vector helpers shared by shapes and paths. All results are finite for finite input. */

export interface V2 {
  readonly x: number;
  readonly y: number;
}

export const add = (a: V2, b: V2): V2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: V2, b: V2): V2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: V2, k: number): V2 => ({ x: a.x * k, y: a.y * k });
export const dot = (a: V2, b: V2): number => a.x * b.x + a.y * b.y;
export const length = (a: V2): number => Math.hypot(a.x, a.y);
export const distance = (a: V2, b: V2): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

/** Unit vector, or `fallback` when the input is (nearly) zero or not finite. */
export function normalize(a: V2, fallback: V2 = { x: 1, y: 0 }): V2 {
  const len = length(a);
  if (!Number.isFinite(len) || len < 1e-12) return fallback;
  return { x: a.x / len, y: a.y / len };
}

/** Distance from `p` to the segment `a`-`b`; a zero-length segment is a point. */
export function distanceToSegment(p: V2, a: V2, b: V2): number {
  const ab = sub(b, a);
  const len2 = dot(ab, ab);
  if (len2 === 0) return distance(p, a);
  const t = Math.min(1, Math.max(0, dot(sub(p, a), ab) / len2));
  return distance(p, { x: a.x + ab.x * t, y: a.y + ab.y * t });
}
