/**
 * The key a verdict is cached under.
 *
 * It names the connection plan the base policy produced: the two ports and the
 * connection kind. The named choice and the replaced connection of the original proposal
 * are deliberately absent. They only select which plan the policy produces, so two
 * proposals that lead to the same plan share one verdict, and commit revalidation of the
 * stored connection finds the verdict the gesture obtained.
 *
 * The ports are ordered, so an undirected pair has one key in either drawn order. A
 * directed pair is always normalized by the policy, so the order loses nothing. IDs
 * contain no whitespace, which makes a space an unambiguous separator.
 */
import type { ConnectionPlan } from "./types.js";

export type VerdictKey = string;

export function verdictKey(
  plan: Pick<ConnectionPlan, "from" | "to" | "connectionKind">,
): VerdictKey {
  const [first, second] =
    plan.from.port <= plan.to.port
      ? [plan.from.port, plan.to.port]
      : [plan.to.port, plan.from.port];
  return `${first} ${second} ${plan.connectionKind}`;
}
