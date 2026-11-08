/** View lock hook: whether editing is locked in the mounted view. */
import { useMemo } from "react";
import { useEditor } from "./editor-context.js";
import { useExternalValue } from "./use-external-value.js";

const same = (a: boolean, b: boolean): boolean => a === b;

/** True while the view is locked; false before the editor mounts. Re-renders on change. */
export function useViewLocked(): boolean {
  const view = useEditor();
  const subscribe = useMemo(
    () =>
      view
        ? (notify: () => void) => view.on("lock", () => notify())
        : undefined,
    [view],
  );
  const read = useMemo(() => (view ? () => view.locked : undefined), [view]);
  return useExternalValue<boolean>(subscribe, read, same, false);
}
