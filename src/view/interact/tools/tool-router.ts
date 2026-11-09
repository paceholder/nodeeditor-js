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
  /** The tool's `awaiting` for the current state. */
  awaiting(): boolean;
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
        awaiting: () => tool.awaiting?.(state) === true,
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
  /** Counts the gestures started, so a caller can tell one ended even if another began. */
  readonly generation: number;
  /** The pointer of the running gesture; none while it waits with no pointer down. */
  readonly activePointer: number | undefined;
  readonly spaceHeld: boolean;
  /** Whether the active gesture wants auto-pan near the view edge now. */
  autoPanning(): boolean;
  /**
   * A model change was committed: cancels the gesture when an entity it involves was
   * removed or changed, from any origin. Anything else leaves the gesture running.
   */
  changed(change: GestureChange, ctx: ToolContext): RouteResult;
}

const IGNORED: RouteResult = { effects: [], handled: false };

/** DOM `buttons` bit of each `button` value: primary 1, middle 4, secondary 2. */
const BUTTON_BIT = { 0: 1, 1: 4, 2: 2 } as const;

function released(input: PointerInput, button: 0 | 1 | 2): boolean {
  return (
    input.buttons !== undefined && (input.buttons & BUTTON_BIT[button]) === 0
  );
}

export function createToolRouter(tools: readonly ToolSlot[]): ToolRouter {
  let active:
    | { slot: ToolSlot; gesture: Gesture; pointerId: number; button: 0 | 1 | 2 }
    | undefined;
  let space = false;
  let generation = 0;

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
        active = {
          slot,
          gesture,
          pointerId: input.pointerId,
          button: input.button,
        };
        generation++;
      }
      return { effects, handled: true };
    }
    return IGNORED;
  }

  return {
    get activeTool() {
      return active?.slot.id;
    },
    get generation() {
      return generation;
    },
    get activePointer() {
      return active && !active.gesture.awaiting()
        ? active.pointerId
        : undefined;
    },
    get spaceHeld() {
      return space;
    },
    autoPanning: () => active?.gesture.autoPans() === true,
    changed(change, ctx) {
      if (!active) return IGNORED;
      const involved = active.gesture.involved();
      if (involved.length === 0) return IGNORED;
      // Any origin: the gesture computed what it will write from its start, so a change
      // it did not make (undo, a host edit) would be overwritten on release. Its own commit
      // never gets here, because the gesture has ended by the time its commit runs.
      const removed = involved.filter((id) => change.removed.includes(id));
      const touched =
        removed.length === 0
          ? involved.filter((id) => change.changed.includes(id))
          : [];
      const reason: GestureCancelReason | undefined =
        removed.length > 0
          ? "entity-removed"
          : touched.length === 0
            ? undefined
            : change.origin === "external"
              ? "external-change"
              : "entity-changed";
      if (!reason) return IGNORED;
      const result = feed({ type: "cancel", reason }, ctx);
      return {
        ...result,
        cancelled: { reason, ids: removed.length > 0 ? removed : touched },
      };
    },
    handle(input, ctx) {
      switch (input.type) {
        case "pointer-down": {
          if (!active) return press(input, ctx);
          // A gesture that waits with no pointer down gives way to a new press;
          // otherwise one gesture at a time: a second pointer cannot start another (D3).
          if (!active.gesture.awaiting()) return { effects: [], handled: true };
          const ended = feed({ type: "cancel", reason: "new-press" }, ctx);
          const started = press(input, ctx);
          return {
            effects: [...ended.effects, ...started.effects],
            handled: started.handled,
          };
        }
        case "pointer-move":
        case "pointer-up": {
          if (
            active?.pointerId !== input.pointerId ||
            active.gesture.awaiting()
          ) {
            return IGNORED;
          }
          // The release never arrived: a move without the gesture's button cancels it.
          // Committing on a guessed release could write an edit the user did not make.
          if (input.type === "pointer-move" && released(input, active.button)) {
            return feed({ type: "cancel", reason: "button-released" }, ctx);
          }
          return feed(input, ctx);
        }
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
        case "verdict":
          return feed(input, ctx);
      }
    },
  };
}
