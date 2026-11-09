/**
 * Two-finger pinch zoom for touch, as a pure state machine. The DOM adapter feeds it every
 * touch pointer; when a second touch goes down it reports `started` (the adapter cancels
 * the gesture in progress) and from then on turns the two touches' motion into viewport
 * operations: a zoom about their previous midpoint by the ratio of their distances, then a
 * pan by the midpoint's motion. Lifting either touch ends the pinch; the touches left do
 * nothing until all have lifted, so a pinch never turns into a drag.
 */
import type { Point } from "../../../core/index.js";
import type { ViewportOp } from "../tools/tool-types.js";

export type PinchInput =
  | {
      readonly type: "down" | "move";
      readonly pointerId: number;
      readonly at: Point<"viewport">;
    }
  | { readonly type: "up"; readonly pointerId: number };

interface TouchPoint {
  readonly pointerId: number;
  readonly at: Point<"viewport">;
}

export type PinchState =
  | { readonly kind: "idle" }
  /** One touch down; it belongs to the tools. */
  | { readonly kind: "one"; readonly touch: TouchPoint }
  | {
      readonly kind: "pinching";
      readonly a: TouchPoint;
      readonly b: TouchPoint;
    }
  /** A pinch ended with touches still down; they are ignored until all lift. */
  | { readonly kind: "spent"; readonly down: readonly number[] };

export interface PinchStep {
  readonly state: PinchState;
  /** A pinch began: the gesture in progress must be cancelled. */
  readonly started: boolean;
  readonly ops: readonly ViewportOp[];
}

export const PINCH_IDLE: PinchState = Object.freeze({ kind: "idle" });

const step = (
  state: PinchState,
  ops: readonly ViewportOp[] = [],
  started = false,
): PinchStep => ({ state, started, ops });

const mid = (a: Point<"viewport">, b: Point<"viewport">): Point<"viewport"> =>
  ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }) as Point<"viewport">;

const dist = (a: Point<"viewport">, b: Point<"viewport">): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

/** Viewport operations that carry the pair `before` to `after`. */
function follow(
  before: readonly [Point<"viewport">, Point<"viewport">],
  after: readonly [Point<"viewport">, Point<"viewport">],
): ViewportOp[] {
  const m0 = mid(before[0], before[1]);
  const m1 = mid(after[0], after[1]);
  const d0 = dist(before[0], before[1]);
  const d1 = dist(after[0], after[1]);
  const ops: ViewportOp[] = [];
  const factor = d0 > 0 && d1 > 0 ? d1 / d0 : 1;
  if (factor !== 1 && Number.isFinite(factor)) {
    ops.push({ kind: "zoomAt", anchor: m0, factor });
  }
  const dx = m1.x - m0.x;
  const dy = m1.y - m0.y;
  if (dx !== 0 || dy !== 0) ops.push({ kind: "panBy", dx, dy });
  return ops;
}

export function pinchStep(state: PinchState, input: PinchInput): PinchStep {
  switch (state.kind) {
    case "idle":
      return input.type === "down"
        ? step({
            kind: "one",
            touch: { pointerId: input.pointerId, at: input.at },
          })
        : step(state);
    case "one": {
      const id = state.touch.pointerId;
      if (input.type === "up") {
        return step(input.pointerId === id ? PINCH_IDLE : state);
      }
      if (input.pointerId === id) {
        return step({ kind: "one", touch: { pointerId: id, at: input.at } });
      }
      if (input.type === "move") return step(state);
      const b = { pointerId: input.pointerId, at: input.at };
      return step({ kind: "pinching", a: state.touch, b }, [], true);
    }
    case "pinching": {
      const { a, b } = state;
      const isA = input.pointerId === a.pointerId;
      const isB = input.pointerId === b.pointerId;
      if (!isA && !isB) return step(state);
      if (input.type === "up") {
        const left = isA ? b.pointerId : a.pointerId;
        return step({ kind: "spent", down: [left] });
      }
      if (input.type === "down") return step(state);
      const next = isA
        ? { a: { pointerId: a.pointerId, at: input.at }, b }
        : { a, b: { pointerId: b.pointerId, at: input.at } };
      const ops = follow([a.at, b.at], [next.a.at, next.b.at]);
      return step({ kind: "pinching", ...next }, ops);
    }
    case "spent": {
      if (input.type === "move") return step(state);
      const down =
        input.type === "down"
          ? [...state.down, input.pointerId]
          : state.down.filter((id) => id !== input.pointerId);
      return step(down.length === 0 ? PINCH_IDLE : { kind: "spent", down });
    }
  }
}

export interface TouchPinch {
  /** Feed one touch; true when the pinch owns it, so the tools must not see it. */
  feed(input: PinchInput): boolean;
}

/** The pinch machine with its state, for the DOM adapter. */
export function createTouchPinch(host: {
  /** A pinch began: cancel the gesture in progress. */
  cancel(): void;
  viewport(op: ViewportOp): void;
}): TouchPinch {
  let state: PinchState = PINCH_IDLE;
  return {
    feed(input) {
      const before = state.kind;
      const next = pinchStep(state, input);
      state = next.state;
      if (next.started) host.cancel();
      for (const op of next.ops) host.viewport(op);
      return next.started || before === "pinching" || before === "spent";
    },
  };
}
