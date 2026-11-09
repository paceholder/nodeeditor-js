/**
 * Tool router (D3). Holds the single active gesture, picks the tool on
 * pointer-down by fixed precedence, ignores foreign pointer IDs while a gesture runs, and
 * routes every cancellation source to the active tool. The router is pure bookkeeping:
 * it returns effects and never executes them.
 */
import type {
  GestureCancellation,
  GestureCancelReason,
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
  /** The tool's `autoPans` for the current state. */
  autoPans(): boolean;
  /** The entities the gesture involves in its current state. */
  involved(): readonly string[];
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
        autoPans: () => tool.autoPans?.(state) === true,
        involved: () => tool.involved?.(state) ?? [],
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
  /** Set when the router ended the gesture itself because of a model change. */
  readonly cancelled?: GestureCancellation;
}

/** What a committed model change means to a running gesture. */
export interface GestureChange {
  /** IDs of the entities the change removed. */
  readonly removed: readonly string[];
  /** IDs of every entity the change added, removed or updated. */
  readonly changed: readonly string[];
  readonly origin: "local" | "undo" | "redo" | "external";
}

export interface ToolRouter {
  /** Tools are consulted in this order on pointer-down. */
  handle(input: ToolInput, ctx: ToolContext): RouteResult;
  readonly activeTool: string | undefined;
  readonly activePointer: number | undefined;
  readonly spaceHeld: boolean;
  /** Whether the active gesture wants auto-pan near the view edge now. */
  autoPanning(): boolean;
  /**
   * A model change was committed: cancels the gesture when an entity it involves was
   * removed (any origin) or changed by an external change. Anything else leaves
   * the gesture running.
   */
  changed(change: GestureChange, ctx: ToolContext): RouteResult;
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
    autoPanning: () => active?.gesture.autoPans() === true,
    changed(change, ctx) {
      if (!active) return IGNORED;
      const involved = active.gesture.involved();
      if (involved.length === 0) return IGNORED;
      const removed = involved.filter((id) => change.removed.includes(id));
      const touched =
        removed.length === 0 && change.origin === "external"
          ? involved.filter((id) => change.changed.includes(id))
          : [];
      const reason: GestureCancelReason | undefined =
        removed.length > 0
          ? "entity-removed"
          : touched.length > 0
            ? "external-change"
            : undefined;
      if (!reason) return IGNORED;
      const result = feed({ type: "cancel", reason }, ctx);
      return {
        ...result,
        cancelled: { reason, ids: removed.length > 0 ? removed : touched },
      };
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
          return feed(input, ctx);
      }
    },
  };
}
