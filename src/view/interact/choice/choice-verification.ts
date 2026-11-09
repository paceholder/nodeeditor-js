/**
 * Host verdicts for a picked connection alternative. Adapts the verdict
 * driver, the model's dry-run planner and the tool context to the narrow
 * `ChoiceVerification` the choice controller needs. DOM-free.
 */
import type { Command, PlanResult } from "../../../core/index.js";
import { pendingPreview } from "../tools/connect-candidates.js";
import type { ToolContext, ToolPreview } from "../tools/tool-types.js";
import type { VerdictDriver } from "../verdicts/verdict-driver.js";
import type { ChoiceVerification } from "./connection-choice.js";

export interface ChoiceVerificationDeps {
  readonly driver: Pick<VerdictDriver, "requestCommand" | "gestureEnded">;
  readonly plan: (command: Command) => PlanResult;
  readonly context: () => ToolContext;
  readonly setPreview: (preview: ToolPreview | null) => void;
}

export function choiceVerification(
  deps: ChoiceVerificationDeps,
): ChoiceVerification {
  return {
    awaiting: (command) => deps.plan(command).kind === "pending",
    request: (command) => deps.driver.requestCommand(command),
    showPending: (request) =>
      deps.setPreview(
        pendingPreview(
          request.source,
          request.target,
          request.world,
          deps.context(),
        ),
      ),
    ended: () => deps.driver.gestureEnded(),
  };
}
