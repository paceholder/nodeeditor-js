/**
 * Tool router (D3). Holds the single active gesture, picks the tool on
 * pointer-down by fixed precedence, ignores foreign pointer IDs while a gesture runs, and
 * routes every cancellation source to the active tool. The router is pure bookkeeping:
 * it returns effects and never executes them.
 */
import type {
  PointerInput,
  PressInfo,
  Tool,
  ToolContext,
  ToolEffect,
  ToolInput,
} from "./tool-types.js";
import { wheelZoom } from "./wheel-zoom.js";

/** A tool with its state type erased, so differently-typed tools share one list. */
export interface ToolSlot {
  readonly id: string;
  accepts(press: PressInfo, ctx: ToolContext): boolean;
  begin(): Gesture;
}

export interface Gesture {
  step(input: ToolInput, ctx: ToolContext): readonly ToolEffect[];
  isIdle(): boolean;
}

export function toolSlot<S>(tool: Tool<S>): ToolSlot {
  return {
    id: tool.id,
    accepts: (press, ctx) => tool.accepts(press, ctx),
    begin() {
      let state = tool.idle;
      return {
        step(input, ctx) {
          const next = tool.transition(state, input, ctx);
          state = next.state;
          return next.effects;
        },
        isIdle: () => tool.isIdle(state),
      };
    },
  };
}

export interface RouteResult {
  readonly effects: readonly ToolEffect[];
  /**
   * False when the input was not used and the host should let the default happen: an
   * unclaimed press (context menu), or a wheel that did not change the viewport.
   */
  readonly handled: boolean;
}

export interface ToolRouter {
  /** Tools are consulted in this order on pointer-down. */
  handle(input: ToolInput, ctx: ToolContext): RouteResult;
  readonly activeTool: string | undefined;
  readonly activePointer: number | undefined;
  readonly spaceHeld: boolean;
}

const IGNORED: RouteResult = { effects: [], handled: false };

export function createToolRouter(tools: readonly ToolSlot[]): ToolRouter {
  let active:
    | { slot: ToolSlot; gesture: Gesture; pointerId: number }
    | undefined;
  let space = false;

  function feed(input: ToolInput, ctx: ToolContext): RouteResult {
    if (!active) return IGNORED;
    const effects = [...active.gesture.step(input, ctx)];
    if (active.gesture.isIdle()) {
      effects.push({ type: "release", pointerId: active.pointerId });
      active = undefined;
    }
    return { effects, handled: true };
  }

  function press(input: PointerInput, ctx: ToolContext): RouteResult {
    const info = { input, hits: ctx.pick(input.world), spaceHeld: space };
    for (const slot of tools) {
      if (!slot.accepts(info, ctx)) continue;
      const gesture = slot.begin();
      const effects: ToolEffect[] = [
        { type: "capture", pointerId: input.pointerId },
        ...gesture.step(input, ctx),
      ];
      if (gesture.isIdle()) {
        effects.push({ type: "release", pointerId: input.pointerId });
      } else {
        active = { slot, gesture, pointerId: input.pointerId };
      }
      return { effects, handled: true };
    }
    return IGNORED;
  }

  return {
    get activeTool() {
      return active?.slot.id;
    },
    get activePointer() {
      return active?.pointerId;
    },
    get spaceHeld() {
      return space;
    },
    handle(input, ctx) {
      switch (input.type) {
        case "pointer-down":
          // One gesture at a time: a second pointer cannot start another (D3).
          return active ? { effects: [], handled: true } : press(input, ctx);
        case "pointer-move":
        case "pointer-up":
          return active?.pointerId === input.pointerId
            ? feed(input, ctx)
            : IGNORED;
        case "wheel":
          // Wheel zoom stays available during a gesture, anchored at the cursor.
          return wheelZoom(input, ctx);
        case "key-down":
          if (input.key === " ") space = true;
          if (input.key === "Escape" && active) {
            return feed({ type: "cancel", reason: "escape" }, ctx);
          }
          return IGNORED;
        case "key-up":
          if (input.key === " ") space = false;
          return IGNORED;
        case "cancel":
        case "entities-removed":
          return feed(input, ctx);
      }
    },
  };
}
