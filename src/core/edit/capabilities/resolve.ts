/**
 * Capability resolution.
 *
 * The first layer with an opinion wins: read-only mode, host policy, record override,
 * type default. If nobody has an opinion the action is allowed. View-local restrictions
 * may narrow this later but never relax it.
 */

import {
  ok,
  type Rejection,
  type Result,
  rejectionOf,
} from "../../base/result.js";
import type { GraphReader } from "../../data/model/reader.js";
import type { CapabilityAction, NodeRecord } from "../../data/model/records.js";
import type { CapabilityContext } from "./types.js";

export function readOnlyRejection(): Rejection {
  return rejectionOf("capability-denied", "The model is read-only");
}

function denied(action: CapabilityAction, node: NodeRecord): Rejection {
  return rejectionOf(
    "capability-denied",
    `Action "${action}" is not permitted on node ${node.id}`,
    [node.id],
  );
}

export function resolveCapability(
  action: CapabilityAction,
  node: NodeRecord,
  ctx: CapabilityContext,
  graph: GraphReader,
): Result<void> {
  if (ctx.readOnly()) return { ok: false, error: readOnlyRejection() };
  const layers = [
    ctx.policy?.decide(action, node, graph),
    node.capabilities?.[action],
    ctx.typeDefaults(node.type)?.[action],
  ];
  const decision = layers.find((v) => v !== undefined);
  return decision === false
    ? { ok: false, error: denied(action, node) }
    : ok(undefined);
}
