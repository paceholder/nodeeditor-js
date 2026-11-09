/**
 * The policy wrapper that reads the verdict cache.
 *
 * The base policy keeps the cheap structural rules (direction, capacity, types) and answers
 * first. Only a structurally acceptable plan reaches the cache: a current valid verdict
 * returns the base outcome, a current invalid one rejects with the host's reason, and
 * anything else is `pending`. Reading is all this does. It never starts a request, so
 * evaluating, `can`, availability checks, dry runs and undo never reach the network.
 */
import type { ConnectionPolicy } from "./types.js";
import type { VerdictCache } from "./verdict-cache.js";

export function createValidatedPolicy(
  base: ConnectionPolicy,
  cache: Pick<VerdictCache, "lookup">,
): ConnectionPolicy {
  return {
    evaluate(proposal, graph) {
      const outcome = base.evaluate(proposal, graph);
      if (outcome.kind !== "accept") return outcome;
      const found = cache.lookup(outcome.plan);
      switch (found.kind) {
        case "valid":
          return outcome;
        case "invalid":
          return { kind: "reject", reason: found.reason };
        case "pending":
        case "unknown":
          return {
            kind: "pending",
            reason: "Waiting for the host to validate the connection",
            plan: outcome.plan,
          };
      }
    },
  };
}
