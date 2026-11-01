/** connect, reconnect and disconnect planners (CON-04, CON-06, CON-07, CON-08). */
import type { Endpoint } from "../../data/model/records.js";
import type { PatchOp } from "../../data/patch/types.js";
import type { ConnectionProposal, PolicyOutcome } from "../policy/types.js";
import {
  present,
  ready,
  rejected,
  rejectedWith,
  removeConnectionOp,
  unknownEntity,
} from "./ops.js";
import type { PlanContext, PlannerFor, PlanResult } from "./types.js";

/** Describe a plan in a short human-readable form for choice alternatives. */
function describe(from: Endpoint, to: Endpoint): string {
  return `${from.node}.${from.port} to ${to.node}.${to.port}`;
}

function nonAccept(
  outcome: Exclude<PolicyOutcome, { kind: "accept" }>,
): PlanResult {
  switch (outcome.kind) {
    case "reject":
      return rejectedWith(outcome.reason);
    case "pending":
      return { kind: "pending", reason: outcome.reason };
    case "choice":
      return {
        kind: "choice",
        alternatives: outcome.alternatives.map(({ key, label, ...plan }) => ({
          key,
          label: label ?? describe(plan.from, plan.to),
          plan,
        })),
      };
  }
}

export const planConnect: PlannerFor<"connect"> = (command, ctx) => {
  const proposal: ConnectionProposal = {
    from: command.from,
    to: command.to,
    ...(command.connectionKind === undefined
      ? {}
      : { kind: command.connectionKind }),
    ...(command.choice === undefined ? {} : { choice: command.choice }),
  };
  const outcome = ctx.policy.evaluate(proposal, ctx.reader);
  // A named alternative must resolve; asking again would loop (CON-04).
  if (outcome.kind === "choice" && command.choice !== undefined) {
    return rejected(
      "choice-required",
      `The policy did not resolve the chosen alternative "${command.choice}"`,
    );
  }
  if (outcome.kind !== "accept") return nonAccept(outcome);
  const { plan } = outcome;
  const ops: PatchOp[] = [
    ...plan.auxiliary,
    {
      op: "add",
      entity: "connection",
      record: {
        id: ctx.ids.connection(),
        kind: plan.connectionKind,
        from: plan.from,
        to: plan.to,
      },
    },
  ];
  return ready("Connect", ops, ctx.ids);
};

/** Move one end of an existing connection; the connection keeps its ID (CON-08). */
export const planReconnect: PlannerFor<"reconnect"> = (command, ctx) => {
  const existing = ctx.reader.getConnection(command.connection);
  if (!existing) return unknownEntity(command.connection);
  const proposal: ConnectionProposal = {
    from: command.end === "from" ? command.target : existing.from,
    to: command.end === "to" ? command.target : existing.to,
    kind: existing.kind,
    replacing: existing.id,
  };
  const outcome = ctx.policy.evaluate(proposal, ctx.reader);
  if (outcome.kind !== "accept") return nonAccept(outcome);
  const { plan } = outcome;
  const fields: Extract<
    PatchOp,
    { op: "update"; entity: "connection" }
  >["fields"] = {
    ...(plan.from.port === existing.from.port
      ? {}
      : { from: { old: existing.from, new: plan.from } }),
    ...(plan.to.port === existing.to.port
      ? {}
      : { to: { old: existing.to, new: plan.to } }),
    ...(plan.connectionKind === existing.kind
      ? {}
      : { kind: { old: existing.kind, new: plan.connectionKind } }),
  };
  const ops: PatchOp[] = [
    ...plan.auxiliary,
    ...(Object.keys(fields).length === 0
      ? []
      : [
          {
            op: "update",
            entity: "connection",
            id: existing.id,
            fields,
          } as const,
        ]),
  ];
  return ready("Reconnect", ops, ctx.ids);
};

export const planDisconnect: PlannerFor<"disconnect"> = (
  command,
  ctx: PlanContext,
) => {
  if (!ctx.reader.getConnection(command.connection)) {
    return unknownEntity(command.connection);
  }
  return ready(
    "Disconnect",
    present([removeConnectionOp(ctx.reader, command.connection)]),
    ctx.ids,
  );
};
