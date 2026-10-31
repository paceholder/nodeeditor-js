/**
 * External connections on paste.
 *
 * By default none is re-created and each is reported with reason `external`. With
 * `preserve`, each is re-created between the remapped inside endpoint and the original
 * outside endpoint, when that endpoint still exists in the target graph and the
 * connection policy accepts it against the graph plus the paste. Otherwise it is
 * reported with `endpoint-missing` or the policy's code. Accepted connections join the
 * paste's patch, so they share its single history entry.
 */
import type { Endpoint } from "../../data/model/records.js";
import { applyOp } from "../../data/patch/apply-ops.js";
import { createStagedState } from "../../data/patch/stage.js";
import type { PatchOp } from "../../data/patch/types.js";
import type {
  ExcludedReference,
  ExternalHandling,
  PlanContext,
} from "../../edit/commands/types.js";
import type { PolicyOutcome } from "../../edit/policy/types.js";
import type { EndpointSnapshot } from "../snapshot/snapshot-types.js";
import type { ExternalConnection } from "./fragment-types.js";
import { type IdMaps, remapEndpoint } from "./remap.js";

export interface ExternalOutcome {
  readonly ops: readonly PatchOp[];
  readonly excluded: readonly ExcludedReference[];
}

type Side =
  | { readonly kind: "inside"; readonly end: Endpoint }
  | { readonly kind: "outside"; readonly end: Endpoint | undefined };

function side(end: EndpointSnapshot, maps: IdMaps, ctx: PlanContext): Side {
  const inside = remapEndpoint(end, maps);
  if (inside) return { kind: "inside", end: inside };
  const port = ctx.reader.getPort(end.port as Endpoint["port"]);
  return {
    kind: "outside",
    end:
      port && port.node === end.node
        ? { node: port.node, port: port.id }
        : undefined,
  };
}

function refusalCode(outcome: Exclude<PolicyOutcome, { kind: "accept" }>) {
  switch (outcome.kind) {
    case "reject":
      return outcome.reason.code;
    case "choice":
      return "choice-required" as const;
    case "pending":
      return "pending-validation" as const;
  }
}

export function planExternal(
  external: readonly ExternalConnection[],
  handling: ExternalHandling,
  maps: IdMaps,
  pasted: readonly PatchOp[],
  ctx: PlanContext,
): ExternalOutcome {
  const excluded: ExcludedReference[] = [];
  const ops: PatchOp[] = [];
  const exclude = (
    c: ExternalConnection,
    reason: ExcludedReference["reason"],
  ) =>
    excluded.push({
      connection: c.id as ExcludedReference["connection"],
      reason,
    });
  if (handling === "exclude") {
    for (const c of external) exclude(c, "external");
    return { ops, excluded };
  }
  // The policy judges each connection against the graph plus everything pasted so far.
  const stage = createStagedState(ctx.reader);
  for (const op of pasted) applyOp(stage, op);
  for (const c of external) {
    const from = side(c.from, maps, ctx);
    const to = side(c.to, maps, ctx);
    if (from.kind === "outside" && to.kind === "outside") {
      exclude(c, "external");
      continue;
    }
    if (!from.end || !to.end) {
      exclude(c, "endpoint-missing");
      continue;
    }
    const outcome = ctx.policy.evaluate(
      { from: from.end, to: to.end, ...(c.kind ? { kind: c.kind } : {}) },
      stage,
    );
    if (outcome.kind !== "accept") {
      exclude(c, refusalCode(outcome));
      continue;
    }
    const { plan } = outcome;
    const add: PatchOp = {
      op: "add",
      entity: "connection",
      record: {
        id: ctx.ids.connection(),
        kind: plan.connectionKind,
        from: plan.from,
        to: plan.to,
      },
    };
    const these = [...plan.auxiliary, add];
    const refused = these.map((op) => applyOp(stage, op)).find((r) => r);
    if (refused) {
      exclude(c, refused.code);
      continue;
    }
    ops.push(...these);
  }
  return { ops, excluded };
}
