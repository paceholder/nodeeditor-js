/**
 * Preview data shapes (INT-05a, PRT-06): what a gesture asks the interaction layer to
 * draw. Tools produce them and the preview painters consume them, so they live with the
 * painters and tools import them from here. Never serialized.
 */
import type {
  Endpoint,
  NodeId,
  Point,
  Rect,
  RejectionCode,
  ResizeFixed,
  Size,
  Vec2,
} from "../../../../core/index.js";

/** How a drop target is presented while connecting (PRT-06, D7). */
export type CandidateState =
  | "compatible"
  | "incompatible"
  | "occupied"
  | "unavailable"
  | "pending";

export interface ConnectionEvaluation {
  readonly state: CandidateState;
  /** Compatible, and the port already carries connections its limit still allows. */
  readonly occupiedMark: boolean;
  /** The policy's reason for any state other than `compatible`. */
  readonly reason: string | undefined;
  readonly code: RejectionCode | undefined;
}

export interface ConnectCandidate {
  readonly endpoint: Endpoint;
  readonly evaluation: ConnectionEvaluation;
}

/** A gesture preview, drawn on the interaction layer only; never serialized. */
export type ToolPreview =
  | {
      readonly kind: "marquee";
      readonly rect: Rect<"world">;
      /** `contain` paints solid, `intersect` dashed (UX-02). */
      readonly mode: "contain" | "intersect";
    }
  | {
      readonly kind: "move";
      readonly offset: Vec2;
      readonly moving: readonly NodeId[];
      /** Selected nodes that stay put because a capability denies the move. */
      readonly locked: readonly NodeId[];
    }
  /** A node at a preview size, with `fixed` held in place (INT-10, NOD-04a). */
  | {
      readonly kind: "resize";
      readonly node: NodeId;
      readonly size: Size;
      /** The anchored centre for `size`; what the commit will store. */
      readonly position: Vec2;
      readonly fixed: ResizeFixed;
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
