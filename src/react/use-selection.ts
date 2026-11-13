/** Selection hook: the selected entities and the primary one, stable while unchanged. */
import type { SelectionState } from "../view/index.js";
import { useEditorState } from "./use-editor-state.js";

const NONE: SelectionState = {
  nodes: [],
  connections: [],
  groups: [],
  primary: undefined,
};

const sameIds = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((id, i) => id === b[i]);

const same = (a: SelectionState, b: SelectionState): boolean =>
  a.primary?.kind === b.primary?.kind &&
  a.primary?.id === b.primary?.id &&
  sameIds(a.nodes, b.nodes) &&
  sameIds(a.connections, b.connections) &&
  sameIds(a.groups, b.groups);

const EVENTS = ["selection"] as const;
const OPTIONS = { fallback: NONE, isEqual: same };

export function useSelection(): SelectionState {
  return useEditorState((view) => view.selection.state(), EVENTS, OPTIONS);
}
