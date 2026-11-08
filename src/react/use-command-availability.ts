/** Command availability hook: a toolbar button follows a command's state and reason. */
import { useMemo, useRef } from "react";
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

const same = (a: Availability, b: Availability): boolean => {
  if (a.available || b.available) return a.available === b.available;
  return (
    a.reason.code === b.reason.code &&
    a.reason.message === b.reason.message &&
    a.reason.entities.join("\n") === b.reason.entities.join("\n")
  );
};

/**
 * Whether the command can run now, re-read on every selection, model and history change.
 * The result keeps its identity while availability and reason are unchanged.
 */
export function useCommandAvailability(
  id: string,
  args?: unknown,
): Availability {
  const { view, model } = useEditorSlot();
  const latest = useRef({ id, args });
  latest.current = { id, args };
  const subscribe = useMemo(
    () =>
      view
        ? (notify: () => void) => {
            const offs = [
              view.selection.on(() => notify()),
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
    () =>
      view
        ? () =>
            view.commands.availability(latest.current.id, latest.current.args)
        : undefined,
    [view],
  );
  return useExternalValue(subscribe, read, same, UNAVAILABLE);
}
