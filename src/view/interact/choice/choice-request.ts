/**
 * The target's policy alternatives as chooser options (D2): same order,
 * same keys, so the key a host returns is the one the policy accepts back.
 */
import type { ChoiceAlternative } from "../../../core/index.js";
import type { ConnectionChoiceOption } from "./choice-types.js";

export function choiceOptions(
  alternatives: readonly ChoiceAlternative[],
): ConnectionChoiceOption[] {
  return alternatives.map(({ key, label, plan }) => ({
    key,
    connectionKind: plan.connectionKind,
    label,
    plan,
  }));
}
