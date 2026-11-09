/**
 * Dry-run of a planned patch.
 *
 * Stages the patch and runs the same integrity checks and validators as a commit, but
 * writes nothing. `plan()` uses it so previews and `can()` report capability and policy
 * refusals before the caller submits.
 */

import type { Rejection } from "../../base/result.js";
import type { GraphReader } from "../../data/model/reader.js";
import { applyOp } from "../../data/patch/apply-ops.js";
import { checkIntegrity } from "../../data/patch/integrity.js";
import { createStagedState, type StagedState } from "../../data/patch/stage.js";
import type { Patch } from "../../data/patch/types.js";
import type { PatchValidator } from "../../data/patch/validator.js";

/** The graph as it would be after `patch`, or the rejection of the operation that fails. */
export function stagedAfter(
  reader: GraphReader,
  patch: Patch,
): StagedState | Rejection {
  const stage = createStagedState(reader);
  for (const op of patch.ops) {
    const refused = applyOp(stage, op);
    if (refused) return refused;
  }
  return stage;
}

const isRejection = (value: StagedState | Rejection): value is Rejection =>
  "code" in value;

export function dryRun(
  reader: GraphReader,
  patch: Patch,
  validators: readonly PatchValidator[],
): Rejection | undefined {
  const stage = stagedAfter(reader, patch);
  if (isRejection(stage)) return stage;
  const broken = checkIntegrity(stage, patch.ops);
  if (broken) return broken;
  for (const validator of validators) {
    const refused = validator.validate(stage, patch, {
      origin: "local",
      operationId: "plan",
    });
    if (refused) return refused;
  }
  return undefined;
}
