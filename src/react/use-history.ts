/** History hook: undo and redo state with labels, for a toolbar. */
import { useMemo } from "react";
import type { HistoryState } from "../core/index.js";
import { useEditorSlot } from "./editor-context.js";
import { onModelChange } from "./model-subscription.js";
import { useExternalValue } from "./use-external-value.js";

const NO_HISTORY: HistoryState = { canUndo: false, canRedo: false };

const same = (a: HistoryState, b: HistoryState): boolean =>
  a.canUndo === b.canUndo &&
  a.canRedo === b.canRedo &&
  a.undoLabel === b.undoLabel &&
  a.redoLabel === b.redoLabel &&
  a.undoReason === b.undoReason &&
  a.redoReason === b.redoReason;

/** The model's history state; an inert "nothing to undo" state for a read-only model. */
export function useHistory(): HistoryState {
  const { model } = useEditorSlot();
  const historyState = (
    model as { historyState?: () => HistoryState } | undefined
  )?.historyState;
  const subscribe = useMemo(
    () =>
      model && historyState
        ? (notify: () => void) => onModelChange(model, notify)
        : undefined,
    [model, historyState],
  );
  const read = useMemo(
    () => (model && historyState ? () => historyState.call(model) : undefined),
    [model, historyState],
  );
  return useExternalValue(subscribe, read, same, NO_HISTORY);
}
