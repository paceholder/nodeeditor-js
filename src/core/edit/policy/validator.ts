/**
 * Commit-time connection revalidation.
 *
 * Re-evaluates the policy against the staged post-patch state for every connection the
 * patch adds, re-points, or leaves attached to a port whose type or direction changed.
 * Commands, raw patches and undo all pass through here, so no route bypasses the policy.
 * External-origin patches are skipped: their authority has already decided. A connection
 * whose host verdict is missing or pending is refused (`pending-validation`), except for
 * undo and redo, which restore a state that was accepted before; a cached rejection still
 * applies to them.
 */
import type { ConnectionId } from "../../base/ids/ids.js";
import { type Rejection, rejectionOf } from "../../base/result.js";
import type { GraphReader } from "../../data/model/reader.js";
import type { ConnectionRecord } from "../../data/model/records.js";
import type { PatchOp } from "../../data/patch/types.js";
import type { PatchValidator } from "../../data/patch/validator.js";
import { hideConnection } from "./hide-connection.js";
import type { ConnectionPolicy } from "./types.js";
import type { VerdictProposal } from "./verdict-types.js";

/** Why a stored connection is not acceptable, or undefined if the policy accepts it. */
export function revalidate(
  policy: ConnectionPolicy,
  graph: GraphReader,
  connection: ConnectionRecord,
): Rejection | undefined {
  const outcome = policy.evaluate(
    { from: connection.from, to: connection.to, kind: connection.kind },
    hideConnection(graph, connection.id),
  );
  switch (outcome.kind) {
    case "reject":
      return outcome.reason;
    case "choice":
      return rejectionOf(
        "choice-required",
        `Connection ${connection.id} needs a choice between ${outcome.alternatives.length} plans`,
        [connection.id],
      );
    case "pending":
      return rejectionOf("pending-validation", outcome.reason, [connection.id]);
    case "accept": {
      const { from, to } = outcome.plan;
      const same =
        from.port === connection.from.port && to.port === connection.to.port;
      return same
        ? undefined
        : rejectionOf(
            "direction-mismatch",
            `Connection ${connection.id} is not in the policy's normalized orientation`,
            [connection.id],
          );
    }
  }
}

function connectionsToCheck(
  staged: GraphReader,
  ops: readonly PatchOp[],
): readonly ConnectionRecord[] {
  const found = new Map<ConnectionId, ConnectionRecord>();
  const take = (c: ConnectionRecord | undefined) => {
    if (c && !found.has(c.id)) found.set(c.id, c);
  };
  for (const op of ops) {
    if (op.entity === "connection") {
      if (op.op === "add") take(staged.getConnection(op.record.id));
      else if (op.op === "update" && (op.fields.from || op.fields.to))
        take(staged.getConnection(op.id));
    } else if (
      op.entity === "port" &&
      op.op === "update" &&
      (op.fields.typeKey || op.fields.direction)
    ) {
      for (const c of staged.connectionsOfPort(op.id)) take(c);
    }
  }
  return [...found.values()];
}

/**
 * The connections among the patch's that still lack a host verdict, as the plans the host
 * would be asked about. Paste and duplicate use it to tell the caller what to verify before
 * repeating the command; their connections do not exist yet, so only the staged graph can
 * name them.
 */
export function proposalsAwaitingVerdict(
  policy: ConnectionPolicy,
  staged: GraphReader,
  ops: readonly PatchOp[],
): readonly VerdictProposal[] {
  const waiting: VerdictProposal[] = [];
  for (const c of connectionsToCheck(staged, ops)) {
    const outcome = policy.evaluate(
      { from: c.from, to: c.to, kind: c.kind },
      hideConnection(staged, c.id),
    );
    if (outcome.kind !== "pending") continue;
    const plan = outcome.plan;
    waiting.push(
      plan
        ? { from: plan.from, to: plan.to, kind: plan.connectionKind }
        : { from: c.from, to: c.to, kind: c.kind },
    );
  }
  return waiting;
}

export function createPolicyValidator(
  policy: ConnectionPolicy,
): PatchValidator {
  return {
    validate(staged, patch, context) {
      if (context.origin === "external") return undefined;
      for (const c of connectionsToCheck(staged, patch.ops)) {
        const refused = revalidate(policy, staged, c);
        if (!refused) continue;
        const restoring =
          context.origin === "undo" || context.origin === "redo";
        if (restoring && refused.code === "pending-validation") continue;
        return refused;
      }
      return undefined;
    },
  };
}
