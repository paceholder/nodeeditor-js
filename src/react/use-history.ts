/** History hook: undo and redo state with labels, for a toolbar. */
import { useMemo } from "react";
import type { HistoryState } from "../core/index.js";
import { hasHistory } from "../view/index.js";
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
  const withHistory = model && hasHistory(model) ? model : undefined;
  const subscribe = useMemo(
    () =>
      withHistory
        ? (notify: () => void) => onModelChange(withHistory, notify)
        : undefined,
    [withHistory],
  );
  const read = useMemo(
    () => (withHistory ? () => withHistory.historyState() : undefined),
    [withHistory],
  );
  return useExternalValue(subscribe, read, same, NO_HISTORY);
}
