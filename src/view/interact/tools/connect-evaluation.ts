/**
 * Maps a planner verdict for a connect proposal to a presentation state (PRT-06, D7).
 * The policy decides; this only names the outcome so previews can draw it.
 */
import type { Endpoint, GraphReader, PlanResult } from "../../../core/index.js";
import type { ConnectionEvaluation } from "./tool-types.js";

export const NO_MODEL_EVALUATION: ConnectionEvaluation = {
  state: "unavailable",
  occupiedMark: false,
  reason: "No editable model is bound",
  code: undefined,
};

export function evaluationOf(
  plan: PlanResult,
  target: Endpoint,
  reader: GraphReader,
): ConnectionEvaluation {
  switch (plan.kind) {
    case "ready":
      return {
        state: "compatible",
        occupiedMark: reader.connectionsOfPort(target.port).length > 0,
        reason: undefined,
        code: undefined,
      };
    case "rejected": {
      const { code, message } = plan.error;
      const state =
        code === "capacity-exhausted"
          ? "occupied"
          : code === "capability-denied"
            ? "unavailable"
            : "incompatible";
      return { state, occupiedMark: false, reason: message, code };
    }
    case "pending":
      return pending(plan.reason);
    case "choice":
      // Choosing between alternatives needs UI a later change adds; release does nothing.
      return pending("Several connections are possible; a choice is required");
    case "history":
      return { ...pending(undefined), state: "incompatible" };
  }
}

function pending(reason: string | undefined): ConnectionEvaluation {
  return { state: "pending", occupiedMark: false, reason, code: undefined };
}
