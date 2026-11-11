/**
 * Command and plan types.
 *
 * A command is intent. A planner turns it into a complete patch plus a summary of its
 * effects without applying anything, so previews cost no state.
 */

import type { IdGenerator } from "../../base/ids/id-generator.js";
import type {
  ConnectionId,
  NodeId,
  OperationId,
  PortId,
} from "../../base/ids/ids.js";
import type { Rejection, RejectionCode } from "../../base/result.js";
import type { MirrorAxis, ResizeFixed } from "../../data/model/node-frame.js";
import type { GraphReader } from "../../data/model/reader.js";
import type {
  Endpoint,
  NodeRecord,
  Payload,
  RouteConstraint,
} from "../../data/model/records.js";
import type { Size, Vec2 } from "../../data/model/values.js";
import type { PortSpec } from "../../data/node-types/definition.js";
import type { NodeTypeRegistry } from "../../data/node-types/registry.js";
import type { Patch } from "../../data/patch/types.js";
import type { SubmitResult } from "../adapter/types.js";
import type { DelegatedIntent } from "../intents/delegated-types.js";
import type { ConnectionPlan, ConnectionPolicy } from "../policy/types.js";
import type { VerdictProposal } from "../policy/verdict-types.js";
import type { IdAllocator } from "./id-allocator.js";
import type { ResolvedSizeLimits } from "./size-limits.js";

/**
 * Where a pasted or duplicated fragment lands. `center` puts the fragment's
 * bounding-box centre at `at`; `offset` adds `by` to every original position.
 */
export type Placement =
  | { readonly kind: "center"; readonly at: Vec2 }
  | { readonly kind: "offset"; readonly by: Vec2 };

/** External connections of a fragment: dropped (default) or re-created. */
export type ExternalHandling = "exclude" | "preserve";

/** Desired state of one port in `setPorts`. An `id` updates that port; none adds one. */
export interface PortEdit extends PortSpec {
  readonly id?: PortId;
}

export type Command =
  | {
      readonly kind: "createNode";
      readonly type: string;
      readonly position: Vec2;
      readonly payload?: Payload;
      readonly title?: string;
    }
  | {
      readonly kind: "deleteEntities";
      readonly nodes?: readonly NodeId[];
      readonly connections?: readonly ConnectionId[];
    }
  | {
      readonly kind: "connect";
      readonly from: Endpoint;
      readonly to: Endpoint;
      readonly connectionKind?: string;
      /** The key of the policy alternative to create. */
      readonly choice?: string;
    }
  | {
      readonly kind: "reconnect";
      readonly connection: ConnectionId;
      readonly end: "from" | "to";
      readonly target: Endpoint;
    }
  | { readonly kind: "disconnect"; readonly connection: ConnectionId }
  | {
      readonly kind: "moveNodes";
      readonly moves: readonly {
        readonly node: NodeId;
        readonly position: Vec2;
      }[];
    }
  /** `turns` are clockwise quarter turns. */
  | {
      readonly kind: "rotateNodes";
      readonly nodes: readonly NodeId[];
      readonly turns: 1 | -1;
    }
  /**
   * Set a node's size with the local point `fixed` (default: the centre) kept in place
   * in world space, for any rotation and mirroring.
   */
  | {
      readonly kind: "resizeNode";
      readonly node: NodeId;
      readonly size: Size;
      readonly fixed?: ResizeFixed;
    }
  /**
   * Mirror each node about its own centre in screen axes: `horizontal` (the
   * default) swaps screen-left and screen-right, `vertical` swaps top and bottom, for
   * any rotation. Stored as a toggled `mirrored` flag plus the matching `rotation`.
   */
  | {
      readonly kind: "mirrorNodes";
      readonly nodes: readonly NodeId[];
      readonly axis?: MirrorAxis;
    }
  | {
      readonly kind: "reorderNodes";
      readonly nodes: readonly NodeId[];
      readonly to: "front" | "back";
    }
  | {
      readonly kind: "setPorts";
      readonly node: NodeId;
      readonly ports: readonly PortEdit[];
      /** What to do with connections that a port edit removes or invalidates. */
      readonly affected: "remove" | "reject";
    }
  | {
      readonly kind: "updateNode";
      readonly node: NodeId;
      readonly title?: string;
      readonly status?: string;
      readonly payload?: Payload;
    }
  /** Replace a connection's route constraints; an empty list clears them. */
  | {
      readonly kind: "setRoute";
      readonly connection: ConnectionId;
      readonly route: readonly RouteConstraint[];
    }
  /** Clear the constraints of every listed connection that has some. */
  | {
      readonly kind: "resetRoutes";
      readonly connections: readonly ConnectionId[];
    }
  /**
   * Paste a clipboard fragment. The fragment is untrusted input and is
   * validated by the planner, like `loadSnapshot(input: unknown)`.
   */
  | {
      readonly kind: "paste";
      readonly fragment: unknown;
      readonly placement: Placement;
      readonly external?: ExternalHandling;
    }
  /** Copy the listed nodes and their internal connections in one step. */
  | {
      readonly kind: "duplicate";
      readonly nodes: readonly NodeId[];
      readonly placement: Placement;
      readonly external?: ExternalHandling;
    }
  | { readonly kind: "undo" }
  | { readonly kind: "redo" };

export type CommandKind = Command["kind"];

export interface EntityIds {
  readonly nodes: readonly NodeId[];
  readonly ports: readonly PortId[];
  readonly connections: readonly ConnectionId[];
}

/**
 * A reference a paste left out: an external connection, with `external` as the
 * reason under the default, or `endpoint-missing` / the policy's code when preserving
 * failed.
 */
export interface ExcludedReference {
  readonly connection: ConnectionId;
  readonly reason: "external" | "endpoint-missing" | RejectionCode;
}

/** What a plan would do, for previews and confirmations. */
export interface PlanEffects {
  readonly created: EntityIds;
  readonly removed: EntityIds;
  readonly updated: EntityIds;
  /** References a paste or duplicate did not re-create. */
  readonly excluded?: readonly ExcludedReference[];
}

export interface ChoiceAlternative {
  /** The policy's alternative key; pass it back as `connect.choice`. */
  readonly key: string;
  /** The policy's label, else a short endpoint description. */
  readonly label: string;
  readonly plan: ConnectionPlan;
}

export type PlanResult =
  | {
      readonly kind: "ready";
      readonly patch: Patch;
      readonly label: string;
      readonly effects: PlanEffects;
    }
  | { readonly kind: "rejected"; readonly rejection: Rejection }
  /** The policy needs the caller to pick one of several plans. */
  | {
      readonly kind: "choice";
      readonly alternatives: readonly ChoiceAlternative[];
    }
  /**
   * Validation has not finished. `missing` lists, as the plans the host would be
   * asked about, the connections that still need a verdict, so the caller can obtain them
   * (`verifyConnections`) and repeat the command.
   */
  | {
      readonly kind: "pending";
      readonly reason: string;
      readonly missing: readonly VerdictProposal[];
    }
  /**
   * The adapter names nodes on the host: a creation is handed over as an intent instead
   * of a patch, and nothing is created locally. `excluded` lists the references a
   * delegated paste or duplicate left out of the intent.
   */
  | {
      readonly kind: "delegated";
      readonly intent: DelegatedIntent;
      readonly label: string;
      readonly excluded?: readonly ExcludedReference[];
    }
  /** Undo and redo are carried out by the history, not by a patch of their own. */
  | {
      readonly kind: "history";
      readonly direction: "undo" | "redo";
      readonly label: string;
    };

export type ExecuteResult =
  | SubmitResult
  | {
      readonly status: "choice-required";
      readonly alternatives: readonly ChoiceAlternative[];
    }
  | {
      readonly status: "unverified";
      readonly reason: string;
      /** The plans that lack a host verdict; nothing was created. */
      readonly missing: readonly VerdictProposal[];
    };

export type Availability =
  | { readonly available: true }
  | { readonly available: false; readonly rejection: Rejection };

/** Everything a planner may read. Planners never write. */
export interface PlanContext {
  readonly reader: GraphReader;
  readonly ids: IdAllocator;
  readonly registry: NodeTypeRegistry;
  readonly policy: ConnectionPolicy;
  /** Resolved size limits of a node: library default, type, host hook. */
  sizeLimits(node: NodeRecord): ResolvedSizeLimits;
  /** Paste and duplicate planners, injected by the facade (they live in `core/io`). */
  readonly fragments?: FragmentPlanners;
  /**
   * Present when the adapter's nodes are named by the host (`nodeCreation: "delegated"`):
   * creation planners then mint no node or port ID and return a `delegated` plan whose
   * intent carries an operation ID from here.
   */
  readonly delegation?: { operationId(): OperationId };
}

export type PlannerFor<K extends CommandKind> = (
  command: Extract<Command, { kind: K }>,
  ctx: PlanContext,
) => PlanResult;

/** The fragment planners `planCommand` dispatches `paste` and `duplicate` to. */
export interface FragmentPlanners {
  readonly paste: PlannerFor<"paste">;
  readonly duplicate: PlannerFor<"duplicate">;
}

export type { IdGenerator };
