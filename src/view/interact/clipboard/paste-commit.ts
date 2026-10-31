/**
 * Execute a paste or duplicate and select what it created (D9).
 *
 * The model plans once for the report (created IDs, excluded references) and then
 * executes the same command; IDs are deterministic for an unchanged cursor, so both see
 * the same patch. An accepted result selects the new nodes and connections at once; a
 * pending one (external authority) selects them when it settles accepted.
 */
import {
  type ChangedIds,
  type Command,
  err,
  ok,
  rejectionOf,
} from "../../../core/index.js";
import type { EditableModel } from "../commands/editable-model.js";
import type { PasteOutcome } from "./clipboard-types.js";

export function executeAndSelect(
  model: EditableModel,
  command: Command,
  select: (created: ChangedIds) => void,
): PasteOutcome {
  const plan = model.plan(command);
  switch (plan.kind) {
    case "rejected":
      return err(plan.error);
    case "choice":
      return err(rejectionOf("choice-required", "A choice is required"));
    case "pending":
      return err(rejectionOf("pending-validation", plan.reason));
    case "history":
      return err(rejectionOf("unsupported-command", "Not a paste"));
    case "ready":
      break;
  }
  const created = plan.effects.created;
  const excluded = plan.effects.excluded ?? [];
  const result = model.execute(command);
  switch (result.status) {
    case "accepted":
      select(created);
      return ok({ status: "accepted", created, excluded });
    case "queued":
    case "pending":
      void result.settled.then((settled) => {
        if (settled.status === "accepted") select(created);
      });
      return ok({ status: "pending", created, excluded });
    case "rejected":
      return err(result.error);
    case "choice-required":
      return err(rejectionOf("choice-required", "A choice is required"));
    case "unverified":
      return err(rejectionOf("pending-validation", result.reason));
  }
}
