/**
 * Validator hook.
 *
 * Validators run after structural checks and before commit, against the staged result.
 * Connection policy and capability checks register here, so raw patches cannot bypass
 * them. Validators receive the whole patch and should inspect only the operations they
 * care about, keeping their cost proportional to the touched entities.
 */

import type { Rejection } from "../../base/result.js";
import type { GraphReader } from "../model/reader.js";
import type { ChangeOrigin, Patch } from "./types.js";

export interface ValidationContext {
  readonly origin: ChangeOrigin;
  readonly operationId: string;
  /** The committed graph the patch was staged on, as it was before the patch. */
  readonly before: GraphReader;
}

export interface PatchValidator {
  /** Return a rejection to refuse the patch, or undefined to accept it. */
  validate(
    staged: GraphReader,
    patch: Patch,
    context: ValidationContext,
  ): Rejection | undefined;
}
