/**
 * Tool contract (INT-05a, D2). A tool is a pure transition function over a
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
  ResolvedSizeLimits,
  Viewport,
} from "../../../core/index.js";
import type {
  ConnectionEvaluation,
  ToolPreview,
} from "../../render/paint/previews/preview-types.js";
import type { RouteEditorRegistry } from "../../render/registries/route-editor-registry.js";
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

export const NO_MODIFIERS: Modifiers = { shift: false, alt: false, mod: false };

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
  /** A context menu opened for a press that had not started dragging (INT-11b). */
  | "context-menu";

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
  | { readonly type: "entities-removed"; readonly ids: readonly string[] };

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
  /** Over or dragging a route handle (ROU-03c). */
  | "ew-resize"
  | "ns-resize"
  /** Over or dragging the resize handle (always the screen bottom-right corner). */
  | "nwse-resize";

export type ToolEffect =
  | { readonly type: "capture" | "release"; readonly pointerId: number }
  | { readonly type: "preview"; readonly preview: ToolPreview | null }
  /** Exactly one per gesture (INT-08). */
  | { readonly type: "commit"; readonly command: Command }
  | { readonly type: "select"; readonly change: SelectionChange }
  | { readonly type: "viewport"; readonly op: ViewportOp }
  | { readonly type: "cursor"; readonly cursor: CursorKind }
  /** Ask the host chooser to pick a policy alternative; the preview stays (INT-12). */
  | { readonly type: "choose"; readonly request: ChoiceRelease };

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
  can(action: CapabilityAction, id: NodeId): Availability;
  /** Size limits a resize of the node must respect (NOD-04a); defaults when unknown. */
  sizeLimits(id: NodeId): ResolvedSizeLimits;
  /**
   * The connection policy's verdict for `from` -> `to`, mapped to a presentation state.
   * Cached per candidate pair until the model revision changes (TXN-05).
   */
  evaluateConnection(from: Endpoint, to: Endpoint): ConnectionEvaluation;
  readonly options: ToolOptions;
  /** A host connection chooser is installed (INT-12, INT-12b). */
  readonly chooserInstalled: boolean;
  /** Route editor per connection kind (ROU-03b). */
  readonly routeEditors: Pick<RouteEditorRegistry, "get">;
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
   * Whether this state drags something the view should auto-pan for near an edge
   * (INT-09). Omitted: never. Pan tools never do.
   */
  autoPans?(state: S): boolean;
}
