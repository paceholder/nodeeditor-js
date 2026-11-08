/** Selection hook: the selected keys and the primary one, stable while unchanged. */
import { useMemo } from "react";
import type { SelectionKey } from "../view/index.js";
import { useEditor } from "./editor-context.js";
import { useExternalValue } from "./use-external-value.js";

export interface SelectionSnapshot {
  readonly keys: readonly SelectionKey[];
  readonly primary: SelectionKey | undefined;
}

const NONE: SelectionSnapshot = { keys: [], primary: undefined };

const same = (a: SelectionSnapshot, b: SelectionSnapshot): boolean =>
  a.primary === b.primary &&
  a.keys.length === b.keys.length &&
  a.keys.every((k, i) => k === b.keys[i]);

export function useSelection(): SelectionSnapshot {
  const view = useEditor();
  const subscribe = useMemo(
    () =>
      view
        ? (notify: () => void) => view.selection.on(() => notify())
        : undefined,
    [view],
  );
  const read = useMemo(
    () =>
      view
        ? () => ({
            keys: view.selection.keys(),
            primary: view.selection.primary(),
          })
        : undefined,
    [view],
  );
  return useExternalValue(subscribe, read, same, NONE);
}
