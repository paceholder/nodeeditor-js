/**
 * Command and plan types (PAT-04, PAT-05, PAT-08).
 *
 * A command is intent. A planner turns it into a complete patch plus a summary of its
 * effects without applying anything, so previews cost no state.
 */

import type { IdGenerator } from "../../base/ids/id-generator.js";
import type { ConnectionId, NodeId, PortId } from "../../base/ids/ids.js";
import type { Rejection, RejectionCode } from "../../base/result.js";
import type { GraphReader } from "../../data/model/reader.js";
import type { Endpoint, Payload } from "../../data/model/records.js";
import type { Vec2 } from "../../data/model/values.js";
import type { PortSpec } from "../../data/node-types/definition.js";
import type { NodeTypeRegistry } from "../../data/node-types/registry.js";
import type { Patch } from "../../data/patch/types.js";
import type { SubmitResult } from "../adapter/types.js";
import type { ConnectionPlan, ConnectionPolicy } from "../policy/types.js";
import type { IdAllocator } from "./id-allocator.js";

/**
 * Where a pasted or duplicated fragment lands (EDT-03). `center` puts the fragment's
 * bounding-box centre at `at`; `offset` adds `by` to every original position.
 */
export type Placement =
  | { readonly kind: "center"; readonly at: Vec2 }
  | { readonly kind: "offset"; readonly by: Vec2 };

/** External connections of a fragment: dropped (default) or re-created (EDT-04). */
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
  | { readonly kind: "mirrorNodes"; readonly nodes: readonly NodeId[] }
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
  /**
   * Paste a clipboard fragment (EDT-03, EDT-05). The fragment is untrusted input and is
   * validated by the planner, like `loadSnapshot(input: unknown)`.
   */
  | {
      readonly kind: "paste";
      readonly fragment: unknown;
      readonly placement: Placement;
      readonly external?: ExternalHandling;
    }
  /** Copy the listed nodes and their internal connections in one step (EDT-03). */
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
 * A reference a paste left out (EDT-04): an external connection, with `external` as the
 * reason under the default, or `endpoint-missing` / the policy's code when preserving
 * failed.
 */
export interface ExcludedReference {
  readonly connection: ConnectionId;
  readonly reason: "external" | "endpoint-missing" | RejectionCode;
}

/** What a plan would do, for previews and confirmations (PRT-07, EDT-02). */
export interface PlanEffects {
  readonly created: EntityIds;
  readonly removed: EntityIds;
  readonly updated: EntityIds;
  /** References a paste or duplicate did not re-create (EDT-04). */
  readonly excluded?: readonly ExcludedReference[];
}

export interface ChoiceAlternative {
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
  | { readonly kind: "rejected"; readonly error: Rejection }
  /** The policy needs the caller to pick one of several plans (CON-04). */
  | {
      readonly kind: "choice";
      readonly alternatives: readonly ChoiceAlternative[];
    }
  /** Validation has not finished (CON-04). */
  | { readonly kind: "pending"; readonly reason: string }
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
  | { readonly status: "unverified"; readonly reason: string };

export type Availability =
  | { readonly available: true }
  | { readonly available: false; readonly reason: Rejection };

/** Everything a planner may read. Planners never write. */
export interface PlanContext {
  readonly reader: GraphReader;
  readonly ids: IdAllocator;
  readonly registry: NodeTypeRegistry;
  readonly policy: ConnectionPolicy;
  /** Paste and duplicate planners, injected by the facade (they live in `core/io`). */
  readonly fragments?: FragmentPlanners;
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
