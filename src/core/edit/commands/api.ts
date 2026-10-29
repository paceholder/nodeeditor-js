/**
 * plan / execute / can (PAT-04, PAT-05, PAT-08, CON-04).
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
import { dryRun } from "./dry-run.js";
import { createIdAllocator } from "./id-allocator.js";
import { planCommand } from "./plan.js";
import type {
  Availability,
  Command,
  ExecuteResult,
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
  /** Publish a `failure` event for a command refused during planning (TXN-10). */
  reportRejection(operationId: OperationId, rejection: Rejection): void;
}

export interface CommandEnvironment {
  readonly registry: NodeTypeRegistry;
  readonly policy: ConnectionPolicy;
  /** Validators that `plan` dry-runs; the same ones registered for commits. */
  readonly validators: readonly PatchValidator[];
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
    });
    if (planned.kind === "history") {
      const state = history(planned.direction);
      return state.available
        ? planned
        : { kind: "rejected", error: state.reason };
    }
    if (planned.kind !== "ready") return planned;
    const refused = dryRun(host.reader, planned.patch, env.validators);
    return refused ? { kind: "rejected", error: refused } : planned;
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
          return { status: "unverified", reason: planned.reason };
      }
    },
    can(command) {
      const planned = plan(command);
      return planned.kind === "rejected"
        ? { available: false, reason: planned.error }
        : { available: true };
    },
  };
}
