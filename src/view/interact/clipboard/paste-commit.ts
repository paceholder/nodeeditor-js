/**
 * Execute a paste or duplicate and select what it created (D9).
 *
 * The model plans once for the report (created IDs, excluded references) and then
 * executes the same command; IDs are deterministic for an unchanged cursor, so both see
 * the same patch. An accepted result selects the new nodes and connections at once; a
 * pending one (external authority) selects them when it settles accepted. A delegated one
 * (the host names the nodes) reports nothing created, since the host creates it. A
 * pending paste or duplicate that the authority later refuses hands that refusal,
 * unchanged, to `refused`; nothing was created.
 */
import {
  type ChangedIds,
  type Command,
  type ExcludedReference,
  type ExecuteResult,
  err,
  ok,
  type Rejection,
  rejectionOf,
} from "../../../core/index.js";
import type { EditableModel } from "../commands/editable-model.js";
import type { PasteOutcome } from "./clipboard-types.js";

const NOTHING: ChangedIds = {
  nodes: [],
  ports: [],
  connections: [],
  groups: [],
};

/** What a commit reports besides its outcome. */
export interface CommitReports {
  /** Select what an accepted paste or duplicate created. */
  readonly select: (created: ChangedIds) => void;
  /** A pending paste or duplicate was refused by the authority later. */
  readonly refused: (rejection: Rejection) => void;
}

/**
 * Report the later outcome of a deferred result. Without `created` (a delegated
 * creation) an acceptance selects nothing, so the user's selection stays.
 */
function whenSettled(
  result: Extract<ExecuteResult, { readonly settled: unknown }>,
  reports: CommitReports,
  created?: ChangedIds,
): void {
  void result.settled.then((settled) => {
    if (settled.status === "accepted") {
      if (created) reports.select(created);
    } else if (settled.status === "rejected")
      reports.refused(settled.rejection);
  });
}

/**
 * The host creates the fragment and names what it creates, so nothing is known or
 * selected here; the created entities arrive with a later push.
 */
function delegated(
  model: EditableModel,
  command: Command,
  excluded: readonly ExcludedReference[],
  reports: CommitReports,
): PasteOutcome {
  const result = model.execute(command);
  switch (result.status) {
    case "accepted":
      return ok({ status: "accepted", created: NOTHING, excluded });
    case "queued":
    case "pending":
      whenSettled(result, reports);
      return ok({ status: "pending", created: NOTHING, excluded });
    case "rejected":
      return err(result.rejection);
    case "choice-required":
      return err(rejectionOf("choice-required", "A choice is required"));
    case "unverified":
      return err(rejectionOf("pending-validation", result.reason));
  }
}

export function executeAndSelect(
  model: EditableModel,
  command: Command,
  reports: CommitReports,
): PasteOutcome {
  const plan = model.plan(command);
  switch (plan.kind) {
    case "rejected":
      return err(plan.rejection);
    case "choice":
      return err(rejectionOf("choice-required", "A choice is required"));
    case "pending":
      return err(rejectionOf("pending-validation", plan.reason));
    case "history":
      return err(rejectionOf("unsupported-command", "Not a paste"));
    case "delegated":
      return delegated(model, command, plan.excluded ?? [], reports);
    case "ready":
      break;
  }
  const created = plan.effects.created;
  const excluded = plan.effects.excluded ?? [];
  const result = model.execute(command);
  switch (result.status) {
    case "accepted":
      reports.select(created);
      return ok({ status: "accepted", created, excluded });
    case "queued":
    case "pending":
      whenSettled(result, reports, created);
      return ok({ status: "pending", created, excluded });
    case "rejected":
      return err(result.rejection);
    case "choice-required":
      return err(rejectionOf("choice-required", "A choice is required"));
    case "unverified":
      return err(rejectionOf("pending-validation", result.reason));
  }
}
