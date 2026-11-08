/** View lock hook: whether editing is locked in the mounted view. */
import { useEditorState } from "./use-editor-state.js";

const EVENTS = ["lock"] as const;
const OPTIONS = { fallback: false };

/** True while the view is locked; false before the editor mounts. Re-renders on change. */
export function useViewLocked(): boolean {
  return useEditorState((view) => view.locked, EVENTS, OPTIONS);
}
