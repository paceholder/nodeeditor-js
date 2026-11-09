/**
 * Pin routing for orthogonal routes (design D4).
 *
 * With pinned segments the router does not choose among candidate shapes. It builds one
 * path from a list of axis-aligned lines that alternate between horizontal and vertical:
 * the stub at the source port, the pins in order, the stub at the target port, and the
 * free lines that connect them. A pin is placed right after the previous line when it
 * can be reached from there; otherwise free lines are inserted, each at the midpoint
 * between its own start and the next fixed coordinate on its axis. Vertices are the
 * intersections of consecutive lines, so the result is a pure function of the ends and
 * the pins, with no search and no state.
 *
 * A pin on the line of a stub (same orientation and coordinate) is realized by the stub
 * and dropped from the walk when it is the first or last pin.
 */
import type { RouteConstraint } from "../../data/model/records.js";
import type { Point } from "../geometry/spaces.js";
import type { Axis } from "./escape.js";
import {
  ALIGN_TOLERANCE,
  type OrthogonalEnd,
} from "./orthogonal-candidates.js";

type W = "world";
type Ori = "h" | "v";

interface Line {
  readonly ori: Ori;
  /** y of a horizontal line, x of a vertical one. */
  readonly at: number;
}

const other = (o: Ori): Ori => (o === "h" ? "v" : "h");
const oriOfPin = (p: RouteConstraint): Ori =>
  p.orientation === "horizontal" ? "h" : "v";
const oriOfDir = (d: Axis): Ori => (d.x !== 0 ? "h" : "v");
const lineOf = (p: Point<W>, o: Ori): Line => ({
  ori: o,
  at: o === "h" ? p.y : p.x,
});
/** The coordinate of `p` that a line perpendicular to a segment of orientation `o` takes. */
const along = (p: Point<W>, o: Ori): number => (o === "h" ? p.x : p.y);
const sign = (d: Axis, o: Ori): number => (o === "h" ? d.x : d.y);
const near = (a: number, b: number): boolean =>
  Math.abs(a - b) <= ALIGN_TOLERANCE;

function intersect(a: Line, b: Line): Point<W> {
  const h = a.ori === "h" ? a : b;
  const v = a.ori === "h" ? b : a;
  return { x: v.at, y: h.at };
}

/**
 * Vertices of the route through `pins` (in walk order from `a` to `b`), or undefined when
 * no pin needs routing (every pin lies on a stub) or an input is not finite, in which
 * case the caller routes without pins.
 */
export function routeThroughPins(
  a: OrthogonalEnd,
  b: OrthogonalEnd,
  pins: readonly RouteConstraint[],
  c: number,
): Point<W>[] | undefined {
  const p0 = a.position;
  const p1 = b.position;
  const finite = [p0.x, p0.y, p1.x, p1.y, c, ...pins.map((p) => p.at)];
  if (!finite.every(Number.isFinite)) return undefined;
  const ori0 = oriOfDir(a.dir);
  const ori1 = oriOfDir(b.dir);
  const stub0 = lineOf(p0, ori0);
  const stub1 = lineOf(p1, ori1);
  // Pins on a stub's own line at either end of the list are realized by that stub.
  let lo = 0;
  let hi = pins.length;
  while (lo < hi && onLine(pins[lo], stub0)) lo++;
  while (hi > lo && onLine(pins[hi - 1], stub1)) hi--;
  const rem = pins.slice(lo, hi);
  if (rem.length === 0) return undefined;

  const e0 = { x: p0.x + a.dir.x * c, y: p0.y + a.dir.y * c };
  const e1 = { x: p1.x + b.dir.x * c, y: p1.y + b.dir.y * c };
  const lines: Line[] = [stub0];
  const pinned = new Set<Line>();
  const last = (): Line => lines[lines.length - 1] as Line;

  /** Where the last line starts, on the axis of the next line's coordinate. */
  const startOf = (): number =>
    lines.length === 1 ? along(e0, ori0) : (lines[lines.length - 2] as Line).at;
  // Next fixed coordinate per orientation after each pin index, built in one backward
  // pass so the walk stays linear in the pins.
  const nextH: number[] = new Array(rem.length);
  const nextV: number[] = new Array(rem.length);
  let h = e1.y;
  let v = e1.x;
  for (let i = rem.length - 1; i >= 0; i--) {
    nextH[i] = h;
    nextV[i] = v;
    const p = rem[i] as RouteConstraint;
    if (oriOfPin(p) === "h") h = p.at;
    else v = p.at;
  }
  /** Next fixed coordinate of lines with orientation `o` after pin index `k`. */
  const nextFixed = (o: Ori, k: number): number =>
    (o === "h" ? nextH[k] : nextV[k]) as number;
  /**
   * A free line between `start` and `target`: their midpoint, kept at least at `edge`
   * in direction `dir` when bounded (a stub's clearance), and moved off `start` by the
   * clearance when it would sit on it and `strict` (a zero-length line would vanish).
   */
  const free = (
    start: number,
    target: number,
    bound?: { readonly dir: number; readonly edge: number },
    strict = false,
  ): number => {
    let v = (start + target) / 2;
    if (bound)
      v = bound.dir > 0 ? Math.max(v, bound.edge) : Math.min(v, bound.edge);
    if (strict && near(v, start)) v = start + (bound ? bound.dir : 1) * c;
    return v;
  };
  const reach0 = (at: number): number =>
    (at - along(p0, ori0)) * sign(a.dir, ori0);
  const bound0 = { dir: sign(a.dir, ori0), edge: along(e0, ori0) };

  rem.forEach((pin, k) => {
    const po = oriOfPin(pin);
    const prev = last();
    const line: Line = { ori: po, at: pin.at };
    if (po !== prev.ori) {
      if (lines.length === 1 && reach0(pin.at) < c - ALIGN_TOLERANCE) {
        // Behind the source clearance: leave along the stub, then come back.
        lines.push({ ori: po, at: free(bound0.edge, pin.at, bound0) });
        lines.push({
          ori: prev.ori,
          at: free(startOf(), nextFixed(prev.ori, k), undefined, true),
        });
      }
    } else if (pinned.has(prev) && near(prev.at, pin.at)) {
      return; // the same line again
    } else {
      const fo = other(prev.ori);
      lines.push({
        ori: fo,
        at:
          lines.length === 1
            ? free(bound0.edge, nextFixed(fo, k), bound0)
            : free(startOf(), nextFixed(fo, k), undefined, true),
      });
    }
    lines.push(line);
    pinned.add(line);
  });

  // Join the last pin to the target stub, entering along the reverse of its direction.
  const tail = last();
  const reach1 = (at: number): number =>
    (at - along(p1, ori1)) * sign(b.dir, ori1);
  const bound1 = { dir: sign(b.dir, ori1), edge: along(e1, ori1) };
  if (tail.ori !== ori1) {
    if (reach1(tail.at) < c - ALIGN_TOLERANCE) {
      lines.push({ ori: ori1, at: free(startOf(), stub1.at, undefined, true) });
      lines.push({ ori: tail.ori, at: bound1.edge });
    }
  } else {
    const fo = other(ori1);
    lines.push({
      ori: fo,
      at: free(startOf(), bound1.edge, bound1, true),
    });
  }
  lines.push(stub1);

  const points: Point<W>[] = [p0];
  for (let i = 0; i + 1 < lines.length; i++) {
    points.push(intersect(lines[i] as Line, lines[i + 1] as Line));
  }
  points.push(p1);
  return points;
}

function onLine(pin: RouteConstraint | undefined, line: Line): boolean {
  return (
    pin !== undefined && oriOfPin(pin) === line.ori && near(pin.at, line.at)
  );
}

/**
 * For each pin, the index of the segment of `points` that lies on it, searching forward
 * from the segment of the previous pin; -1 when none does (the pin collapsed to a point
 * or the router ignored it).
 */
export function realizedSegments(
  points: readonly Point<W>[],
  pins: readonly RouteConstraint[],
): number[] {
  const out: number[] = [];
  let from = 0;
  for (const pin of pins) {
    let found = -1;
    for (let i = from; i + 1 < points.length; i++) {
      const p = points[i] as Point<W>;
      const q = points[i + 1] as Point<W>;
      if (p.x === q.x && p.y === q.y) continue;
      const onPin =
        pin.orientation === "horizontal"
          ? near(p.y, pin.at) && near(q.y, pin.at)
          : near(p.x, pin.at) && near(q.x, pin.at);
      if (onPin) {
        found = i;
        break;
      }
    }
    out.push(found);
    if (found >= 0) from = found;
  }
  return out;
}
