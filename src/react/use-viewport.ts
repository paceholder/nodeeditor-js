/** Viewport hook: re-renders at most once per frame while the view moves. */
import { useMemo } from "react";
import { DEFAULT_VIEWPORT, type Viewport } from "../core/index.js";
import { useEditor } from "./editor-context.js";
import { useExternalValue } from "./use-external-value.js";

const same = (a: Viewport, b: Viewport): boolean =>
  a.zoom === b.zoom && a.panX === b.panX && a.panY === b.panY;

export function useViewport(): Viewport {
  const view = useEditor();
  const subscribe = useMemo(
    () =>
      view
        ? (notify: () => void) => view.viewport.on(() => notify())
        : undefined,
    [view],
  );
  const read = useMemo(
    () => (view ? () => view.viewport.get() : undefined),
    [view],
  );
  return useExternalValue(subscribe, read, same, DEFAULT_VIEWPORT);
}
