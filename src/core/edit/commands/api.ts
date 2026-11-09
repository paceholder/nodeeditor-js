/**
 * plan / execute / can.
 *
 * `plan` writes nothing: IDs come from the pure generator and the advanced cursor rides
 * on the patch. `execute` plans and, when ready, submits through the normal pipeline, so
 * commit-time validators apply again. `can` is a plan without a submit.
 */

import type { IdCursor, IdGenerator } from "../../base/ids/id-generator.js";
import { type Rejection, rejectionOf } from "../../base/result.js";
import type { GraphReader } from "../../data/model/reader.js";
import type { NodeTypeRegistry } from "../../data/node-types/registry.js";
import type { Patch } from "../../data/patch/types.js";
import type { PatchValidator } from "../../data/patch/validator.js";
import type {
  HistoryState,
  OperationId,
  Rejected,
  SubmitResult,
} from "../adapter/types.js";
import type { ConnectionPolicy } from "../policy/types.js";
import { proposalsAwaitingVerdict } from "../policy/validator.js";
import { dryRun, stagedAfter } from "./dry-run.js";
import { createIdAllocator } from "./id-allocator.js";
import { planCommand } from "./plan.js";
import { resolveSizeLimits, type SizeLimitPolicy } from "./size-limits.js";
import type {
  Availability,
  Command,
  ExecuteResult,
  FragmentPlanners,
  PlanResult,
} from "./types.js";

/** The slice of a model that the command layer needs. */
export interface CommandHost {
  readonly reader: GraphReader;
  readonly idGenerator: IdGenerator;
  idCursor(): IdCursor;
  submit(patch: Patch, options: { readonly label: string }): SubmitResult;
  undo(): SubmitResult;
  redo(): SubmitResult;
  historyState(): HistoryState;
  mintOperationId(): OperationId;
  /** Publish a `failure` event for a command refused during planning. */
  reportRejection(operationId: OperationId, rejection: Rejection): void;
}

export interface CommandEnvironment {
  readonly registry: NodeTypeRegistry;
  readonly policy: ConnectionPolicy;
  /** Validators that `plan` dry-runs; the same ones registered for commits. */
  readonly validators: readonly PatchValidator[];
  /** Host refinement of the type's size limits. */
  readonly sizeLimits?: SizeLimitPolicy;
  /** Paste and duplicate planners; without them those commands are unsupported. */
  readonly fragments?: FragmentPlanners;
}

export interface CommandApi {
  plan(command: Command): PlanResult;
  execute(command: Command): ExecuteResult;
  can(command: Command): Availability;
}

export function createCommandApi(
  host: CommandHost,
  env: CommandEnvironment,
): CommandApi {
  const history = (direction: "undo" | "redo"): Availability => {
    const state = host.historyState();
    const open = direction === "undo" ? state.canUndo : state.canRedo;
    const why = direction === "undo" ? state.undoReason : state.redoReason;
    return open
      ? { available: true }
      : {
          available: false,
          reason: rejectionOf(
            "history-unavailable",
            why ?? `Nothing to ${direction}`,
          ),
        };
  };

  function plan(command: Command): PlanResult {
    const planned = planCommand(command, {
      reader: host.reader,
      ids: createIdAllocator(host.idGenerator, host.idCursor()),
      registry: env.registry,
      policy: env.policy,
      sizeLimits: (node) =>
        resolveSizeLimits(node, env.registry, env.sizeLimits),
      ...(env.fragments ? { fragments: env.fragments } : {}),
    });
    if (planned.kind === "history") {
      const state = history(planned.direction);
      return state.available
        ? planned
        : { kind: "rejected", error: state.reason };
    }
    if (planned.kind !== "ready") return planned;
    const refused = dryRun(host.reader, planned.patch, env.validators);
    if (!refused) return planned;
    if (refused.code !== "pending-validation") {
      return { kind: "rejected", error: refused };
    }
    // The patch is fine but some connection lacks a host verdict.
    const staged = stagedAfter(host.reader, planned.patch);
    return {
      kind: "pending",
      reason: refused.message,
      missing:
        "code" in staged
          ? []
          : proposalsAwaitingVerdict(env.policy, staged, planned.patch.ops),
    };
  }

  return {
    plan,
    execute(command) {
      const planned = plan(command);
      switch (planned.kind) {
        case "ready":
          return host.submit(planned.patch, { label: planned.label });
        case "history":
          return planned.direction === "undo" ? host.undo() : host.redo();
        case "rejected": {
          const result: Rejected = {
            ok: false,
            status: "rejected",
            operationId: host.mintOperationId(),
            error: planned.error,
          };
          host.reportRejection(result.operationId, result.error);
          return result;
        }
        case "choice":
          return {
            status: "choice-required",
            alternatives: planned.alternatives,
          };
        case "pending":
          return {
            status: "unverified",
            reason: planned.reason,
            missing: planned.missing,
          };
      }
    },
    can(command) {
      const planned = plan(command);
      if (planned.kind === "rejected") {
        return { available: false, reason: planned.error };
      }
      // Unavailable for now: a host verdict is missing. `can` never asks for it.
      if (planned.kind === "pending") {
        return {
          available: false,
          reason: rejectionOf(
            "pending-validation",
            planned.reason,
            planned.missing.flatMap((p) => [p.from.port, p.to.port]),
          ),
        };
      }
      return { available: true };
    },
  };
}
