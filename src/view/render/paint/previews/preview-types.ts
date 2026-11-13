/**
 * Preview data shapes: what a gesture asks the interaction layer to
 * draw. Tools produce them and the preview painters consume them, so they live with the
 * painters and tools import them from here. Never serialized.
 */
import type {
  ChoiceAlternative,
  ConnectionId,
  Endpoint,
  GroupId,
  NodeId,
  Point,
  Rect,
  RejectionCode,
  ResizeFixed,
  RouteConstraint,
  Size,
  Vec2,
} from "../../../../core/index.js";

/** How a drop target is presented while connecting (D7). */
export type CandidateState =
  | "compatible"
  | "incompatible"
  | "occupied"
  | "unavailable"
  | "pending"
  /** The policy offers several alternatives; a host chooser picks one. */
  | "choice";

export interface ConnectionEvaluation {
  readonly state: CandidateState;
  /** Compatible, and the port already carries connections its limit still allows. */
  readonly occupiedMark: boolean;
  /** The policy's reason for any state other than `compatible`. */
  readonly reason: string | undefined;
  readonly code: RejectionCode | undefined;
  /** The policy's alternatives, in policy order, for the `choice` state only. */
  readonly alternatives?: readonly ChoiceAlternative[];
}

export interface ConnectCandidate {
  readonly endpoint: Endpoint;
  readonly evaluation: ConnectionEvaluation;
}

/** One group frame of a move preview. */
export interface GroupFramePreview {
  readonly group: GroupId;
  /** Members after the drop, in node order. */
  readonly members: readonly NodeId[];
  /** A dragged node will join this group. */
  readonly joining: boolean;
}

/** A gesture preview, drawn on the interaction layer only; never serialized. */
export type ToolPreview =
  | {
      readonly kind: "marquee";
      readonly rect: Rect<"world">;
      /** `contain` paints solid, `intersect` dashed. */
      readonly mode: "contain" | "intersect";
    }
  | {
      readonly kind: "move";
      readonly offset: Vec2;
      readonly moving: readonly NodeId[];
      /** Selected nodes that stay put because a capability denies the move. */
      readonly locked: readonly NodeId[];
      /**
       * Group frames as they will be after the drop: every group a moved node belongs
       * to, leaves or joins, with the members it will then have. Omitted: none.
       */
      readonly groups?: readonly GroupFramePreview[];
    }
  /** A node at a preview size, with `fixed` held in place. */
  | {
      readonly kind: "resize";
      readonly node: NodeId;
      readonly size: Size;
      /** The anchored centre for `size`; what the commit will store. */
      readonly position: Vec2;
      readonly fixed: ResizeFixed;
    }
  /** A connection re-routed through tentative constraints while a handle is dragged. */
  | {
      readonly kind: "route";
      readonly connection: ConnectionId;
      readonly route: readonly RouteConstraint[];
    }
  | {
      readonly kind: "connect";
      readonly source: Endpoint;
      readonly pointer: Point<"world">;
      /** Nearest compatible candidate the path snaps to; release there connects. */
      readonly target: Endpoint | undefined;
      /** Ports inside the capture radius, nearest first; the first one is hovered. */
      readonly candidates: readonly ConnectCandidate[];
    };
