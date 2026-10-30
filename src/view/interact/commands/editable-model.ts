/**
 * The editing surface a view needs beyond reads and change events: dry-run planning,
 * execution, capability checks and history. A `GraphModel` fits. Hosts with an external
 * adapter provide the same shape; a read-only `ViewModel` simply cannot edit.
 */
import type { GraphModel } from "../../../core/index.js";
import type { ViewModel } from "../../platform/model-binding.js";

export type EditableModel = ViewModel &
  Pick<
    GraphModel,
    "plan" | "execute" | "can" | "undo" | "redo" | "historyState"
  >;

export function isEditable(model: ViewModel): model is EditableModel {
  const m = model as Partial<EditableModel>;
  return (
    typeof m.execute === "function" &&
    typeof m.plan === "function" &&
    typeof m.can === "function" &&
    typeof m.undo === "function" &&
    typeof m.redo === "function" &&
    typeof m.historyState === "function"
  );
}
