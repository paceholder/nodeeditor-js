/** Command hook: availability, reason and a run function for one toolbar button. */
import { useMemo } from "react";
import { err, type Rejection, rejectionOf } from "../core/index.js";
import type { CommandOutcome } from "../view/index.js";
import { useEditor } from "./editor-context.js";
import { useCommandAvailability } from "./use-command-availability.js";

export interface CommandState {
  readonly available: boolean;
  /** Why the command cannot run, for a tooltip; undefined while it can. */
  readonly reason: Rejection | undefined;
  /** Run the command with the arguments given to the hook. */
  run(): CommandOutcome;
}

/**
 * Everything a button needs for one command: it follows availability like
 * `useCommandAvailability` and keeps its identity while the answer is unchanged.
 */
export function useCommand(id: string, args?: unknown): CommandState {
  const view = useEditor();
  const availability = useCommandAvailability(id, args);
  return useMemo(
    () => ({
      available: availability.available,
      reason: availability.available ? undefined : availability.reason,
      run: () =>
        view
          ? view.commands.run(id, args)
          : err(rejectionOf("unsupported-command", "No editor is mounted")),
    }),
    [view, id, args, availability],
  );
}
