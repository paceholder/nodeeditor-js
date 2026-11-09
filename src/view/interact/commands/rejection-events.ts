/**
 * Reports connection refusals to the host (D8). The model stays the authority:
 * this only watches the results of commands that can create a connection (and of undo and
 * redo, which restore one) and hands every structured refusal to `report`. It never
 * changes a result.
 */
import {
  type Command,
  type ExecuteResult,
  type Rejection,
  type RejectionCode,
  rejectionOf,
  type SubmitResult,
} from "../../../core/index.js";
import type { EditableModel } from "./editable-model.js";

/** Commands that create a connection. */
const CONNECTING: ReadonlySet<Command["kind"]> = new Set([
  "connect",
  "reconnect",
  "paste",
  "duplicate",
]);

/** Codes the connection policy and the host validator produce. */
const POLICY_CODES: ReadonlySet<RejectionCode> = new Set([
  "same-port",
  "direction-mismatch",
  "type-mismatch",
  "self-loop",
  "duplicate-connection",
  "capacity-exhausted",
  "pending-validation",
  "validator-failed",
  "validator-timeout",
  "validator-stale",
]);

function refusal(result: ExecuteResult | SubmitResult): Rejection | undefined {
  if (result.status === "rejected") return result.error;
  if (result.status === "unverified") {
    return rejectionOf(
      "pending-validation",
      result.reason,
      result.missing.flatMap((p) => [p.from.port, p.to.port]),
    );
  }
  return undefined;
}

export function observeConnectionRejections(
  model: EditableModel,
  report: (rejection: Rejection) => void,
): EditableModel {
  const watch = (
    result: ExecuteResult | SubmitResult,
    wanted: (rejection: Rejection) => boolean,
  ): void => {
    const rejection = refusal(result);
    if (rejection && wanted(rejection)) report(rejection);
  };
  const policyCode = (r: Rejection): boolean => POLICY_CODES.has(r.code);
  // Inherit everything else from the host's model, whatever its shape (a class instance
  // keeps its prototype methods); only the three result-producing calls are observed.
  return Object.assign(Object.create(model) as EditableModel, {
    execute(command: Command) {
      const result = model.execute(command);
      if (CONNECTING.has(command.kind)) watch(result, () => true);
      return result;
    },
    undo() {
      const result = model.undo();
      watch(result, policyCode);
      return result;
    },
    redo() {
      const result = model.redo();
      watch(result, policyCode);
      return result;
    },
  });
}
