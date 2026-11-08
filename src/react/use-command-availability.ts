/** Command availability hook: a toolbar button follows a command's state and reason. */
import { useMemo } from "react";
import type { Availability } from "../core/index.js";
import { useEditorSlot } from "./editor-context.js";
import { onModelChange } from "./model-subscription.js";
import { useExternalValue } from "./use-external-value.js";

const UNAVAILABLE: Availability = {
  available: false,
  reason: {
    code: "unsupported-command",
    message: "No editor is mounted",
    entities: [],
  },
};

const sameAvailability = (a: Availability, b: Availability): boolean => {
  if (a.available || b.available) return a.available === b.available;
  return (
    a.reason.code === b.reason.code &&
    a.reason.message === b.reason.message &&
    a.reason.entities.join("\n") === b.reason.entities.join("\n")
  );
};

/**
 * Whether the command can run now, re-read on every selection, model, history and lock
 * change. The result keeps its identity while availability and reason are unchanged.
 */
export function useCommandAvailability(
  id: string,
  args?: unknown,
): Availability {
  const { view, model } = useEditorSlot();
  const subscribe = useMemo(
    () =>
      view
        ? (notify: () => void) => {
            const offs = [
              view.selection.on(() => notify()),
              view.on("lock", () => notify()),
              onModelChange(model, notify),
            ];
            return () => {
              for (const off of offs) off();
            };
          }
        : undefined,
    [view, model],
  );
  const read = useMemo(
    () => (view ? () => view.commands.availability(id, args) : undefined),
    [view, id, args],
  );
  return useExternalValue(subscribe, read, sameAvailability, UNAVAILABLE);
}
