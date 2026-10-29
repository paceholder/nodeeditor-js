/**
 * Local undo/redo stacks (TXN-07, PAT-08).
 *
 * One entry per recorded submission. Undo applies the entry's inverse, redo re-applies its
 * patch; the adapter does the applying and tells the history when it succeeded, so a
 * rejected undo leaves both stacks unchanged. A new recorded edit clears the redo stack.
 */

import type { Patch } from "../../data/patch/types.js";
import type { HistoryState } from "../adapter/types.js";

export interface HistoryEntry {
  readonly label: string;
  /** The applied patch (adds carry `seq`). */
  readonly patch: Patch;
  readonly inverse: Patch;
}

export interface LocalHistory {
  /** Push a new entry and invalidate redo. */
  record(entry: HistoryEntry): void;
  peekUndo(): HistoryEntry | undefined;
  peekRedo(): HistoryEntry | undefined;
  /** Move the top undo entry to the redo stack after its inverse was applied. */
  completeUndo(): void;
  /** Move the top redo entry back to the undo stack after it was re-applied. */
  completeRedo(): void;
  state(): HistoryState;
  clear(): void;
}

export function createLocalHistory(): LocalHistory {
  let undoStack: HistoryEntry[] = [];
  let redoStack: HistoryEntry[] = [];

  return {
    record(entry) {
      undoStack.push(entry);
      redoStack = [];
    },
    peekUndo: () => undoStack[undoStack.length - 1],
    peekRedo: () => redoStack[redoStack.length - 1],
    completeUndo() {
      const entry = undoStack.pop();
      if (entry) redoStack.push(entry);
    },
    completeRedo() {
      const entry = redoStack.pop();
      if (entry) undoStack.push(entry);
    },
    state() {
      const undo = undoStack[undoStack.length - 1];
      const redo = redoStack[redoStack.length - 1];
      return {
        canUndo: undo !== undefined,
        canRedo: redo !== undefined,
        ...(undo
          ? { undoLabel: undo.label }
          : { undoReason: "Nothing to undo" }),
        ...(redo
          ? { redoLabel: redo.label }
          : { redoReason: "Nothing to redo" }),
      };
    },
    clear() {
      undoStack = [];
      redoStack = [];
    },
  };
}
