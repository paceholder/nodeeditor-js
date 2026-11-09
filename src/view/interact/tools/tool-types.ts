/**
 * Tool contract (D2). A tool is a pure transition function over a
 * discriminated-union state; it returns the next state plus effects that a runner
 * executes. Nothing in `tools/` touches DOM types, so tools run in Node tests.
 *
 * Experimental: the contract is public but may change before Slice B adds routing tools.
 */

import type {
  Availability,
  CapabilityAction,
  ChoiceAlternative,
  Command,
  Endpoint,
  GeometryScene,
  GraphReader,
  HitCandidate,
  NodeId,
  Point,
  Rejection,
  ResolvedSizeLimits,
  Viewport,
} from "../../../core/index.js";
import { deepFreeze } from "../../platform/deep-freeze.js";
import type {
  ConnectionEvaluation,
  ToolPreview,
} from "../../render/paint/previews/preview-types.js";
import type {
  RouteEditContext,
  RouteEditorRegistry,
} from "../../render/registries/route-editor-registry.js";
import type {
  ReadonlySelection,
  SelectionChange,
} from "../selection/selection-model.js";
import type { ToolOptions } from "./thresholds.js";

export type {
  CandidateState,
  ConnectCandidate,
  ConnectionEvaluation,
  ToolPreview,
} from "../../render/paint/previews/preview-types.js";

export interface Modifiers {
  readonly shift: boolean;
  readonly alt: boolean;
  /** The platform primary modifier: Ctrl, or Cmd on macOS (resolved by the adapter). */
  readonly mod: boolean;
}

export const NO_MODIFIERS: Modifiers = deepFreeze({
  shift: false,
  alt: false,
  mod: false,
});

export type PointerType = "mouse" | "touch" | "pen";

interface PointerFields {
  readonly pointerId: number;
  /** The button that changed (0 primary, 1 middle, 2 secondary); 0 for plain moves. */
  readonly button: 0 | 1 | 2;
  readonly viewport: Point<"viewport">;
  readonly world: Point<"world">;
  readonly modifiers: Modifiers;
  /** Milliseconds; monotonic. */
  readonly time: number;
  readonly pointerType?: PointerType;
}

export type PointerDownInput = PointerFields & {
  readonly type: "pointer-down";
};
export type PointerMoveInput = PointerFields & {
  readonly type: "pointer-move";
};
export type PointerUpInput = PointerFields & { readonly type: "pointer-up" };
export type PointerInput = PointerDownInput | PointerMoveInput | PointerUpInput;

export type CancelReason =
  | "pointercancel"
  | "lost-capture"
  | "escape"
  | "blur"
  | "hidden"
  | "dispose"
  /** The whole document was replaced (a `reset` event). */
  | "reset"
  /** A context menu opened for a press that had not started dragging. */
  | "context-menu"
  /** An entity the gesture involves was removed from the model. */
  | "entity-removed"
  /** An external change touched an entity the gesture involves. */
  | "external-change"
  /** The view was locked. */
  | "locked"
  /** A press started a new gesture while one waited for a host verdict. */
  | "new-press";

/** The reasons a gesture ends without the user asking. */
export type GestureCancelReason = Extract<
  CancelReason,
  "entity-removed" | "external-change" | "locked" | "reset"
>;

/** Why a gesture ended on its own and which entities caused it. */
export interface GestureCancellation {
  readonly reason: GestureCancelReason;
  /** The involved entities that were removed or changed; empty for a reset or a lock. */
  readonly ids: readonly string[];
}

export type ToolInput =
  | PointerInput
  | {
      readonly type: "wheel";
      readonly viewport: Point<"viewport">;
      /** Normalized to CSS pixels by the adapter. */
      readonly deltaY: number;
      readonly modifiers: Modifiers;
    }
  | {
      readonly type: "key-down" | "key-up";
      readonly key: string;
      readonly modifiers: Modifiers;
    }
  | { readonly type: "cancel"; readonly reason: CancelReason }
  /**
   * A host verdict settled, or one a tool may have read went away: evaluations
   * are dropped and a gesture that shows or waits on a pending target re-reads it.
   */
  | { readonly type: "verdict" };

export type ViewportOp =
  | { readonly kind: "panBy"; readonly dx: number; readonly dy: number }
  | {
      readonly kind: "zoomAt";
      readonly anchor: Point<"viewport">;
      readonly factor: number;
    }
  | { readonly kind: "set"; readonly viewport: Viewport };

export type CursorKind =
  | "default"
  | "grab"
  | "grabbing"
  | "move"
  | "crosshair"
  | "not-allowed"
  /** Over or dragging a route handle. */
  | "ew-resize"
  | "ns-resize"
  /** Over or dragging the resize handle (always the screen bottom-right corner). */
  | "nwse-resize";

export type ToolEffect =
  | { readonly type: "capture" | "release"; readonly pointerId: number }
  | { readonly type: "preview"; readonly preview: ToolPreview | null }
  /** Exactly one per gesture. */
  | { readonly type: "commit"; readonly command: Command }
  | { readonly type: "select"; readonly change: SelectionChange }
  | { readonly type: "viewport"; readonly op: ViewportOp }
  | { readonly type: "cursor"; readonly cursor: CursorKind }
  /** Ask the host chooser to pick a policy alternative; the preview stays. */
  | { readonly type: "choose"; readonly request: ChoiceRelease }
  /**
   * Start the host validator for this pair if it has no verdict yet; evaluating never
   * does. Safe to repeat: a request in flight is joined.
   */
  | {
      readonly type: "request-verdict";
      readonly source: Endpoint;
      readonly target: Endpoint;
    }
  /** The gesture now waits for this pair's verdict, and asks for it if none is on its way. */
  | {
      readonly type: "validate-wait";
      readonly source: Endpoint;
      readonly target: Endpoint;
    }
  /** A connection was refused during the gesture; the host may show the reason. */
  | { readonly type: "reject"; readonly rejection: Rejection };

/** What a release on a choice target hands to the choice controller. */
export interface ChoiceRelease {
  readonly source: Endpoint;
  readonly target: Endpoint;
  readonly alternatives: readonly ChoiceAlternative[];
  readonly at: Point<"world">;
}

/** Read-only facade tools query; they never mutate through it. */
export interface ToolContext {
  /** Hit candidates at a world point, best first; tolerances are CSS pixels. */
  pick(world: Point<"world">): HitCandidate[];
  readonly reader: GraphReader;
  readonly scene: Pick<GeometryScene, "queryRect" | "node" | "connection">;
  readonly selection: ReadonlySelection;
  readonly viewport: Viewport;
  readonly zoom: number;
  /** Zoom range the view allows; wheel zoom stays inside it. */
  readonly zoomRange: { readonly min: number; readonly max: number };
  can(action: CapabilityAction, id: NodeId): Availability;
  /** Size limits a resize of the node must respect; defaults when unknown. */
  sizeLimits(id: NodeId): ResolvedSizeLimits;
  /**
   * The connection policy's verdict for `from` -> `to`, mapped to a presentation state.
   * Cached per candidate pair until the model revision changes.
   */
  evaluateConnection(from: Endpoint, to: Endpoint): ConnectionEvaluation;
  readonly options: ToolOptions;
  /** A host connection chooser is installed. */
  readonly chooserInstalled: boolean;
  /**
   * A host validator can answer pending connections. Without one a pending
   * target is never waited for, since no verdict would ever arrive.
   */
  readonly verdictsInstalled: boolean;
  /** Route editor per connection kind. */
  readonly routeEditors: Pick<RouteEditorRegistry, "get">;
  /** Re-route a connection entry through other constraints; none: undefined. */
  reroute: RouteEditContext["reroute"];
}

export interface PressInfo {
  readonly input: PointerInput;
  /** Candidates under the press, best first. */
  readonly hits: readonly HitCandidate[];
  readonly spaceHeld: boolean;
}

export interface Transition<S> {
  readonly state: S;
  readonly effects: readonly ToolEffect[];
}

export interface Tool<S> {
  readonly id: string;
  readonly idle: S;
  /** The router consults this on pointer-down, in precedence order. */
  accepts(press: PressInfo, ctx: ToolContext): boolean;
  transition(state: S, input: ToolInput, ctx: ToolContext): Transition<S>;
  isIdle(state: S): boolean;
  /**
   * Whether this state drags something the view should auto-pan for near an edge.
   * Omitted: never. Pan tools never do.
   */
  autoPans?(state: S): boolean;
  /**
   * The IDs of the nodes, ports and connections a gesture in this state reads or will
   * write. The router cancels the gesture when one of them is removed, or changed
   * by an external change. Omitted: the gesture involves nothing (pan, marquee).
   */
  involved?(state: S): readonly string[];
  /**
   * True while the gesture waits for an answer with no pointer down. A press
   * then cancels it first and starts normally, and no pointer counts as active.
   */
  awaiting?(state: S): boolean;
}
