/**
 * Local undo/redo stacks.
 *
 * One entry per recorded submission. Undo applies the entry's inverse, redo re-applies its
 * patch; the adapter does the applying and tells the history the outcome. A new recorded
 * edit clears the redo stack.
 *
 * When an undo (or redo) is rejected, its entry can no longer be applied, and every entry
 * under it was recorded against the state that entry would have restored. So the adapter
 * drops that whole stack, keeping the reason for `state()`; the other stack is kept, since
 * its entries carry their own old values and are checked when they run.
 */

import { MisuseError } from "../../base/result.js";
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
  /** Drop every entry of one stack after its top entry was rejected; `reason` says why. */
  drop(direction: "undo" | "redo", reason: string): void;
  /**
   * Take one entry out of whichever stack holds it, leaving the others (an external
   * authority refused the edit it records). False when no stack holds it.
   */
  remove(entry: HistoryEntry): boolean;
  state(): HistoryState;
  clear(): void;
}

export interface LocalHistoryOptions {
  /** Most undo entries kept; recording past it drops the oldest. Default: no limit. */
  readonly limit?: number;
}

export function createLocalHistory(
  options: LocalHistoryOptions = {},
): LocalHistory {
  const { limit } = options;
  if (limit !== undefined && !(Number.isInteger(limit) && limit > 0))
    throw new MisuseError("historyLimit must be a positive integer");
  let undoStack: HistoryEntry[] = [];
  let redoStack: HistoryEntry[] = [];
  let undoDropped: string | undefined;
  let redoDropped: string | undefined;

  return {
    record(entry) {
      undoStack.push(entry);
      if (limit !== undefined && undoStack.length > limit) undoStack.shift();
      redoStack = [];
      undoDropped = undefined;
      redoDropped = undefined;
    },
    peekUndo: () => undoStack[undoStack.length - 1],
    peekRedo: () => redoStack[redoStack.length - 1],
    completeUndo() {
      const entry = undoStack.pop();
      if (entry) {
        redoStack.push(entry);
        redoDropped = undefined;
      }
    },
    completeRedo() {
      const entry = redoStack.pop();
      if (entry) {
        undoStack.push(entry);
        undoDropped = undefined;
      }
    },
    drop(direction, reason) {
      if (direction === "undo") {
        undoStack = [];
        undoDropped = reason;
      } else {
        redoStack = [];
        redoDropped = reason;
      }
    },
    remove(entry) {
      const before = undoStack.length + redoStack.length;
      undoStack = undoStack.filter((e) => e !== entry);
      redoStack = redoStack.filter((e) => e !== entry);
      return undoStack.length + redoStack.length < before;
    },
    state() {
      const undo = undoStack[undoStack.length - 1];
      const redo = redoStack[redoStack.length - 1];
      return {
        canUndo: undo !== undefined,
        canRedo: redo !== undefined,
        ...(undo
          ? { undoLabel: undo.label }
          : { undoReason: undoDropped ?? "Nothing to undo" }),
        ...(redo
          ? { redoLabel: redo.label }
          : { redoReason: redoDropped ?? "Nothing to redo" }),
      };
    },
    clear() {
      undoStack = [];
      redoStack = [];
      undoDropped = undefined;
      redoDropped = undefined;
    },
  };
}
