/**
 * Capability resolution (MOD-11).
 *
 * The first layer with an opinion wins: read-only mode, host policy, record override,
 * type default, library default. The library default denies only `resize`, so resizing
 * is opt-in per node type (NOD-04a); every other action is allowed when nobody has an
 * opinion. View-local restrictions may narrow this later but never relax it.
 */

import {
  ok,
  type Rejection,
  type Result,
  rejectionOf,
} from "../../base/result.js";
import type { GraphReader } from "../../data/model/reader.js";
import type {
  CapabilityAction,
  CapabilityOverrides,
  NodeRecord,
} from "../../data/model/records.js";
import type { CapabilityContext } from "./types.js";

/** The last layer: resizing needs an opt-in, every other action is allowed. */
const LIBRARY_DEFAULTS: CapabilityOverrides = { resize: false };

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
    LIBRARY_DEFAULTS[action],
  ];
  const decision = layers.find((v) => v !== undefined);
  return decision === false
    ? { ok: false, error: denied(action, node) }
    : ok(undefined);
}
