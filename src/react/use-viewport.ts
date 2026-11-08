/** Viewport hook: re-renders at most once per frame while the view moves. */
import { DEFAULT_VIEWPORT, type Viewport } from "../core/index.js";
import { useEditorState } from "./use-editor-state.js";

const same = (a: Viewport, b: Viewport): boolean =>
  a.zoom === b.zoom && a.panX === b.panX && a.panY === b.panY;

const EVENTS = ["viewport"] as const;
const OPTIONS = { fallback: DEFAULT_VIEWPORT, isEqual: same };

export function useViewport(): Viewport {
  return useEditorState((view) => view.viewport.get(), EVENTS, OPTIONS);
}
