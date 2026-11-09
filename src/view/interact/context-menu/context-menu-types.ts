/**
 * Context-menu event payload (D2): plain data by stable IDs, no DOM event, so a
 * host builds and places its own menu the same way for mouse, pen, touch and keyboard.
 */
import type {
  ConnectionId,
  HitCandidate,
  NodeId,
  Point,
  PortId,
  Rejection,
  Viewport,
} from "../../../core/index.js";
import type { HoverEvent } from "../hover/hover-types.js";
import type { SelectionState } from "../selection/view-selection.js";
import type { GestureCancellation, Modifiers } from "../tools/tool-types.js";

/** What the menu was opened on: the topmost hit, or the canvas. */
export type ContextMenuTarget =
  | { readonly kind: "node"; readonly node: NodeId }
  | { readonly kind: "port"; readonly node: NodeId; readonly port: PortId }
  | {
      readonly kind: "connection";
      readonly connection: ConnectionId;
      readonly member?: string;
    }
  | { readonly kind: "canvas" };

export type ContextMenuInvocation = "mouse" | "pen" | "touch" | "keyboard";

export interface ContextMenuEvent {
  readonly target: ContextMenuTarget;
  /** The ordered hits under the point, topmost first; empty for keyboard. */
  readonly hits: readonly HitCandidate[];
  /** The selection after the select-on-open rule, in selection order. */
  readonly selection: {
    readonly nodes: readonly NodeId[];
    readonly connections: readonly ConnectionId[];
  };
  readonly invocation: ContextMenuInvocation;
  readonly modifiers: Modifiers;
  /** Positions for placing a menu: page DOM, a `viewport` overlay anchor, or the world. */
  readonly client: { readonly x: number; readonly y: number };
  readonly viewport: Point<"viewport">;
  readonly world: Point<"world">;
}

/** Events the view handle raises through `view.on`. */
export interface ViewEventMap {
  readonly "context-menu": ContextMenuEvent;
  /** The hovered entity changed. */
  readonly hover: HoverEvent;
  /** The view lock changed. */
  readonly lock: { readonly locked: boolean };
  /**
   * The viewport changed: at most once per animation frame, after painting, and
   * not when it ended the frame where it started.
   */
  readonly viewport: Viewport;
  /** The selection changed, or only which entity is primary. */
  readonly selection: SelectionState;
  /**
   * What a command can do may have changed for a reason no other event reports:
   * a command was registered or removed, the clipboard buffer was filled, or the zoom
   * limits moved. A toolbar re-reads command availability on it.
   */
  readonly availability: AvailabilityEvent;
  /**
   * A connection was refused by a verdict, by the policy or at commit: during a
   * pointer gesture, or from a view command. The model is unchanged.
   */
  readonly "connection-rejected": ConnectionRejectedEvent;
  /** A gesture ended because of a change to what it involves, or a lock. */
  readonly "gesture-cancelled": GestureCancelledEvent;
}

export interface ConnectionRejectedEvent {
  readonly rejection: Rejection;
  /** `gesture`: a pointer gesture; `command`: the result of a view command. */
  readonly source: "gesture" | "command";
}

/** Why a gesture was cancelled and the involved entities that caused it. */
export type GestureCancelledEvent = GestureCancellation;

export interface AvailabilityEvent {
  readonly cause: "commands" | "clipboard" | "zoom-limits";
}
