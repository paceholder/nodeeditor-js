/**
 * The type check shared by paste and duplicate: every node type must be registered and
 * creatable. Each offending type is named once, in the order the nodes list them.
 */
import { rejected } from "../../edit/commands/ops.js";
import type { PlanContext, PlanResult } from "../../edit/commands/types.js";

/** A rejection for unregistered or non-creatable types, or undefined when all are fine. */
export function checkTypes(
  nodes: readonly { readonly type: string }[],
  ctx: PlanContext,
): PlanResult | undefined {
  const types = [...new Set(nodes.map((n) => n.type))];
  const unknown = types.filter((t) => !ctx.registry.has(t));
  if (unknown.length > 0) {
    return rejected(
      "unknown-type",
      `Node type ${unknown.join(", ")} is not registered`,
      unknown,
    );
  }
  const fixed = types.filter((t) => ctx.registry.get(t)?.creatable === false);
  if (fixed.length > 0) {
    return rejected(
      "not-creatable",
      `Node type ${fixed.join(", ")} cannot be created`,
      fixed,
    );
  }
  return undefined;
}
